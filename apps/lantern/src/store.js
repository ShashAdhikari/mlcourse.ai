// Lantern — durable storage.
//
// SQLite via node:sqlite (built in, no dependency). WAL mode with synchronous
// FULL: a check-in that the user has been told was recorded must survive the
// machine losing power a millisecond later.
//
// The deliveries table is the idempotency boundary for the whole system. Every
// notification has a deterministic key from the state machine and the key is
// the primary key here, so "insert the intent, then send" makes duplicate
// delivery impossible even across crashes and overlapping schedulers.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS watches (
  id          TEXT PRIMARY KEY,
  config      TEXT NOT NULL,
  state       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS deliveries (
  key          TEXT PRIMARY KEY,
  watch_id     TEXT NOT NULL,
  kind         TEXT NOT NULL,
  channel      TEXT NOT NULL,
  address      TEXT NOT NULL,
  subject      TEXT NOT NULL,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL,          -- pending | sending | sent | failed
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  next_try_at  INTEGER NOT NULL,
  claimed_at   INTEGER,
  sent_at      INTEGER,
  last_error   TEXT
);
CREATE INDEX IF NOT EXISTS deliveries_pending
  ON deliveries (status, next_try_at);
CREATE INDEX IF NOT EXISTS deliveries_watch
  ON deliveries (watch_id, created_at);

-- Append-only audit trail. If a family ever asks "what did this thing do and
-- when", the answer has to be complete and unedited.
CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  watch_id  TEXT NOT NULL,
  type      TEXT NOT NULL,
  at        INTEGER NOT NULL,
  detail    TEXT
);
CREATE INDEX IF NOT EXISTS events_watch ON events (watch_id, at);

CREATE TABLE IF NOT EXISTS system (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
`;

export class Store {
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL;');
    // Durability over speed. This system writes a handful of rows a day; there
    // is no throughput argument for risking a lost check-in.
    this.db.exec('PRAGMA synchronous = FULL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
  }

  close() { this.db.close(); }

  // --- watches --------------------------------------------------------------

  putWatch(config, state, now) {
    this.db.prepare(`
      INSERT INTO watches (id, config, state, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET config = excluded.config,
                                    state = excluded.state,
                                    updated_at = excluded.updated_at
    `).run(config.id, JSON.stringify(config), JSON.stringify(state), now);
  }

  putState(id, state, now) {
    const r = this.db.prepare('UPDATE watches SET state = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(state), now, id);
    return r.changes > 0;
  }

  getWatch(id) {
    const row = this.db.prepare('SELECT * FROM watches WHERE id = ?').get(id);
    return row ? { config: JSON.parse(row.config), state: JSON.parse(row.state), updatedAt: row.updated_at } : null;
  }

  listWatches() {
    return this.db.prepare('SELECT * FROM watches ORDER BY id').all()
      .map((row) => ({ config: JSON.parse(row.config), state: JSON.parse(row.state), updatedAt: row.updated_at }));
  }

  deleteWatch(id) {
    return this.db.prepare('DELETE FROM watches WHERE id = ?').run(id).changes > 0;
  }

  // --- deliveries -----------------------------------------------------------

  /**
   * Record the intent to send. Returns false if this exact notification has
   * already been queued or sent — the guarantee that nobody is alerted twice
   * for one alarm, no matter how often a tick is replayed.
   */
  enqueueDelivery({ key, watchId, kind, channel, address, subject, body }, now) {
    const r = this.db.prepare(`
      INSERT OR IGNORE INTO deliveries
        (key, watch_id, kind, channel, address, subject, body, status, attempts, created_at, next_try_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
    `).run(key, watchId, kind, channel, address, subject, body, now, now);
    return r.changes > 0;
  }

  /** Pending deliveries whose retry time has arrived, oldest first. */
  dueDeliveries(now, limit = 100) {
    return this.db.prepare(`
      SELECT * FROM deliveries
      WHERE status = 'pending' AND next_try_at <= ?
      ORDER BY created_at LIMIT ?
    `).all(now, limit);
  }

  /**
   * Atomically take ownership of a delivery before sending it.
   *
   * Queueing is deduplicated by the primary key, but that alone does not stop
   * two schedulers — or one scheduler restarted mid-flush — from both reading
   * the same pending row and both sending it. This compare-and-swap is what
   * makes "at most one send in flight" true: only the caller whose UPDATE
   * changed a row may send.
   *
   * @returns {boolean} true if this caller now owns the delivery
   */
  claimDelivery(key, now) {
    const r = this.db.prepare(`
      UPDATE deliveries SET status = 'sending', claimed_at = ?
      WHERE key = ? AND status = 'pending'
    `).run(now, key);
    return r.changes === 1;
  }

  /** Hand a claimed delivery back, e.g. when the attempt failed. */
  releaseDelivery(key) {
    this.db.prepare("UPDATE deliveries SET status = 'pending', claimed_at = NULL WHERE key = ? AND status = 'sending'")
      .run(key);
  }

  /**
   * Recover deliveries whose sender died mid-flight. Re-sending a message is
   * survivable; never sending it is not, so a stuck claim always returns to
   * the queue rather than being written off.
   */
  reclaimStuckDeliveries(now, staleMs) {
    return this.db.prepare(`
      UPDATE deliveries SET status = 'pending', claimed_at = NULL
      WHERE status = 'sending' AND claimed_at IS NOT NULL AND claimed_at <= ?
    `).run(now - staleMs).changes;
  }

  markSent(key, now) {
    this.db.prepare("UPDATE deliveries SET status = 'sent', sent_at = ?, claimed_at = NULL, attempts = attempts + 1, last_error = NULL WHERE key = ?")
      .run(now, key);
  }

  markAttemptFailed(key, error, nextTryAt, now, maxAttempts) {
    const row = this.db.prepare('SELECT attempts FROM deliveries WHERE key = ?').get(key);
    const attempts = (row?.attempts ?? 0) + 1;
    const status = attempts >= maxAttempts ? 'failed' : 'pending';
    this.db.prepare('UPDATE deliveries SET status = ?, attempts = ?, next_try_at = ?, claimed_at = NULL, last_error = ? WHERE key = ?')
      .run(status, attempts, nextTryAt, String(error).slice(0, 500), key);
    return status;
  }

  getDelivery(key) {
    return this.db.prepare('SELECT * FROM deliveries WHERE key = ?').get(key) ?? null;
  }

  deliveriesFor(watchId, limit = 50) {
    return this.db.prepare('SELECT * FROM deliveries WHERE watch_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(watchId, limit);
  }

  /** Deliveries that gave up entirely — a silent failure the operator must see. */
  failedDeliveries(since = 0) {
    return this.db.prepare("SELECT * FROM deliveries WHERE status = 'failed' AND created_at >= ? ORDER BY created_at DESC")
      .all(since);
  }

  countByStatus() {
    const rows = this.db.prepare('SELECT status, COUNT(*) AS n FROM deliveries GROUP BY status').all();
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }

  // --- events ---------------------------------------------------------------

  appendEvent(watchId, type, at, detail = null) {
    this.db.prepare('INSERT INTO events (watch_id, type, at, detail) VALUES (?, ?, ?, ?)')
      .run(watchId, type, at, detail === null ? null : JSON.stringify(detail));
  }

  eventsFor(watchId, limit = 100) {
    return this.db.prepare('SELECT * FROM events WHERE watch_id = ? ORDER BY at DESC, id DESC LIMIT ?')
      .all(watchId, limit)
      .map((e) => ({ ...e, detail: e.detail ? JSON.parse(e.detail) : null }));
  }

  // --- system key/value -----------------------------------------------------

  setSystem(key, value) {
    this.db.prepare(`
      INSERT INTO system (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, JSON.stringify(value));
  }

  getSystem(key, fallback = null) {
    const row = this.db.prepare('SELECT value FROM system WHERE key = ?').get(key);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch { return fallback; }
  }

  /** Run a function inside a transaction, rolling back on any throw. */
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch { /* already rolled back */ }
      throw err;
    }
  }
}
