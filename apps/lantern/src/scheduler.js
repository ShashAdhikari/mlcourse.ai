// Lantern — the scheduler.
//
// Turns the pure state machine into a running service: tick every watch,
// queue the resulting notifications, deliver them with retries, and watch
// itself for the failure that matters most — not running at all.
//
// The clock is injected. Every behaviour here, including a week-long outage,
// is reproducible in a test at exact instants.

import { MINUTE, HOUR } from './time.js';
import { evaluate, isAlarming, nextTransitionAt, PHASES } from './machine.js';
import { mintToken, actionUrl } from './tokens.js';
import {
  nudgeMessage, alertMessage, standDownMessage, testMessage, systemFaultMessage,
} from './messages.js';

export const HEARTBEAT_KEY = 'scheduler.heartbeat';
export const LAST_TICK_KEY = 'scheduler.lastTick';

export const SCHEDULER_DEFAULTS = Object.freeze({
  tickMs: 30 * 1000,
  maxAttempts: 5,
  // Exponential backoff between delivery attempts, in minutes.
  backoffMinutes: [1, 5, 15, 60],
  // A gap longer than this since the last tick means we were down and must
  // say so — a monitoring system that goes quiet looks identical to one where
  // nothing is wrong, which is the whole problem.
  outageThresholdMs: 10 * MINUTE,
  // How long a claimed-but-unsent delivery may sit before another scheduler
  // assumes the sender died and takes it back.
  claimTimeoutMs: 5 * MINUTE,
  // How long a check-in link stays usable.
  tokenTtlMs: 7 * 24 * HOUR,
  // Contacts are re-verified periodically so a dead phone number is found in
  // peacetime rather than during an emergency.
  contactRecheckMs: 90 * 24 * HOUR,
});

export class Scheduler {
  /**
   * @param {object} deps store, channels, clock (() => ms), baseUrl, secret,
   *   opsChannel {channel, address} for system faults, options
   */
  constructor({ store, channels, clock = () => Date.now(), baseUrl, secret, ops = null, options = {} }) {
    this.store = store;
    this.channels = channels;
    this.clock = clock;
    this.baseUrl = (baseUrl ?? 'http://localhost:8787').replace(/\/+$/, '');
    this.secret = secret;
    this.ops = ops;
    this.opts = { ...SCHEDULER_DEFAULTS, ...options };
    this.timer = null;
    this.running = false;
    this.faults = [];
  }

  // --- link building --------------------------------------------------------

  linkFor(watchId, kind, contactId, now) {
    const token = mintToken(
      { watchId, kind, contactId, issuedAt: now, ttlMs: this.opts.tokenTtlMs }, this.secret);
    return actionUrl(this.baseUrl, kind, token);
  }

  // --- turning machine actions into queued messages -------------------------

  /**
   * Queue every message an action implies. Returns the number newly queued —
   * duplicates are dropped by the store, so replaying a tick is harmless.
   */
  queueActions(config, actions, now) {
    let queued = 0;
    for (const action of actions) {
      switch (action.type) {
        case 'nudge': {
          const url = this.linkFor(config.id, 'checkin', null, now);
          const { subject, body } = nudgeMessage(config, action, url);
          queued += this.#enqueue(action.key, config.id, 'nudge', config.self.channel,
            config.self.address, subject, body, now);
          break;
        }
        case 'alert': {
          for (const contact of action.contacts) {
            const url = this.linkFor(config.id, 'resolve', contact.id, now);
            const { subject, body } = alertMessage(config, action, contact, url);
            // One delivery row per contact, so a failure to reach one person
            // never suppresses the others.
            queued += this.#enqueue(`${action.key}|${contact.id}`, config.id, 'alert',
              contact.channel, contact.address, subject, body, now);
          }
          break;
        }
        case 'standdown': {
          for (const contact of action.contacts) {
            const { subject, body } = standDownMessage(config, action, contact);
            queued += this.#enqueue(`${action.key}|${contact.id}`, config.id, 'standdown',
              contact.channel, contact.address, subject, body, now);
          }
          break;
        }
        case 'test': {
          const { subject, body } = testMessage(config, action);
          const target = action.to;
          queued += this.#enqueue(`${action.key}|${target.address}`, config.id, 'test',
            target.channel, target.address, subject, body, now);
          break;
        }
        default:
          this.#fault('unknown-action', `action type ${action.type}`, now);
      }
    }
    return queued;
  }

  #enqueue(key, watchId, kind, channel, address, subject, body, now) {
    return this.store.enqueueDelivery(
      { key, watchId, kind, channel, address, subject, body }, now) ? 1 : 0;
  }

  // --- events ---------------------------------------------------------------

  /** Apply an event to one watch, persist the new state, and queue its actions. */
  applyEvent(watchId, event, now = this.clock()) {
    const row = this.store.getWatch(watchId);
    if (!row) return { ok: false, error: 'no such watch' };
    const { config, state } = row;
    const result = evaluate(config, state, event, now);
    if (result.error) return { ok: false, error: result.error, state };

    this.store.transaction(() => {
      this.store.putState(watchId, result.state, now);
      this.store.appendEvent(watchId, event.type, now, {
        phase: result.state.phase,
        actions: result.actions.map((a) => a.type),
        by: event.by ?? event.source ?? null,
      });
      this.queueActions(config, result.actions, now);
    });

    return { ok: true, state: result.state, actions: result.actions };
  }

  // --- the tick -------------------------------------------------------------

  /**
   * Advance every watch to `now` and flush the delivery queue.
   * Safe to call at any frequency, and safe to call twice with the same clock.
   */
  async tick(now = this.clock()) {
    const outage = this.#checkForOutage(now);

    let transitions = 0;
    for (const { config, state } of this.store.listWatches()) {
      const before = state.phase;
      const result = evaluate(config, state, { type: 'tick' }, now);
      if (result.state === state && result.actions.length === 0) continue;

      this.store.transaction(() => {
        this.store.putState(config.id, result.state, now);
        if (result.state.phase !== before) {
          this.store.appendEvent(config.id, `phase:${result.state.phase}`, now,
            { from: before, overdueBy: result.state.cycleStart ? now - result.state.cycleStart : null });
        }
        this.queueActions(config, result.actions, now);
      });
      if (result.state.phase !== before || result.actions.length) transitions += 1;
    }

    const faultsBefore = this.faults.length;
    const delivered = await this.flush(now);
    // A fault raised during flush queued an operator message that flush had
    // already passed. Send it now rather than sitting on bad news for a tick.
    if (this.faults.length > faultsBefore && this.ops) {
      const extra = await this.flush(now);
      delivered.sent += extra.sent;
      delivered.failed += extra.failed;
      delivered.gaveUp += extra.gaveUp;
    }

    this.store.setSystem(HEARTBEAT_KEY, now);
    this.store.setSystem(LAST_TICK_KEY, now);
    return { now, transitions, ...delivered, outage };
  }

  /**
   * A gap in ticks means the service was not running. Deadlines that passed
   * during the gap are handled correctly by the state machine, but the
   * operator still needs to know it happened — and if a watch was alarming
   * through the outage, its alerts were late.
   */
  #checkForOutage(now) {
    const last = this.store.getSystem(LAST_TICK_KEY, null);
    if (last === null) return null;
    const gap = now - last;
    if (gap <= this.opts.outageThresholdMs) return null;
    const detail = `no ticks for ${Math.round(gap / MINUTE)} minutes (since ${new Date(last).toISOString()})`;
    this.#fault('scheduler-gap', detail, now);
    return { gapMs: gap, since: last };
  }

  // --- delivery -------------------------------------------------------------

  /** Attempt every due delivery once. Failures are retried with backoff. */
  async flush(now = this.clock()) {
    // A sender that died mid-flight leaves a claim behind. Returning those to
    // the queue risks a duplicate message; leaving them risks silence. For a
    // safety alert, a duplicate is the right side to err on.
    const reclaimed = this.store.reclaimStuckDeliveries(now, this.opts.claimTimeoutMs);
    if (reclaimed > 0) {
      this.#fault('delivery-stuck', `${reclaimed} delivery claim(s) recovered after a stalled send`, now);
    }

    const due = this.store.dueDeliveries(now);
    let sent = 0; let failed = 0; let gaveUp = 0;

    for (const row of due) {
      // Take the row before sending. Another scheduler ticking the same
      // database at the same moment will lose this race and skip the row,
      // which is what stops a family being messaged twice.
      if (!this.store.claimDelivery(row.key, now)) continue;
      try {
        await this.channels.send(row.channel, {
          address: row.address,
          subject: row.subject,
          body: row.body,
          meta: { watchId: row.watch_id, kind: row.kind, key: row.key },
        });
        this.store.markSent(row.key, now);
        sent += 1;
      } catch (err) {
        failed += 1;
        const attempt = row.attempts; // attempts before this one
        const backoff = this.opts.backoffMinutes[Math.min(attempt, this.opts.backoffMinutes.length - 1)];
        const status = this.store.markAttemptFailed(
          row.key, err?.message ?? err, now + backoff * MINUTE, now, this.opts.maxAttempts);
        if (status === 'failed') {
          gaveUp += 1;
          // Giving up on an alert is a safety event, not a log line: someone
          // who was supposed to be told has not been told.
          this.#fault('delivery-failed',
            `${row.kind} to ${row.address} via ${row.channel} after ${this.opts.maxAttempts} attempts: ${err?.message ?? err}`,
            now, row.watch_id);
        }
      }
    }
    return { sent, failed, gaveUp };
  }

  // --- self-monitoring ------------------------------------------------------

  #fault(kind, detail, now, watchId = null) {
    const fault = { kind, detail, at: now, watchId };
    this.faults.push(fault);
    if (watchId) this.store.appendEvent(watchId, `fault:${kind}`, now, { detail });
    this.store.setSystem('lastFault', fault);
    if (this.ops) {
      const { subject, body } = systemFaultMessage(fault);
      // Deduped per kind per minute so a storm cannot flood the operator.
      const key = `system|${kind}|${Math.floor(now / MINUTE)}`;
      this.store.enqueueDelivery({
        key, watchId: watchId ?? '-', kind: 'system',
        channel: this.ops.channel, address: this.ops.address, subject, body,
      }, now);
    }
  }

  /**
   * A snapshot for /healthz and the dashboard.
   * `ok` is false whenever the service cannot be trusted to be watching.
   */
  health(now = this.clock()) {
    const last = this.store.getSystem(HEARTBEAT_KEY, null);
    const staleBy = last === null ? null : now - last;
    const watches = this.store.listWatches();
    const counts = this.store.countByStatus();
    const failedRecently = this.store.failedDeliveries(now - 24 * HOUR);

    const problems = [];
    if (last === null) problems.push('scheduler has never ticked');
    else if (staleBy > this.opts.outageThresholdMs) {
      problems.push(`scheduler heartbeat is ${Math.round(staleBy / MINUTE)} minutes stale`);
    }
    if (failedRecently.length) {
      problems.push(`${failedRecently.length} notification(s) could not be delivered in the last 24h`);
    }
    const unverified = watches.filter((w) => w.state.phase === PHASES.DISARMED && !w.state.verifiedAt);

    return {
      ok: problems.length === 0,
      now,
      heartbeatAt: last,
      heartbeatStaleMs: staleBy,
      problems,
      watches: watches.map(({ config, state }) => ({
        id: config.id,
        name: config.name,
        phase: state.phase,
        alarming: isAlarming(state),
        deadline: state.deadline,
        nextTransitionAt: nextTransitionAt(config, state),
        tiersNotified: state.tiersNotified,
      })),
      alarming: watches.filter((w) => isAlarming(w.state)).length,
      unverified: unverified.length,
      deliveries: counts,
      recentFailures: failedRecently.slice(0, 10).map((d) => ({
        key: d.key, kind: d.kind, channel: d.channel, error: d.last_error,
      })),
    };
  }

  // --- lifecycle ------------------------------------------------------------

  /** Begin ticking. Returns immediately; errors are captured as faults. */
  start() {
    if (this.running) return;
    this.running = true;
    const loop = async () => {
      if (!this.running) return;
      try {
        await this.tick();
      } catch (err) {
        this.#fault('tick-threw', err?.stack ?? String(err), this.clock());
      } finally {
        if (this.running) {
          this.timer = setTimeout(loop, this.opts.tickMs);
          this.timer.unref?.();
        }
      }
    };
    loop();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
