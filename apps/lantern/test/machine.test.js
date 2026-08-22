import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINUTE, HOUR, DAY, fromLocal } from '../src/time.js';
import { normalizeConfig, describeLadder, timeToFullEscalation } from '../src/model.js';
import {
  PHASES, initState, evaluate,
  escalationStartsAt, tierDueAt, tiersDueBy, nudgesDueBy,
  isArmed, isAlarming, nextTransitionAt, summarize,
} from '../src/machine.js';

const TZ = 'Europe/London';

const config = normalizeConfig({
  id: 'w1',
  name: 'Ada',
  timezone: TZ,
  intervalHours: 24,
  quietHours: null,          // most tests want undistorted arithmetic
  graceMinutes: 180,
  nudgeEveryMinutes: 45,
  tierWaitMinutes: [60, 120],
  self: { channel: 'console', address: 'ada' },
  contacts: [
    { id: 'c1', name: 'Bea', channel: 'console', address: 'bea', tier: 1 },
    { id: 'c2', name: 'Cal', channel: 'console', address: 'cal', tier: 2 },
    { id: 'c3', name: 'Dee', channel: 'console', address: 'dee', tier: 3 },
  ],
});

// Noon on a plain weekday, well away from midnight and DST.
const T0 = fromLocal({ year: 2026, month: 5, day: 12, hour: 12 }, TZ);

/** Arm a watch and return its state at T0. */
function armed(at = T0) {
  let s = initState(at);
  s = evaluate(config, s, { type: 'verify' }, at).state;
  return evaluate(config, s, { type: 'arm' }, at).state;
}

/** Run ticks at fixed intervals, collecting every action emitted. */
function run(state, from, to, stepMs = 5 * MINUTE) {
  const emitted = [];
  let s = state;
  for (let t = from; t <= to; t += stepMs) {
    const r = evaluate(config, s, { type: 'tick' }, t);
    s = r.state;
    emitted.push(...r.actions);
  }
  return { state: s, actions: emitted };
}

// ---------------------------------------------------------------------------
// arming — a watch must never be able to alert before it has been proven
// ---------------------------------------------------------------------------

test('a new watch is disarmed and unverified', () => {
  const s = initState(T0);
  assert.equal(s.phase, PHASES.DISARMED);
  assert.equal(s.verifiedAt, null);
  assert.equal(isArmed(s), false);
});

test('arming is refused until a test message has been confirmed', () => {
  const s = initState(T0);
  const r = evaluate(config, s, { type: 'arm' }, T0);
  assert.equal(r.state.phase, PHASES.DISARMED);
  assert.match(r.error, /test message/);
});

test('arming works once verified, and sets a deadline one interval out', () => {
  const s = armed();
  assert.equal(s.phase, PHASES.OK);
  assert.equal(s.deadline, T0 + 24 * HOUR);
  assert.equal(s.armedAt, T0);
  assert.equal(isArmed(s), true);
});

test('a disarmed watch never emits anything, however long it is ticked', () => {
  const s = initState(T0);
  const { actions, state } = run(s, T0, T0 + 10 * DAY, HOUR);
  assert.deepEqual(actions, []);
  assert.equal(state.phase, PHASES.DISARMED);
});

test('a check-in against a disarmed watch is recorded but does not arm it', () => {
  const s = initState(T0);
  const r = evaluate(config, s, { type: 'checkin', source: 'web' }, T0);
  assert.equal(r.state.phase, PHASES.DISARMED);
  assert.equal(r.state.lastCheckIn, T0);
  assert.deepEqual(r.actions, []);
});

// ---------------------------------------------------------------------------
// the happy path
// ---------------------------------------------------------------------------

test('checking in on time never notifies anyone', () => {
  let s = armed();
  for (let day = 1; day <= 30; day += 1) {
    const at = T0 + day * 20 * HOUR; // comfortably inside every 24h window
    const ticks = run(s, at - 20 * HOUR + MINUTE, at, 30 * MINUTE);
    assert.deepEqual(ticks.actions, [], `day ${day} produced alerts`);
    s = evaluate(config, ticks.state, { type: 'checkin', source: 'web' }, at).state;
    assert.equal(s.phase, PHASES.OK);
  }
});

test('a check-in resets the deadline from the moment of check-in', () => {
  const s = armed();
  const at = T0 + 5 * HOUR;
  const r = evaluate(config, s, { type: 'checkin' }, at);
  assert.equal(r.state.deadline, at + 24 * HOUR);
  assert.equal(r.state.lastCheckIn, at);
});

test('ticks before the deadline do nothing at all', () => {
  const s = armed();
  const { actions, state } = run(s, T0, T0 + 24 * HOUR - MINUTE, 15 * MINUTE);
  assert.deepEqual(actions, []);
  assert.equal(state.phase, PHASES.OK);
});

// ---------------------------------------------------------------------------
// the grace window — nudging the person before involving anyone else
// ---------------------------------------------------------------------------

const deadline = T0 + 24 * HOUR;

test('the first nudge fires exactly at the deadline, to the person alone', () => {
  const s = armed();
  const r = evaluate(config, s, { type: 'tick' }, deadline);
  assert.equal(r.state.phase, PHASES.DUE);
  assert.equal(r.actions.length, 1);
  assert.equal(r.actions[0].type, 'nudge');
  assert.deepEqual(r.actions[0].to, config.self);
  assert.equal(r.state.cycleStart, deadline);
});

test('nudges repeat on schedule and stop when the grace window ends', () => {
  const s = armed();
  const { actions } = run(s, deadline, deadline + 180 * MINUTE - MINUTE, MINUTE);
  const nudges = actions.filter((a) => a.type === 'nudge');
  // Grace 180 min, nudge every 45 → nudges at 0, 45, 90, 135.
  assert.equal(nudges.length, 4);
  assert.deepEqual(nudges.map((n) => n.index), [1, 2, 3, 4]);
  assert.equal(actions.filter((a) => a.type === 'alert').length, 0,
    'nobody else is contacted during grace');
});

test('no contact is told anything during the entire grace window', () => {
  const s = armed();
  const { actions } = run(s, deadline, deadline + 179 * MINUTE, MINUTE);
  assert.ok(actions.every((a) => a.type === 'nudge'));
});

test('checking in during grace ends the alarm silently', () => {
  const s = armed();
  const { state } = run(s, deadline, deadline + 100 * MINUTE, MINUTE);
  assert.equal(state.phase, PHASES.DUE);
  const r = evaluate(config, state, { type: 'checkin' }, deadline + 101 * MINUTE);
  assert.equal(r.state.phase, PHASES.OK);
  assert.deepEqual(r.actions, [], 'no stand-down needed — nobody had been alarmed');
  assert.equal(r.state.cycleStart, null);
});

// ---------------------------------------------------------------------------
// escalation
// ---------------------------------------------------------------------------

test('tier 1 is contacted exactly when the grace window ends', () => {
  const s = armed();
  const before = run(s, deadline, deadline + 180 * MINUTE - MINUTE, MINUTE);
  assert.equal(before.actions.filter((a) => a.type === 'alert').length, 0);
  const r = evaluate(config, before.state, { type: 'tick' }, deadline + 180 * MINUTE);
  const alerts = r.actions.filter((a) => a.type === 'alert');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].tier, 1);
  assert.deepEqual(alerts[0].contacts.map((c) => c.name), ['Bea']);
  assert.equal(r.state.phase, PHASES.ESCALATING);
});

test('tiers escalate in order, at the configured gaps, each exactly once', () => {
  const s = armed();
  const { actions, state } = run(s, deadline, deadline + 12 * HOUR, MINUTE);
  const alerts = actions.filter((a) => a.type === 'alert');
  assert.deepEqual(alerts.map((a) => a.tier), [1, 2, 3]);
  assert.deepEqual(alerts.map((a) => a.contacts[0].name), ['Bea', 'Cal', 'Dee']);
  assert.equal(state.phase, PHASES.ALERTED);
  assert.equal(state.tiersNotified, 3);
});

test('escalation timing matches the documented ladder', () => {
  const cycle = deadline;
  assert.equal(escalationStartsAt(config, cycle), cycle + 180 * MINUTE);
  assert.equal(tierDueAt(config, cycle, 1), cycle + 180 * MINUTE);
  assert.equal(tierDueAt(config, cycle, 2), cycle + 240 * MINUTE); // +60
  assert.equal(tierDueAt(config, cycle, 3), cycle + 360 * MINUTE); // +120
  assert.equal(timeToFullEscalation(config), 360 * MINUTE);
});

test('once every tier is contacted the watch goes quiet and waits for a human', () => {
  const s = armed();
  const { state } = run(s, deadline, deadline + 8 * HOUR, MINUTE);
  assert.equal(state.phase, PHASES.ALERTED);
  // Ticking for another week must not badger anyone further.
  const after = run(state, deadline + 8 * HOUR, deadline + 8 * HOUR + 7 * DAY, HOUR);
  assert.deepEqual(after.actions, []);
  assert.equal(after.state.phase, PHASES.ALERTED);
});

test('nobody is ever contacted twice for the same alarm', () => {
  const s = armed();
  const { actions } = run(s, deadline, deadline + 3 * DAY, MINUTE);
  const keys = actions.map((a) => a.key);
  assert.equal(new Set(keys).size, keys.length, 'duplicate action keys emitted');
});

// ---------------------------------------------------------------------------
// stand-down — the part that is unforgivable to get wrong
// ---------------------------------------------------------------------------

test('checking in after tier 1 tells exactly the people who were alarmed', () => {
  const s = armed();
  const { state } = run(s, deadline, deadline + 200 * MINUTE, MINUTE); // tier 1 only
  assert.equal(state.tiersNotified, 1);
  const r = evaluate(config, state, { type: 'checkin' }, deadline + 201 * MINUTE);
  const stand = r.actions.filter((a) => a.type === 'standdown');
  assert.equal(stand.length, 1);
  assert.deepEqual(stand[0].contacts.map((c) => c.name), ['Bea']);
  assert.equal(stand[0].reason, 'checked-in');
  assert.equal(r.state.phase, PHASES.OK);
});

test('checking in after full escalation tells everyone who was alarmed', () => {
  const s = armed();
  const { state } = run(s, deadline, deadline + 8 * HOUR, MINUTE);
  const r = evaluate(config, state, { type: 'checkin' }, deadline + 8 * HOUR + MINUTE);
  const stand = r.actions.find((a) => a.type === 'standdown');
  assert.deepEqual(stand.contacts.map((c) => c.name), ['Bea', 'Cal', 'Dee']);
});

test('a contact resolving the alarm stands everyone down and records who', () => {
  const s = armed();
  const { state } = run(s, deadline, deadline + 5 * HOUR, MINUTE);
  const r = evaluate(config, state, { type: 'resolve', by: 'Bea' }, deadline + 5 * HOUR + MINUTE);
  const stand = r.actions.find((a) => a.type === 'standdown');
  assert.equal(stand.reason, 'resolved');
  assert.equal(stand.by, 'Bea');
  assert.equal(r.state.phase, PHASES.OK);
  assert.equal(r.state.resolvedBy, 'Bea');
});

test('disarming mid-alarm stands contacts down rather than leaving them frightened', () => {
  const s = armed();
  const { state } = run(s, deadline, deadline + 5 * HOUR, MINUTE);
  const r = evaluate(config, state, { type: 'disarm', by: 'Ada' }, deadline + 5 * HOUR + MINUTE);
  const stand = r.actions.find((a) => a.type === 'standdown');
  assert.ok(stand, 'disarming during an alarm must notify the people already told');
  assert.equal(stand.reason, 'disarmed');
  assert.equal(r.state.phase, PHASES.DISARMED);
});

test('pausing mid-alarm also stands contacts down', () => {
  const s = armed();
  const { state } = run(s, deadline, deadline + 5 * HOUR, MINUTE);
  const r = evaluate(config, state, { type: 'pause', until: deadline + 30 * HOUR }, deadline + 5 * HOUR + MINUTE);
  assert.ok(r.actions.find((a) => a.type === 'standdown'));
  assert.equal(r.state.phase, PHASES.PAUSED);
});

test('no stand-down is sent when nobody had been contacted', () => {
  const s = armed();
  const r = evaluate(config, s, { type: 'checkin' }, T0 + HOUR);
  assert.deepEqual(r.actions, []);
});

// ---------------------------------------------------------------------------
// pausing — must always expire
// ---------------------------------------------------------------------------

test('a pause expires by itself and protection resumes', () => {
  const s = armed();
  const until = T0 + 3 * DAY;
  const paused = evaluate(config, s, { type: 'pause', until }, T0).state;
  assert.equal(paused.phase, PHASES.PAUSED);

  const during = run(paused, T0, until - MINUTE, HOUR);
  assert.deepEqual(during.actions, [], 'a paused watch is silent');
  assert.equal(during.state.phase, PHASES.PAUSED);

  const after = evaluate(config, during.state, { type: 'tick' }, until).state;
  assert.equal(after.phase, PHASES.OK, 'pause must end on its own');
  assert.equal(after.deadline, until + 24 * HOUR);
});

test('a pause is capped at maxPauseHours however long is requested', () => {
  const s = armed();
  const r = evaluate(config, s, { type: 'pause', until: T0 + 365 * DAY }, T0);
  const cap = T0 + config.maxPauseHours * HOUR;
  assert.equal(r.state.pausedUntil, cap);
});

test('an indefinite pause is impossible — omitting an end date still caps it', () => {
  const s = armed();
  const r = evaluate(config, s, { type: 'pause' }, T0);
  assert.equal(r.state.pausedUntil, T0 + config.maxPauseHours * HOUR);
  assert.ok(Number.isFinite(r.state.pausedUntil));
});

test('a pause ending in the past is rejected rather than silently disabling the watch', () => {
  const s = armed();
  const r = evaluate(config, s, { type: 'pause', until: T0 - HOUR }, T0);
  assert.equal(r.state.phase, PHASES.OK);
});

test('resume ends a pause immediately with a fresh deadline', () => {
  const s = armed();
  const paused = evaluate(config, s, { type: 'pause', until: T0 + 3 * DAY }, T0).state;
  const r = evaluate(config, paused, { type: 'resume' }, T0 + HOUR);
  assert.equal(r.state.phase, PHASES.OK);
  assert.equal(r.state.deadline, T0 + HOUR + 24 * HOUR);
});

// ---------------------------------------------------------------------------
// downtime catch-up — the property that makes an outage survivable
// ---------------------------------------------------------------------------

test('after an outage spanning the whole ladder, one tick contacts every tier', () => {
  const s = armed();
  // The service dies at T0 and comes back a day after the deadline passed.
  const r = evaluate(config, s, { type: 'tick' }, deadline + 24 * HOUR);
  const alerts = r.actions.filter((a) => a.type === 'alert');
  assert.deepEqual(alerts.map((a) => a.tier), [1, 2, 3],
    'an outage must not cause contacts to be skipped');
  assert.ok(alerts.every((a) => a.late === true), 'late alerts are marked as late');
  assert.equal(r.state.phase, PHASES.ALERTED);
});

test('after an outage inside the grace window the person gets one nudge, not a backlog', () => {
  const s = armed();
  const r = evaluate(config, s, { type: 'tick' }, deadline + 150 * MINUTE);
  const nudges = r.actions.filter((a) => a.type === 'nudge');
  assert.equal(nudges.length, 1, 'no backlog of stale nudges');
  assert.equal(nudges[0].index, nudgesDueBy(config, deadline, deadline + 150 * MINUTE));
});

test('catch-up reaches the same state as continuous ticking', () => {
  const at = deadline + 5 * HOUR;
  const continuous = run(armed(), T0, at, MINUTE).state;
  const caughtUp = evaluate(config, armed(), { type: 'tick' }, at).state;
  assert.equal(caughtUp.phase, continuous.phase);
  assert.equal(caughtUp.tiersNotified, continuous.tiersNotified);
  assert.equal(caughtUp.cycleStart, continuous.cycleStart);
});

test('ticking is idempotent — repeating the same instant emits nothing new', () => {
  const s = armed();
  const first = evaluate(config, s, { type: 'tick' }, deadline + 200 * MINUTE);
  const second = evaluate(config, first.state, { type: 'tick' }, deadline + 200 * MINUTE);
  const third = evaluate(config, second.state, { type: 'tick' }, deadline + 200 * MINUTE);
  assert.ok(first.actions.length > 0);
  assert.deepEqual(second.actions, []);
  assert.deepEqual(third.actions, []);
});

test('tick granularity does not change who gets contacted', () => {
  // A coarse scheduler must not skip a tier that a fine one would have sent.
  for (const step of [MINUTE, 5 * MINUTE, 17 * MINUTE, 60 * MINUTE, 91 * MINUTE]) {
    const { actions } = run(armed(), T0, deadline + 10 * HOUR, step);
    const tiers = actions.filter((a) => a.type === 'alert').map((a) => a.tier);
    assert.deepEqual(tiers, [1, 2, 3], `step ${step / MINUTE}min changed escalation`);
  }
});

// ---------------------------------------------------------------------------
// derived helpers
// ---------------------------------------------------------------------------

test('tiersDueBy and nudgesDueBy are pure functions of elapsed time', () => {
  const c = deadline;
  assert.equal(tiersDueBy(config, c, c), 0);
  assert.equal(tiersDueBy(config, c, c + 179 * MINUTE), 0);
  assert.equal(tiersDueBy(config, c, c + 180 * MINUTE), 1);
  assert.equal(tiersDueBy(config, c, c + 240 * MINUTE), 2);
  assert.equal(tiersDueBy(config, c, c + 360 * MINUTE), 3);
  assert.equal(tiersDueBy(config, c, c + 100 * DAY), 3, 'never exceeds the tier count');

  assert.equal(nudgesDueBy(config, c, c - MINUTE), 0);
  assert.equal(nudgesDueBy(config, c, c), 1);
  assert.equal(nudgesDueBy(config, c, c + 44 * MINUTE), 1);
  assert.equal(nudgesDueBy(config, c, c + 45 * MINUTE), 2);
  assert.equal(nudgesDueBy(config, c, c + 10 * DAY), 4, 'capped by the grace window');
});

test('nextTransitionAt points at the next moment something happens', () => {
  const ok = armed();
  assert.equal(nextTransitionAt(config, ok), ok.deadline);

  const due = evaluate(config, ok, { type: 'tick' }, deadline).state;
  assert.equal(nextTransitionAt(config, due), deadline + 45 * MINUTE);

  const esc = run(ok, deadline, deadline + 185 * MINUTE, MINUTE).state;
  assert.equal(nextTransitionAt(config, esc), tierDueAt(config, deadline, 2));

  const alerted = run(ok, deadline, deadline + 8 * HOUR, MINUTE).state;
  assert.equal(nextTransitionAt(config, alerted), null);

  const paused = evaluate(config, ok, { type: 'pause', until: T0 + DAY }, T0).state;
  assert.equal(nextTransitionAt(config, paused), T0 + DAY);
});

test('isAlarming is true exactly during an alarm', () => {
  const ok = armed();
  assert.equal(isAlarming(ok), false);
  assert.equal(isAlarming(evaluate(config, ok, { type: 'tick' }, deadline).state), true);
  assert.equal(isAlarming(run(ok, deadline, deadline + 8 * HOUR, MINUTE).state), true);
  assert.equal(isAlarming(initState(T0)), false);
});

test('summarize produces readable status for every phase', () => {
  const ok = armed();
  assert.match(summarize(config, initState(T0), T0), /not yet verified/);
  assert.match(summarize(config, ok, T0), /^ok — next check-in due/);
  assert.match(summarize(config, evaluate(config, ok, { type: 'tick' }, deadline).state, deadline), /overdue.*nudging/);
  assert.match(summarize(config, run(ok, deadline, deadline + 8 * HOUR, MINUTE).state, deadline), /alerted/);
  assert.match(summarize(config, evaluate(config, ok, { type: 'pause', until: T0 + DAY }, T0).state, T0), /paused/);
});

// ---------------------------------------------------------------------------
// quiet hours interaction
// ---------------------------------------------------------------------------

test('deadlines avoid the small hours, so nobody is alarmed over a normal night', () => {
  const nightly = normalizeConfig({
    ...JSON.parse(JSON.stringify({
      id: 'w2', name: 'Ada', timezone: TZ, intervalHours: 12,
      graceMinutes: 180, nudgeEveryMinutes: 45, tierWaitMinutes: [60],
      self: { channel: 'console', address: 'ada' },
      contacts: [{ id: 'c1', name: 'Bea', channel: 'console', address: 'bea', tier: 1 }],
    })),
    quietHours: { startHour: 22, endHour: 8 },
  });
  // Checking in at 15:00 would put a 12-hour deadline at 03:00.
  const at = fromLocal({ year: 2026, month: 5, day: 12, hour: 15 }, TZ);
  let s = initState(at);
  s = evaluate(nightly, s, { type: 'verify' }, at).state;
  s = evaluate(nightly, s, { type: 'arm' }, at).state;
  const expected = fromLocal({ year: 2026, month: 5, day: 13, hour: 8 }, TZ);
  assert.equal(s.deadline, expected, 'deadline moved to the morning');
});

test('the configured ladder can be described in plain language', () => {
  const lines = describeLadder(config);
  assert.ok(lines.length >= 4);
  assert.match(lines[0], /Ada/);
  assert.match(lines.join(' '), /Bea/);
  assert.match(lines.join(' '), /Dee/);
  assert.match(lines.at(-1), /within 6 hours/);
});

// ---------------------------------------------------------------------------
// robustness
// ---------------------------------------------------------------------------

test('an unknown event leaves the state untouched', () => {
  const s = armed();
  const r = evaluate(config, s, { type: 'nonsense' }, T0);
  assert.equal(r.state, s);
  assert.match(r.error, /unknown event/);
});

test('evaluate never mutates the state it is given', () => {
  const s = armed();
  const snapshot = JSON.stringify(s);
  evaluate(config, s, { type: 'tick' }, deadline + 6 * HOUR);
  evaluate(config, s, { type: 'checkin' }, T0 + HOUR);
  evaluate(config, s, { type: 'pause', until: T0 + DAY }, T0);
  assert.equal(JSON.stringify(s), snapshot);
});

test('a single-tier watch escalates and completes correctly', () => {
  const solo = normalizeConfig({
    id: 'w3', name: 'Ada', timezone: TZ, quietHours: null,
    graceMinutes: 60, nudgeEveryMinutes: 30, tierWaitMinutes: [],
    self: { channel: 'console', address: 'ada' },
    contacts: [{ id: 'c1', name: 'Bea', channel: 'console', address: 'bea', tier: 1 }],
  });
  let s = initState(T0);
  s = evaluate(solo, s, { type: 'verify' }, T0).state;
  s = evaluate(solo, s, { type: 'arm' }, T0).state;
  const dl = s.deadline;
  const r = evaluate(solo, s, { type: 'tick' }, dl + 60 * MINUTE);
  assert.equal(r.actions.filter((a) => a.type === 'alert').length, 1);
  assert.equal(r.state.phase, PHASES.ALERTED);
});

test('zero grace escalates straight to tier 1 without nudging', () => {
  const urgent = normalizeConfig({
    id: 'w4', name: 'Ada', timezone: TZ, quietHours: null,
    graceMinutes: 0, tierWaitMinutes: [30],
    self: { channel: 'console', address: 'ada' },
    contacts: [{ id: 'c1', name: 'Bea', channel: 'console', address: 'bea', tier: 1 }],
  });
  let s = initState(T0);
  s = evaluate(urgent, s, { type: 'verify' }, T0).state;
  s = evaluate(urgent, s, { type: 'arm' }, T0).state;
  const r = evaluate(urgent, s, { type: 'tick' }, s.deadline);
  assert.equal(r.actions.filter((a) => a.type === 'nudge').length, 0);
  assert.equal(r.actions.filter((a) => a.type === 'alert').length, 1);
});
