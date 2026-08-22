import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { normalizeConfig } from '../src/model.js';
import { initState } from '../src/machine.js';

const T0 = 1_800_000_000_000;

const cfg = () => normalizeConfig({
  id: 'w', name: 'Ada', timezone: 'UTC',
  self: { channel: 'console', address: 'ada' },
  contacts: [{ id: 'c1', name: 'Bea', channel: 'console', address: 'bea', tier: 1 }],
});

const delivery = (key, over = {}) => ({
  key, watchId: 'w', kind: 'alert', channel: 'console',
  address: 'bea', subject: 's', body: 'b', ...over,
});

test('watches round-trip through storage unchanged', () => {
  const s = new Store(':memory:');
  const c = cfg();
  const st = initState(T0);
  s.putWatch(c, st, T0);
  const got = s.getWatch('w');
  assert.deepEqual(got.config, JSON.parse(JSON.stringify(c)));
  assert.deepEqual(got.state, st);
  assert.equal(s.getWatch('missing'), null);
});

test('putState updates only the state and reports whether the watch existed', () => {
  const s = new Store(':memory:');
  s.putWatch(cfg(), initState(T0), T0);
  assert.equal(s.putState('w', { ...initState(T0), phase: 'ok' }, T0 + 1), true);
  assert.equal(s.getWatch('w').state.phase, 'ok');
  assert.equal(s.putState('nope', {}, T0), false);
});

test('enqueueDelivery is idempotent on its key', () => {
  const s = new Store(':memory:');
  assert.equal(s.enqueueDelivery(delivery('k1'), T0), true);
  assert.equal(s.enqueueDelivery(delivery('k1'), T0), false, 'a repeat is dropped');
  assert.equal(s.enqueueDelivery(delivery('k1', { body: 'different' }), T0), false);
  assert.equal(s.dueDeliveries(T0).length, 1);
  assert.equal(s.getDelivery('k1').body, 'b', 'the original wins');
});

test('only one caller can claim a delivery', () => {
  // This is what prevents two schedulers sending the same alert. Without the
  // compare-and-swap, both would read the row as pending and both would send.
  const s = new Store(':memory:');
  s.enqueueDelivery(delivery('k1'), T0);
  assert.equal(s.claimDelivery('k1', T0), true);
  assert.equal(s.claimDelivery('k1', T0), false, 'second claimant is refused');
  assert.equal(s.getDelivery('k1').status, 'sending');
});

test('a claimed delivery is no longer offered as due', () => {
  const s = new Store(':memory:');
  s.enqueueDelivery(delivery('k1'), T0);
  s.claimDelivery('k1', T0);
  assert.deepEqual(s.dueDeliveries(T0), []);
});

test('claiming is refused for sent and failed rows', () => {
  const s = new Store(':memory:');
  s.enqueueDelivery(delivery('sent'), T0);
  s.claimDelivery('sent', T0);
  s.markSent('sent', T0);
  assert.equal(s.claimDelivery('sent', T0), false);

  s.enqueueDelivery(delivery('dead'), T0);
  s.claimDelivery('dead', T0);
  s.markAttemptFailed('dead', 'nope', T0, T0, 1);
  assert.equal(s.getDelivery('dead').status, 'failed');
  assert.equal(s.claimDelivery('dead', T0), false);
});

test('a stalled claim is returned to the queue rather than lost', () => {
  const s = new Store(':memory:');
  s.enqueueDelivery(delivery('k1'), T0);
  s.claimDelivery('k1', T0);
  assert.equal(s.reclaimStuckDeliveries(T0 + 60_000, 300_000), 0, 'not stale yet');
  assert.equal(s.reclaimStuckDeliveries(T0 + 600_000, 300_000), 1);
  assert.equal(s.getDelivery('k1').status, 'pending');
  assert.equal(s.claimDelivery('k1', T0 + 600_000), true);
});

test('releasing a claim makes the delivery available again', () => {
  const s = new Store(':memory:');
  s.enqueueDelivery(delivery('k1'), T0);
  s.claimDelivery('k1', T0);
  s.releaseDelivery('k1');
  assert.equal(s.getDelivery('k1').status, 'pending');
  assert.equal(s.dueDeliveries(T0).length, 1);
});

test('failed attempts accumulate and give up at the configured limit', () => {
  const s = new Store(':memory:');
  s.enqueueDelivery(delivery('k1'), T0);
  s.claimDelivery('k1', T0);
  assert.equal(s.markAttemptFailed('k1', 'boom', T0 + 60_000, T0, 3), 'pending');
  assert.equal(s.getDelivery('k1').attempts, 1);
  s.claimDelivery('k1', T0 + 60_000);
  assert.equal(s.markAttemptFailed('k1', 'boom', T0 + 120_000, T0, 3), 'pending');
  s.claimDelivery('k1', T0 + 120_000);
  assert.equal(s.markAttemptFailed('k1', 'boom', T0 + 180_000, T0, 3), 'failed');
  assert.equal(s.failedDeliveries(0).length, 1);
});

test('backoff keeps a delivery out of the due list until its time comes', () => {
  const s = new Store(':memory:');
  s.enqueueDelivery(delivery('k1'), T0);
  s.claimDelivery('k1', T0);
  s.markAttemptFailed('k1', 'boom', T0 + 60_000, T0, 5);
  assert.deepEqual(s.dueDeliveries(T0 + 30_000), []);
  assert.equal(s.dueDeliveries(T0 + 60_000).length, 1);
});

test('events form an append-only audit trail', () => {
  const s = new Store(':memory:');
  s.appendEvent('w', 'arm', T0, { by: 'ada' });
  s.appendEvent('w', 'checkin', T0 + 1000, null);
  const events = s.eventsFor('w');
  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'checkin', 'newest first');
  assert.deepEqual(events[1].detail, { by: 'ada' });
});

test('system values round-trip and tolerate corruption', () => {
  const s = new Store(':memory:');
  s.setSystem('k', { a: 1 });
  assert.deepEqual(s.getSystem('k'), { a: 1 });
  assert.equal(s.getSystem('absent', 'fallback'), 'fallback');
  s.db.prepare('UPDATE system SET value = ? WHERE key = ?').run('{not json', 'k');
  assert.equal(s.getSystem('k', 'fallback'), 'fallback');
});

test('a transaction rolls back completely when the body throws', () => {
  const s = new Store(':memory:');
  s.putWatch(cfg(), initState(T0), T0);
  assert.throws(() => s.transaction(() => {
    s.enqueueDelivery(delivery('k1'), T0);
    s.appendEvent('w', 'partial', T0);
    throw new Error('halfway');
  }), /halfway/);
  assert.equal(s.getDelivery('k1'), null, 'the queued delivery was rolled back');
  assert.equal(s.eventsFor('w').length, 0);
});

test('state survives closing and reopening the database file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lantern-'));
  const path = join(dir, 'nested', 'lantern.db');
  try {
    const a = new Store(path);
    a.putWatch(cfg(), { ...initState(T0), phase: 'ok', deadline: T0 + 1000 }, T0);
    a.enqueueDelivery(delivery('k1'), T0);
    a.claimDelivery('k1', T0);
    a.markSent('k1', T0);
    a.close();

    const b = new Store(path);
    assert.equal(b.getWatch('w').state.deadline, T0 + 1000);
    assert.equal(b.getDelivery('k1').status, 'sent');
    b.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('countByStatus reports the delivery queue at a glance', () => {
  const s = new Store(':memory:');
  s.enqueueDelivery(delivery('a'), T0);
  s.enqueueDelivery(delivery('b'), T0);
  s.claimDelivery('a', T0);
  s.markSent('a', T0);
  assert.deepEqual(s.countByStatus(), { pending: 1, sent: 1 });
});
