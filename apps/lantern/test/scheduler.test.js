import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINUTE, HOUR, DAY, fromLocal } from '../src/time.js';
import { normalizeConfig } from '../src/model.js';
import { initState, PHASES } from '../src/machine.js';
import { Store } from '../src/store.js';
import { Channels } from '../src/channels.js';
import { Scheduler, HEARTBEAT_KEY, LAST_TICK_KEY } from '../src/scheduler.js';
import { verifyToken } from '../src/tokens.js';

const TZ = 'Europe/London';
const T0 = fromLocal({ year: 2026, month: 5, day: 12, hour: 12 }, TZ);
const SECRET = 'test-secret-value';

const baseConfig = {
  id: 'ada', name: 'Ada', timezone: TZ, intervalHours: 24, quietHours: null,
  graceMinutes: 180, nudgeEveryMinutes: 45, tierWaitMinutes: [60, 120],
  self: { channel: 'test', address: 'ada@example.com' },
  contacts: [
    { id: 'c1', name: 'Bea', channel: 'test', address: 'bea@example.com', tier: 1 },
    { id: 'c2', name: 'Cal', channel: 'test', address: 'cal@example.com', tier: 2 },
    { id: 'c3', name: 'Dee', channel: 'test', address: 'dee@example.com', tier: 3,
      instruction: 'The spare key is with the neighbour at number 12.' },
  ],
};

/** A channel that records everything, and can be told to fail. */
function recorder() {
  const sent = [];
  let failFor = () => null;
  return {
    sent,
    failWhen(fn) { failFor = fn; },
    adapter: {
      name: 'test',
      async send(msg) {
        const err = failFor(msg);
        if (err) throw new Error(err);
        sent.push(msg);
      },
    },
  };
}

function harness({ config = baseConfig, ops = null, options = {} } = {}) {
  const store = new Store(':memory:');
  const rec = recorder();
  const channels = new Channels({ test: rec.adapter });
  let clock = T0;
  const sched = new Scheduler({
    store, channels, secret: SECRET, baseUrl: 'https://lantern.example',
    clock: () => clock, ops, options,
  });
  const cfg = normalizeConfig(config);
  store.putWatch(cfg, initState(T0), T0);
  return {
    store, sched, rec, cfg,
    at(t) { clock = t; return sched; },
    setClock(t) { clock = t; },
    async tick(t) { clock = t; return sched.tick(t); },
    async arm(t = T0) {
      sched.applyEvent('ada', { type: 'verify' }, t);
      return sched.applyEvent('ada', { type: 'arm' }, t);
    },
  };
}

const kinds = (rec) => rec.sent.map((m) => m.meta.kind);
const addressed = (rec, kind) => rec.sent.filter((m) => m.meta.kind === kind).map((m) => m.address);

// ---------------------------------------------------------------------------
// arming and the happy path
// ---------------------------------------------------------------------------

test('a watch cannot be armed before verification, and stays silent', async () => {
  const h = harness();
  const r = h.sched.applyEvent('ada', { type: 'arm' }, T0);
  assert.equal(r.ok, false);
  await h.tick(T0 + 5 * DAY);
  assert.deepEqual(h.rec.sent, []);
});

test('an armed watch that checks in on time sends nothing for a month', async () => {
  const h = harness();
  await h.arm();
  for (let day = 1; day <= 30; day += 1) {
    const at = T0 + day * 20 * HOUR;
    await h.tick(at - HOUR);
    h.sched.applyEvent('ada', { type: 'checkin', source: 'web' }, at);
  }
  assert.deepEqual(h.rec.sent.filter((m) => m.meta.kind !== 'test'), []);
});

// ---------------------------------------------------------------------------
// escalation end to end
// ---------------------------------------------------------------------------

test('a missed check-in nudges the person, then walks the tiers in order', async () => {
  const h = harness();
  await h.arm();
  const deadline = T0 + 24 * HOUR;

  await h.tick(deadline);
  assert.deepEqual(kinds(h.rec), ['nudge']);
  assert.equal(h.rec.sent[0].address, 'ada@example.com', 'only the person, not the family');

  await h.tick(deadline + 100 * MINUTE);
  assert.ok(kinds(h.rec).every((k) => k === 'nudge'), 'nobody else contacted during grace');

  await h.tick(deadline + 180 * MINUTE);
  assert.deepEqual(addressed(h.rec, 'alert'), ['bea@example.com']);

  await h.tick(deadline + 240 * MINUTE);
  assert.deepEqual(addressed(h.rec, 'alert'), ['bea@example.com', 'cal@example.com']);

  await h.tick(deadline + 360 * MINUTE);
  assert.deepEqual(addressed(h.rec, 'alert'),
    ['bea@example.com', 'cal@example.com', 'dee@example.com']);
  assert.equal(h.store.getWatch('ada').state.phase, PHASES.ALERTED);
});

test('an alert message contains the contact instruction and a resolve link', async () => {
  const h = harness();
  await h.arm();
  await h.tick(T0 + 24 * HOUR + 6 * HOUR);
  const toDee = h.rec.sent.find((m) => m.address === 'dee@example.com');
  assert.match(toDee.body, /spare key is with the neighbour/);
  assert.match(toDee.body, /https:\/\/lantern\.example\/a\/resolve\//);
  assert.match(toDee.subject, /has not checked in/);
  assert.match(toDee.body, /not a medical alarm/);
});

test('the resolve link in an alert is a valid token naming that contact', async () => {
  const h = harness();
  await h.arm();
  await h.tick(T0 + 24 * HOUR + 4 * HOUR);
  const toBea = h.rec.sent.find((m) => m.address === 'bea@example.com');
  const token = /\/a\/resolve\/([A-Za-z0-9_.-]+)/.exec(toBea.body)[1];
  const v = verifyToken(token, SECRET, T0 + 24 * HOUR + 4 * HOUR);
  assert.equal(v.ok, true);
  assert.equal(v.claims.kind, 'resolve');
  assert.equal(v.claims.contactId, 'c1');
  assert.equal(v.claims.watchId, 'ada');
});

test('checking in mid-escalation stands down exactly the contacts already told', async () => {
  const h = harness();
  await h.arm();
  const deadline = T0 + 24 * HOUR;
  await h.tick(deadline + 250 * MINUTE);          // tiers 1 and 2 notified
  assert.deepEqual(addressed(h.rec, 'alert'), ['bea@example.com', 'cal@example.com']);

  h.setClock(deadline + 260 * MINUTE);
  h.sched.applyEvent('ada', { type: 'checkin', source: 'web' }, deadline + 260 * MINUTE);
  await h.tick(deadline + 261 * MINUTE);

  assert.deepEqual(addressed(h.rec, 'standdown').sort(),
    ['bea@example.com', 'cal@example.com'], 'Dee was never alarmed, so is not told');
  const msg = h.rec.sent.find((m) => m.meta.kind === 'standdown');
  assert.match(msg.subject, /All clear/);
  assert.match(msg.body, /has checked in and is fine/);
});

test('a contact resolving names them in the all-clear to everyone else', async () => {
  const h = harness();
  await h.arm();
  const deadline = T0 + 24 * HOUR;
  await h.tick(deadline + 6 * HOUR);
  h.sched.applyEvent('ada', { type: 'resolve', by: 'Bea' }, deadline + 7 * HOUR);
  await h.tick(deadline + 7 * HOUR);
  const stand = h.rec.sent.filter((m) => m.meta.kind === 'standdown');
  assert.equal(stand.length, 3);
  assert.match(stand[0].body, /Bea confirmed that Ada is fine/);
});

// ---------------------------------------------------------------------------
// idempotency — the property that makes retries and restarts safe
// ---------------------------------------------------------------------------

test('ticking the same instant repeatedly delivers each message exactly once', async () => {
  const h = harness();
  await h.arm();
  const at = T0 + 24 * HOUR + 6 * HOUR;
  await h.tick(at);
  const first = h.rec.sent.length;
  await h.tick(at);
  await h.tick(at);
  await h.tick(at);
  assert.equal(h.rec.sent.length, first, 'a replayed tick must not re-notify anyone');
});

test('overlapping schedulers on one database do not double-send', async () => {
  // Two processes both think they own the tick loop — a realistic outcome of
  // a restart or a misconfigured deployment.
  const store = new Store(':memory:');
  const rec = recorder();
  const channels = new Channels({ test: rec.adapter });
  const cfg = normalizeConfig(baseConfig);
  store.putWatch(cfg, initState(T0), T0);
  const mk = () => new Scheduler({ store, channels, secret: SECRET, baseUrl: 'https://x', clock: () => T0 });
  const a = mk(); const b = mk();
  a.applyEvent('ada', { type: 'verify' }, T0);
  a.applyEvent('ada', { type: 'arm' }, T0);

  const at = T0 + 24 * HOUR + 6 * HOUR;
  await Promise.all([a.tick(at), b.tick(at)]);
  const alerts = rec.sent.filter((m) => m.meta.kind === 'alert');
  assert.equal(alerts.length, 3, 'three contacts, one message each');
  assert.equal(new Set(alerts.map((m) => m.meta.key)).size, 3);
});

test('a queued delivery is never sent twice even if flush is called repeatedly', async () => {
  const h = harness();
  await h.arm();
  await h.tick(T0 + 24 * HOUR);
  const before = h.rec.sent.length;
  await h.sched.flush(T0 + 24 * HOUR);
  await h.sched.flush(T0 + 24 * HOUR);
  assert.equal(h.rec.sent.length, before);
});

// ---------------------------------------------------------------------------
// downtime
// ---------------------------------------------------------------------------

test('after an outage every contact is still notified, and marked late', async () => {
  const h = harness();
  await h.arm();
  await h.tick(T0 + MINUTE);   // one healthy tick, so the gap is detectable
  // The process then dies and returns a day after the deadline passed.
  const back = T0 + 24 * HOUR + 24 * HOUR;
  const res = await h.tick(back);
  assert.deepEqual(addressed(h.rec, 'alert'),
    ['bea@example.com', 'cal@example.com', 'dee@example.com'],
    'an outage must never cause a contact to be skipped');
  assert.ok(h.rec.sent.some((m) => /this alert was delayed/.test(m.body)),
    'late alerts say so, because the elapsed time is worse than it looks');
  assert.ok(res.outage, 'the outage itself is reported');
});

test('an outage raises a system fault to the operator', async () => {
  const h = harness({ ops: { channel: 'test', address: 'ops@example.com' } });
  await h.arm();
  await h.tick(T0 + MINUTE);
  const res = await h.tick(T0 + 3 * HOUR);
  assert.ok(res.outage);
  assert.equal(res.outage.gapMs, 3 * HOUR - MINUTE);
  const opsMsgs = h.rec.sent.filter((m) => m.address === 'ops@example.com');
  assert.equal(opsMsgs.length, 1);
  assert.match(opsMsgs[0].subject, /scheduler-gap/);
  assert.match(opsMsgs[0].body, /may not be working/);
});

test('normal tick intervals raise no outage fault', async () => {
  const h = harness({ ops: { channel: 'test', address: 'ops@example.com' } });
  await h.arm();
  for (let i = 1; i <= 20; i += 1) await h.tick(T0 + i * MINUTE);
  assert.deepEqual(h.rec.sent.filter((m) => m.address === 'ops@example.com'), []);
});

test('the heartbeat advances on every tick', async () => {
  const h = harness();
  await h.tick(T0 + MINUTE);
  assert.equal(h.store.getSystem(HEARTBEAT_KEY), T0 + MINUTE);
  await h.tick(T0 + 2 * MINUTE);
  assert.equal(h.store.getSystem(LAST_TICK_KEY), T0 + 2 * MINUTE);
});

// ---------------------------------------------------------------------------
// delivery failures
// ---------------------------------------------------------------------------

test('a failing channel is retried with backoff, then reported as a fault', async () => {
  const h = harness({
    ops: { channel: 'test', address: 'ops@example.com' },
    options: { maxAttempts: 3, backoffMinutes: [1, 5] },
  });
  await h.arm();
  h.rec.failWhen((m) => (m.address === 'bea@example.com' ? 'carrier rejected' : null));

  const deadline = T0 + 24 * HOUR;
  await h.tick(deadline + 180 * MINUTE);            // attempt 1 fails
  assert.deepEqual(addressed(h.rec, 'alert'), []);

  await h.tick(deadline + 181 * MINUTE);            // attempt 2 after 1 min
  await h.tick(deadline + 187 * MINUTE);            // attempt 3 after 5 min → gives up

  const row = h.store.getDelivery(
    h.store.deliveriesFor('ada').find((d) => d.address === 'bea@example.com').key);
  assert.equal(row.status, 'failed');
  assert.equal(row.attempts, 3);
  assert.match(row.last_error, /carrier rejected/);

  const ops = h.rec.sent.filter((m) => m.address === 'ops@example.com');
  assert.ok(ops.some((m) => /delivery-failed/.test(m.subject)),
    'failing to reach a contact is a safety event the operator must see');
});

test('one contact failing does not stop the others being reached', async () => {
  const h = harness();
  await h.arm();
  h.rec.failWhen((m) => (m.address === 'bea@example.com' ? 'down' : null));
  await h.tick(T0 + 24 * HOUR + 6 * HOUR);
  assert.deepEqual(addressed(h.rec, 'alert'), ['cal@example.com', 'dee@example.com']);
});

test('a transient failure that recovers is delivered on retry', async () => {
  const h = harness({ options: { backoffMinutes: [1] } });
  await h.arm();
  h.rec.failWhen(() => 'temporarily unavailable');
  const deadline = T0 + 24 * HOUR;
  await h.tick(deadline + 180 * MINUTE);
  assert.deepEqual(addressed(h.rec, 'alert'), []);
  h.rec.failWhen(() => null);
  await h.tick(deadline + 182 * MINUTE);
  assert.deepEqual(addressed(h.rec, 'alert'), ['bea@example.com']);
});

// ---------------------------------------------------------------------------
// health
// ---------------------------------------------------------------------------

test('health reports ok when ticking normally', async () => {
  const h = harness();
  await h.arm();
  await h.tick(T0 + MINUTE);
  const health = h.sched.health(T0 + 2 * MINUTE);
  assert.equal(health.ok, true);
  assert.deepEqual(health.problems, []);
  assert.equal(health.watches[0].phase, PHASES.OK);
});

test('health fails loudly when the heartbeat goes stale', async () => {
  const h = harness();
  await h.tick(T0);
  const health = h.sched.health(T0 + 2 * HOUR);
  assert.equal(health.ok, false);
  assert.match(health.problems[0], /heartbeat is 120 minutes stale/);
});

test('health fails when the scheduler has never run', () => {
  const h = harness();
  const health = h.sched.health(T0);
  assert.equal(health.ok, false);
  assert.match(health.problems[0], /never ticked/);
});

test('health surfaces undeliverable notifications', async () => {
  const h = harness({ options: { maxAttempts: 1 } });
  await h.arm();
  h.rec.failWhen(() => 'no route to host');
  await h.tick(T0 + 24 * HOUR + 6 * HOUR);
  const health = h.sched.health(T0 + 24 * HOUR + 6 * HOUR);
  assert.equal(health.ok, false);
  assert.match(health.problems.join(' '), /could not be delivered/);
  assert.ok(health.recentFailures.length >= 1);
  assert.match(health.recentFailures[0].error, /no route to host/);
});

test('health counts watches that are currently alarming', async () => {
  const h = harness();
  await h.arm();
  // 200 minutes past the deadline: tier 1 is due at 180, tier 2 not until 240.
  await h.tick(T0 + 24 * HOUR + 200 * MINUTE);
  const health = h.sched.health(T0 + 24 * HOUR + 200 * MINUTE);
  assert.equal(health.alarming, 1);
  assert.equal(health.watches[0].tiersNotified, 1);
});

// ---------------------------------------------------------------------------
// configuration safety
// ---------------------------------------------------------------------------

test('a watch referencing an unconfigured channel is refused at startup', () => {
  const store = new Store(':memory:');
  const cfg = normalizeConfig({ ...baseConfig, self: { channel: 'sms', address: '+44' } });
  store.putWatch(cfg, initState(T0), T0);
  const channels = new Channels({ test: { name: 'test', async send() {} } });
  assert.throws(() => channels.validate(store.listWatches()), /unconfigured channels: sms/);
});

test('audit events are recorded for every state change', async () => {
  const h = harness();
  await h.arm();
  await h.tick(T0 + 24 * HOUR + 4 * HOUR);
  h.sched.applyEvent('ada', { type: 'checkin', source: 'web' }, T0 + 24 * HOUR + 5 * HOUR);
  const events = h.store.eventsFor('ada');
  const types = events.map((e) => e.type);
  assert.ok(types.includes('arm'));
  assert.ok(types.includes('checkin'));
  assert.ok(types.some((t) => t.startsWith('phase:')));
});
