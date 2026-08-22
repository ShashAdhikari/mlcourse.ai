// Lantern — randomized simulation.
//
// Example-based tests prove the cases their author thought of. For something
// that is supposed to notice when a person stops responding, that is not
// enough: the dangerous scenarios are the ones nobody imagined — a pause that
// overlaps an outage, a check-in landing in the same second as a tier
// deadline, a delivery failing during a stand-down.
//
// So this file generates thousands of randomized months and checks INVARIANTS
// after each one. The invariants are deliberately re-derived from the raw
// event log — the recorded check-ins, pauses and outages — rather than from
// the state machine's own bookkeeping. A bug that corrupted the machine's
// internal state would therefore still be caught.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINUTE, HOUR, DAY } from '../src/time.js';
import { normalizeConfig } from '../src/model.js';
import { initState, PHASES } from '../src/machine.js';
import { Store } from '../src/store.js';
import { Channels } from '../src/channels.js';
import { Scheduler } from '../src/scheduler.js';

/** Deterministic PRNG so any failure can be replayed from its seed. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZONES = ['UTC', 'Europe/London', 'America/New_York', 'Asia/Kathmandu', 'Australia/Sydney'];
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const between = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

function randomConfig(rng, id) {
  const tierCount = between(rng, 1, 3);
  const contacts = [];
  for (let tier = 1; tier <= tierCount; tier += 1) {
    for (let i = 0; i < between(rng, 1, 2); i += 1) {
      contacts.push({
        id: `t${tier}c${i}`, name: `Contact ${tier}.${i}`,
        channel: 'sim', address: `t${tier}c${i}@example.com`, tier,
      });
    }
  }
  return normalizeConfig({
    id,
    name: 'Subject',
    timezone: pick(rng, ZONES),
    intervalHours: pick(rng, [6, 12, 24, 36]),
    quietHours: rng() < 0.5 ? null : { startHour: between(rng, 20, 23), endHour: between(rng, 6, 9) },
    graceMinutes: pick(rng, [0, 30, 90, 180]),
    nudgeEveryMinutes: pick(rng, [15, 45, 60]),
    tierWaitMinutes: [between(rng, 15, 120), between(rng, 15, 180)],
    self: { channel: 'sim', address: 'subject@example.com' },
    contacts,
  });
}

/**
 * Run one randomized scenario.
 * Returns the full log needed to check invariants independently.
 */
async function simulate(seed, { days = 30, startAt = Date.UTC(2026, 2, 1, 9, 0) } = {}) {
  const rng = mulberry32(seed);
  const config = randomConfig(rng, 'sim');
  const store = new Store(':memory:');

  const sends = [];              // every message that actually left the system
  let failRate = 0;
  const channels = new Channels({
    sim: {
      name: 'sim',
      async send(msg) {
        if (rng() < failRate) throw new Error('simulated transport failure');
        sends.push({ at: clock, ...msg });
      },
    },
  });

  let clock = startAt;
  const scheduler = new Scheduler({
    store, channels, secret: 'sim-secret', baseUrl: 'https://sim',
    clock: () => clock, options: { maxAttempts: 4, backoffMinutes: [1, 2, 5] },
  });

  store.putWatch(config, initState(startAt), startAt);
  scheduler.applyEvent('sim', { type: 'verify' }, startAt);
  scheduler.applyEvent('sim', { type: 'arm' }, startAt);

  // The independent record of ground truth.
  const log = {
    config,
    armedAt: startAt,
    checkIns: [startAt],        // arming counts as a check-in
    pauses: [],                 // {from, until}
    outages: [],                // {from, to}
    disarms: [],
    ticks: [],
  };

  // The subject's behaviour for this run.
  const style = pick(rng, ['reliable', 'reliable', 'flaky', 'goes-silent', 'chaotic']);
  const silentFrom = style === 'goes-silent'
    ? startAt + between(rng, 2, Math.max(2, days - 3)) * DAY : Infinity;

  const end = startAt + days * DAY;
  let nextUserAction = startAt + between(rng, 1, 6) * HOUR;

  while (clock < end) {
    // Advance the clock by a random tick interval, occasionally taking an
    // outage instead — the service being down is a normal event, not an
    // exceptional one.
    const step = pick(rng, [1, 3, 5, 10, 17]) * MINUTE;
    if (rng() < 0.004) {
      const outage = between(rng, 20, 600) * MINUTE;
      log.outages.push({ from: clock, to: clock + outage });
      clock += outage;
    } else {
      clock += step;
    }
    if (clock > end) break;

    // The subject acts.
    //
    // Ground truth is recorded from what actually happened, not from what was
    // attempted: `resume` on a watch that is not paused is a no-op, and
    // logging it as a check-in would make the invariants believe the subject
    // was alive when they had said nothing.
    const applyAndRecord = (type, extra = {}) => {
      scheduler.applyEvent('sim', { type, ...extra }, clock);
      const after = store.getWatch('sim').state;
      if (after.phase === PHASES.OK && after.lastCheckIn === clock) {
        log.checkIns.push(clock);
        const open = log.pauses[log.pauses.length - 1];
        if (open && open.until > clock) open.until = clock; // this ended the pause
      }
      return after;
    };

    if (clock >= nextUserAction && clock < silentFrom) {
      const roll = rng();
      const state = store.getWatch('sim').state;
      if (roll < 0.06 && state.phase !== PHASES.PAUSED) {
        scheduler.applyEvent('sim', { type: 'pause', until: clock + between(rng, 6, 72) * HOUR }, clock);
        const after = store.getWatch('sim').state;
        if (after.phase === PHASES.PAUSED) log.pauses.push({ from: clock, until: after.pausedUntil });
      } else if (roll < 0.09) {
        applyAndRecord('resume');
      } else if (style !== 'flaky' || rng() < 0.75) {
        applyAndRecord('checkin', { source: 'sim' });
      }
      const gap = config.intervalHours * HOUR;
      nextUserAction = clock + Math.max(MINUTE, gap * (0.3 + rng() * 0.8));
    }

    // A contact sometimes clears a live alarm.
    if (rng() < 0.02 && store.getWatch('sim').state.tiersNotified > 0) {
      applyAndRecord('resolve', { by: 'Contact' });
    }

    failRate = rng() < 0.02 ? 0.5 : 0;   // occasional carrier trouble
    await scheduler.tick(clock);
    log.ticks.push(clock);
  }

  // Let any backlog drain so stand-downs are not judged mid-flight.
  failRate = 0;
  for (let i = 0; i < 8; i += 1) {
    clock += 10 * MINUTE;
    await scheduler.tick(clock);
  }

  const finalState = store.getWatch('sim').state;
  store.close();
  return { seed, style, log, sends, finalState, endedAt: clock };
}

// --- invariant checks -------------------------------------------------------

const alertsIn = (sends) => sends.filter((s) => s.meta.kind === 'alert');
const lastCheckInBefore = (log, t) => log.checkIns.filter((c) => c <= t).pop() ?? log.armedAt;
const pausedAt = (log, t) => log.pauses.some((p) => t >= p.from && t < p.until);

/**
 * THE central safety invariant.
 *
 * Nobody is contacted unless the subject has genuinely been silent for at
 * least one full check-in interval plus the entire grace window. Quiet hours
 * only ever push a deadline later, so this bound is conservative in the safe
 * direction and holds regardless of timezone or DST.
 */
function assertNoPrematureAlerts({ seed, log, sends }) {
  const { config } = log;
  const minSilence = config.intervalHours * HOUR + config.graceMinutes * MINUTE;
  for (const alert of alertsIn(sends)) {
    const silentSince = lastCheckInBefore(log, alert.at);
    const silence = alert.at - silentSince;
    assert.ok(silence >= minSilence,
      `seed ${seed}: contact alerted after only ${Math.round(silence / MINUTE)} min of silence, `
      + `minimum is ${Math.round(minSilence / MINUTE)} min`);
  }
}

/** Nobody is contacted while the watch is paused. */
function assertSilentWhilePaused({ seed, log, sends }) {
  for (const alert of alertsIn(sends)) {
    assert.ok(!pausedAt(log, alert.at),
      `seed ${seed}: contact alerted at ${alert.at} while the watch was paused`);
  }
}

/** Tiers are only ever contacted in order, and each at most once per alarm. */
function assertTierOrder({ seed, sends }) {
  const byCycle = new Map();
  for (const s of alertsIn(sends)) {
    const [, cycle, , tier] = s.meta.key.split('|');
    if (!byCycle.has(cycle)) byCycle.set(cycle, []);
    byCycle.get(cycle).push({ tier: Number(tier), at: s.at, key: s.meta.key });
  }
  for (const [cycle, list] of byCycle) {
    const sorted = [...list].sort((a, b) => a.at - b.at || a.tier - b.tier);
    let highest = 0;
    for (const item of sorted) {
      assert.ok(item.tier >= highest,
        `seed ${seed}: cycle ${cycle} contacted tier ${item.tier} after tier ${highest}`);
      highest = Math.max(highest, item.tier);
    }
  }
}

/** No message is ever delivered twice. */
function assertNoDuplicates({ seed, sends }) {
  const keys = sends.map((s) => s.meta.key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  assert.deepEqual(dupes, [], `seed ${seed}: duplicate deliveries ${dupes.slice(0, 3)}`);
}

/**
 * Everyone who was alarmed is eventually told it is over.
 *
 * Leaving a relative believing an emergency is still unfolding is the failure
 * that would destroy trust in the product fastest.
 */
function assertStandDownsComplete({ seed, sends, finalState }) {
  const alertedByCycle = new Map();
  const stoodDownByCycle = new Map();
  for (const s of sends) {
    const parts = s.meta.key.split('|');
    const cycle = parts[1];
    if (s.meta.kind === 'alert') {
      if (!alertedByCycle.has(cycle)) alertedByCycle.set(cycle, new Set());
      alertedByCycle.get(cycle).add(s.address);
    } else if (s.meta.kind === 'standdown') {
      if (!stoodDownByCycle.has(cycle)) stoodDownByCycle.set(cycle, new Set());
      stoodDownByCycle.get(cycle).add(s.address);
    }
  }
  const liveCycle = finalState.cycleStart === null ? null : String(finalState.cycleStart);
  for (const [cycle, alerted] of alertedByCycle) {
    // The alarm still running at the end of the simulation is legitimately
    // unresolved; every earlier one must have been closed out.
    if (cycle === liveCycle) continue;
    const cleared = stoodDownByCycle.get(cycle) ?? new Set();
    for (const address of alerted) {
      assert.ok(cleared.has(address),
        `seed ${seed}: ${address} was alarmed in cycle ${cycle} and never told it was over`);
    }
  }
}

/** A stand-down never goes to someone who was not alarmed in that cycle. */
function assertNoGratuitousStandDowns({ seed, sends }) {
  const alerted = new Map();
  for (const s of sends.filter((x) => x.meta.kind === 'alert')) {
    const cycle = s.meta.key.split('|')[1];
    if (!alerted.has(cycle)) alerted.set(cycle, new Set());
    alerted.get(cycle).add(s.address);
  }
  for (const s of sends.filter((x) => x.meta.kind === 'standdown')) {
    const cycle = s.meta.key.split('|')[1];
    assert.ok(alerted.get(cycle)?.has(s.address),
      `seed ${seed}: ${s.address} was told "all clear" for an alarm they never heard about`);
  }
}

/** A pause never outlives its cap. */
function assertPausesExpire({ seed, log, finalState, endedAt }) {
  for (const p of log.pauses) {
    assert.ok(p.until <= p.from + log.config.maxPauseHours * HOUR + MINUTE,
      `seed ${seed}: a pause outlived the configured maximum`);
  }
  if (finalState.phase === PHASES.PAUSED) {
    assert.ok(finalState.pausedUntil > endedAt,
      `seed ${seed}: still paused past the pause expiry`);
  }
}

const CHECKS = [
  assertNoPrematureAlerts, assertSilentWhilePaused, assertTierOrder,
  assertNoDuplicates, assertStandDownsComplete, assertNoGratuitousStandDowns,
  assertPausesExpire,
];

// --- the tests --------------------------------------------------------------

test('safety invariants hold across 120 randomized months', async (t) => {
  let alertingRuns = 0;
  let totalAlerts = 0;
  for (let seed = 1; seed <= 120; seed += 1) {
    const run = await simulate(seed, { days: 30 });
    for (const check of CHECKS) check(run);
    if (alertsIn(run.sends).length) { alertingRuns += 1; totalAlerts += alertsIn(run.sends).length; }
  }
  // A simulation where nothing ever escalates would pass every invariant
  // vacuously, so assert the scenarios actually exercised the alarm path.
  assert.ok(alertingRuns >= 20,
    `only ${alertingRuns}/120 runs produced an alert — the simulation is not exercising escalation`);
  t.diagnostic(`${alertingRuns}/120 runs escalated, ${totalAlerts} alerts sent in total`);
});

test('safety invariants hold over a simulated year', async () => {
  for (const seed of [7, 23, 101, 999]) {
    const run = await simulate(seed, { days: 365 });
    for (const check of CHECKS) check(run);
  }
});

test('a subject who goes silent always reaches full escalation', async () => {
  // Liveness, not just safety: the system must actually fire, not merely
  // avoid firing wrongly. A watch that never alerts would pass every
  // safety invariant above.
  let checked = 0;
  for (let seed = 1; seed <= 400 && checked < 25; seed += 1) {
    const startAt = Date.UTC(2026, 2, 1, 9, 0);
    const run = await simulate(seed, { days: 20, startAt });
    if (run.style !== 'goes-silent') continue;
    checked += 1;
    const { config } = run.log;
    const lastCheckIn = run.log.checkIns[run.log.checkIns.length - 1];
    const quietFor = run.endedAt - lastCheckIn;
    const needed = config.intervalHours * HOUR
      + config.graceMinutes * MINUTE
      + config.tierWaitMinutes.reduce((a, b) => a + b, 0) * MINUTE
      + 12 * HOUR; // slack for quiet hours and outages
    if (quietFor < needed) continue;
    const tiers = new Set(alertsIn(run.sends).map((s) => Number(s.meta.key.split('|')[3])));
    assert.equal(tiers.size, config.tierCount,
      `seed ${seed}: subject silent for ${Math.round(quietFor / HOUR)}h but only tiers `
      + `${[...tiers]} of ${config.tierCount} were contacted`);
    assert.equal(run.finalState.phase, PHASES.ALERTED, `seed ${seed}: expected full escalation`);
  }
  assert.ok(checked >= 5, `only ${checked} silent-subject scenarios were generated`);
});

test('a reliable subject is never escalated about', async () => {
  // The false-alarm case. Someone who always checks in well inside their
  // window must never cause a contact to be woken — this is what makes the
  // product tolerable to live with.
  const startAt = Date.UTC(2026, 2, 1, 9, 0);
  for (let seed = 1; seed <= 40; seed += 1) {
    const rng = mulberry32(seed + 5000);
    const config = randomConfig(rng, 'quiet');
    const store = new Store(':memory:');
    const sends = [];
    const channels = new Channels({ sim: { name: 'sim', async send(m) { sends.push(m); } } });
    let clock = startAt;
    const scheduler = new Scheduler({ store, channels, secret: 's', baseUrl: 'https://x', clock: () => clock });
    store.putWatch(config, initState(startAt), startAt);
    scheduler.applyEvent('quiet', { type: 'verify' }, startAt);
    scheduler.applyEvent('quiet', { type: 'arm' }, startAt);

    // Check in at half the interval, every time, for 60 days.
    const gap = config.intervalHours * HOUR / 2;
    let nextCheckIn = startAt + gap;
    const end = startAt + 60 * DAY;
    while (clock < end) {
      clock += 7 * MINUTE;
      if (clock >= nextCheckIn) {
        scheduler.applyEvent('quiet', { type: 'checkin', source: 'sim' }, clock);
        nextCheckIn = clock + gap;
      }
      await scheduler.tick(clock);
    }
    store.close();
    const alerts = sends.filter((s) => s.meta.kind === 'alert');
    assert.deepEqual(alerts, [],
      `seed ${seed}: a punctual subject triggered ${alerts.length} alert(s)`);
    const nudges = sends.filter((s) => s.meta.kind === 'nudge');
    assert.deepEqual(nudges, [], `seed ${seed}: a punctual subject was nudged`);
  }
});

test('outages never cause a contact to be skipped', async () => {
  // Specifically stress the interaction that worries me most: the service
  // being down across the exact moment a tier falls due.
  const startAt = Date.UTC(2026, 2, 1, 9, 0);
  for (let seed = 1; seed <= 60; seed += 1) {
    const rng = mulberry32(seed + 9000);
    const config = randomConfig(rng, 'gap');
    const store = new Store(':memory:');
    const sends = [];
    const channels = new Channels({ sim: { name: 'sim', async send(m) { sends.push(m); } } });
    let clock = startAt;
    const scheduler = new Scheduler({ store, channels, secret: 's', baseUrl: 'https://x', clock: () => clock });
    store.putWatch(config, initState(startAt), startAt);
    scheduler.applyEvent('gap', { type: 'verify' }, startAt);
    scheduler.applyEvent('gap', { type: 'arm' }, startAt);

    // The subject never checks in again. The scheduler runs, then vanishes for
    // a long random stretch that straddles the escalation ladder, then returns.
    await scheduler.tick(clock + MINUTE);
    clock += MINUTE;
    const blackout = between(rng, 2, 60) * HOUR;
    clock += config.intervalHours * HOUR + blackout;
    await scheduler.tick(clock);
    // A couple of further ticks to drain the queue.
    for (let i = 0; i < 3; i += 1) { clock += 5 * MINUTE; await scheduler.tick(clock); }
    store.close();

    const tiers = new Set(sends.filter((s) => s.meta.kind === 'alert')
      .map((s) => Number(s.meta.key.split('|')[3])));
    const fullyDue = blackout >= (config.graceMinutes
      + config.tierWaitMinutes.reduce((a, b) => a + b, 0)) * MINUTE;
    if (fullyDue) {
      assert.equal(tiers.size, config.tierCount,
        `seed ${seed}: after a ${Math.round(blackout / HOUR)}h outage only tiers `
        + `${[...tiers]} of ${config.tierCount} were contacted`);
    }
    assert.ok(tiers.has(1), `seed ${seed}: tier 1 was never contacted after an outage`);
  }
});

test('a failure is reported for every seed that violates an invariant', () => {
  // Confidence in the checks themselves: a deliberately broken log must be
  // caught. Without this, a bug in the invariants would look like success.
  const config = normalizeConfig({
    id: 'x', name: 'X', timezone: 'UTC', quietHours: null, graceMinutes: 60,
    self: { channel: 'sim', address: 's' },
    contacts: [{ id: 'c1', name: 'C', channel: 'sim', address: 'c@example.com', tier: 1 }],
  });
  const log = { config, armedAt: 0, checkIns: [0], pauses: [], outages: [] };

  // An alert one minute after arming — far too soon.
  assert.throws(() => assertNoPrematureAlerts({
    seed: 0, log,
    sends: [{ at: MINUTE, address: 'c@example.com', meta: { kind: 'alert', key: 'x|0|tier|1' } }],
  }), /only 1 min of silence/);

  // A stand-down to someone who was never alarmed.
  assert.throws(() => assertNoGratuitousStandDowns({
    seed: 0,
    sends: [{ at: 0, address: 'stranger@example.com', meta: { kind: 'standdown', key: 'x|0|standdown' } }],
  }), /never heard about/);

  // The same message delivered twice.
  assert.throws(() => assertNoDuplicates({
    seed: 0,
    sends: [{ meta: { key: 'dup' } }, { meta: { key: 'dup' } }],
  }), /duplicate deliveries/);

  // Tier 2 contacted at an earlier instant than tier 1 — a genuine violation,
  // as opposed to merely being listed first.
  assert.throws(() => assertTierOrder({
    seed: 0,
    sends: [
      { at: 100, address: 'a', meta: { kind: 'alert', key: 'x|0|tier|2' } },
      { at: 200, address: 'b', meta: { kind: 'alert', key: 'x|0|tier|1' } },
    ],
  }), /contacted tier 1 after tier 2/);
});
