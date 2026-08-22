// Lantern — the escalation state machine.
//
// This is the safety-critical core, and it is deliberately a pure function:
//
//     evaluate(config, state, event, now) -> { state, actions }
//
// No I/O, no clock, no randomness. The caller performs the actions and saves
// the state. That makes every rule here testable at exact instants, and makes
// a replayed or duplicated tick harmless.
//
// Two design decisions do most of the safety work:
//
// 1. Progress is DERIVED FROM TIME, not accumulated step by step. How far an
//    alarm has escalated is computed from how long ago the deadline passed.
//    A process that was down for six hours therefore catches up correctly on
//    its first tick instead of resuming a stale ladder six hours late.
//
// 2. Every action carries a deterministic `key`. The delivery layer refuses to
//    send a key twice, so re-running a tick cannot double-notify anyone.

import { MINUTE, HOUR, nextDeadline } from './time.js';
import { contactsInTier, contactsUpToTier } from './model.js';

export const PHASES = Object.freeze({
  DISARMED: 'disarmed',     // configured but not yet protecting anyone
  OK: 'ok',                 // checked in; deadline ahead
  DUE: 'due',               // deadline passed; nudging the person only
  ESCALATING: 'escalating', // contacts being told, tier by tier
  ALERTED: 'alerted',       // every tier told; waiting for a human
  PAUSED: 'paused',         // deliberately suspended, always with an expiry
});

/** A fresh, unarmed state. A watch cannot alert anyone until it is verified and armed. */
export function initState(now = 0) {
  return {
    phase: PHASES.DISARMED,
    lastCheckIn: null,
    deadline: null,
    cycleStart: null,     // the missed deadline identifying the current alarm
    nudgeIndex: 0,        // highest nudge emitted this cycle
    tiersNotified: 0,     // highest tier told this cycle
    pausedUntil: null,
    verifiedAt: null,     // set once a test message has demonstrably arrived
    armedAt: null,
    updatedAt: now,
    lastCheckInSource: null,
    resolvedBy: null,
  };
}

const clone = (s) => ({ ...s });

// --- action constructors ----------------------------------------------------
// `key` identifies an action uniquely and deterministically, so the same
// logical notification computed twice collapses to one delivery.

const nudgeAction = (config, state, index, now, dueFor) => ({
  type: 'nudge',
  key: `${config.id}|${state.cycleStart}|nudge|${index}`,
  watchId: config.id,
  to: config.self,
  cycleStart: state.cycleStart,
  index,
  overdueBy: dueFor,
  at: now,
});

const alertAction = (config, state, tier, now, dueFor, late) => ({
  type: 'alert',
  key: `${config.id}|${state.cycleStart}|tier|${tier}`,
  watchId: config.id,
  tier,
  contacts: contactsInTier(config, tier),
  cycleStart: state.cycleStart,
  overdueBy: dueFor,
  late,
  at: now,
});

const standDownAction = (config, state, reason, by, now) => ({
  type: 'standdown',
  key: `${config.id}|${state.cycleStart}|standdown`,
  watchId: config.id,
  // Exactly the people who were alarmed — telling anyone else is noise, and
  // failing to tell these people is unforgivable.
  contacts: contactsUpToTier(config, state.tiersNotified),
  cycleStart: state.cycleStart,
  reason,
  by,
  at: now,
});

const testAction = (config, target, now) => ({
  type: 'test',
  key: `${config.id}|verify|${now}`,
  watchId: config.id,
  to: target,
  at: now,
});

// --- derived timing ---------------------------------------------------------

/** When the grace window ends and contacts start being told. */
export function escalationStartsAt(config, cycleStart) {
  return cycleStart + config.graceMinutes * MINUTE;
}

/** When tier `tier` (1-based) is due to be notified. */
export function tierDueAt(config, cycleStart, tier) {
  let at = escalationStartsAt(config, cycleStart);
  for (let t = 2; t <= tier; t += 1) at += config.tierWaitMinutes[t - 2] * MINUTE;
  return at;
}

/** How many tiers should have been notified by `now`. Pure function of elapsed time. */
export function tiersDueBy(config, cycleStart, now) {
  let due = 0;
  for (let tier = 1; tier <= config.tierCount; tier += 1) {
    if (now >= tierDueAt(config, cycleStart, tier)) due = tier; else break;
  }
  return due;
}

/**
 * The highest nudge index due by `now` within the grace window.
 * Nudge 1 fires at the deadline, then every nudgeEveryMinutes until grace ends.
 */
export function nudgesDueBy(config, cycleStart, now) {
  if (now < cycleStart) return 0;
  const graceEnd = escalationStartsAt(config, cycleStart);
  const capped = Math.min(now, graceEnd - 1);
  if (capped < cycleStart) return 0;
  return Math.floor((capped - cycleStart) / (config.nudgeEveryMinutes * MINUTE)) + 1;
}

// --- the machine ------------------------------------------------------------

/**
 * @param {object} config  normalized watch config
 * @param {object} state   current state
 * @param {object} event   {type: 'tick'|'checkin'|'pause'|'resume'|'arm'|'disarm'|'verify'|'resolve', ...}
 * @param {number} now     epoch ms
 * @returns {{state: object, actions: object[]}}
 */
export function evaluate(config, state, event, now) {
  const s = clone(state);
  const actions = [];
  s.updatedAt = now;

  switch (event.type) {
    case 'verify':
      // Proof that a message actually reached its target. Until this happens
      // the watch cannot be armed, so nobody relies on an untested channel.
      s.verifiedAt = now;
      return { state: s, actions };

    case 'test':
      actions.push(testAction(config, event.to ?? config.self, now));
      return { state: s, actions };

    case 'arm': {
      if (!s.verifiedAt) {
        return { state, actions: [], error: 'cannot arm before a test message has been confirmed' };
      }
      if (s.phase !== PHASES.DISARMED) return { state, actions: [] };
      s.phase = PHASES.OK;
      s.armedAt = now;
      s.lastCheckIn = now;
      s.lastCheckInSource = 'arm';
      s.deadline = nextDeadline(now, config.intervalHours, config.timezone, config.quietHours);
      s.cycleStart = null;
      s.nudgeIndex = 0;
      s.tiersNotified = 0;
      return { state: s, actions };
    }

    case 'disarm': {
      // Stand down anyone already alarmed — switching the system off must not
      // leave a relative believing an emergency is still unfolding.
      if (s.tiersNotified > 0) {
        actions.push(standDownAction(config, s, 'disarmed', event.by ?? null, now));
      }
      s.phase = PHASES.DISARMED;
      s.deadline = null;
      s.cycleStart = null;
      s.nudgeIndex = 0;
      s.tiersNotified = 0;
      s.pausedUntil = null;
      return { state: s, actions };
    }

    case 'checkin':
    case 'resolve': {
      if (s.phase === PHASES.DISARMED) {
        // A check-in against a disarmed watch is recorded but changes nothing;
        // silently arming would give false confidence.
        s.lastCheckIn = now;
        s.lastCheckInSource = event.source ?? event.type;
        return { state: s, actions };
      }
      if (s.tiersNotified > 0) {
        actions.push(standDownAction(config, s,
          event.type === 'resolve' ? 'resolved' : 'checked-in', event.by ?? null, now));
      }
      s.phase = PHASES.OK;
      s.lastCheckIn = now;
      s.lastCheckInSource = event.source ?? event.type;
      s.resolvedBy = event.type === 'resolve' ? (event.by ?? 'contact') : null;
      s.deadline = nextDeadline(now, config.intervalHours, config.timezone, config.quietHours);
      s.cycleStart = null;
      s.nudgeIndex = 0;
      s.tiersNotified = 0;
      s.pausedUntil = null;
      return { state: s, actions };
    }

    case 'pause': {
      if (s.phase === PHASES.DISARMED) return { state, actions: [] };
      const cap = now + config.maxPauseHours * HOUR;
      const until = Math.min(event.until ?? cap, cap);
      if (until <= now) return { state, actions: [] };
      if (s.tiersNotified > 0) {
        actions.push(standDownAction(config, s, 'paused', event.by ?? null, now));
      }
      s.phase = PHASES.PAUSED;
      s.pausedUntil = until;
      s.cycleStart = null;
      s.nudgeIndex = 0;
      s.tiersNotified = 0;
      s.deadline = null;
      return { state: s, actions };
    }

    case 'resume': {
      if (s.phase !== PHASES.PAUSED) return { state, actions: [] };
      s.phase = PHASES.OK;
      s.pausedUntil = null;
      s.lastCheckIn = now;
      s.lastCheckInSource = 'resume';
      s.deadline = nextDeadline(now, config.intervalHours, config.timezone, config.quietHours);
      return { state: s, actions };
    }

    case 'tick':
      return tick(config, s, now, actions);

    default:
      return { state, actions: [], error: `unknown event: ${event.type}` };
  }
}

function tick(config, s, now, actions) {
  if (s.phase === PHASES.DISARMED) return { state: s, actions };

  if (s.phase === PHASES.PAUSED) {
    if (s.pausedUntil !== null && now >= s.pausedUntil) {
      // A pause always ends by itself. This is the single most important
      // property in the file: protection resumes without anyone remembering.
      s.phase = PHASES.OK;
      s.pausedUntil = null;
      s.lastCheckIn = now;
      s.lastCheckInSource = 'pause-expired';
      s.deadline = nextDeadline(now, config.intervalHours, config.timezone, config.quietHours);
    }
    return { state: s, actions };
  }

  // Enter an alarm cycle the moment the deadline passes.
  if (s.phase === PHASES.OK) {
    if (s.deadline === null || now < s.deadline) return { state: s, actions };
    s.phase = PHASES.DUE;
    s.cycleStart = s.deadline;
    s.nudgeIndex = 0;
    s.tiersNotified = 0;
  }

  const overdueBy = now - s.cycleStart;

  // --- nudge the person themselves during the grace window ------------------
  if (now < escalationStartsAt(config, s.cycleStart)) {
    const due = nudgesDueBy(config, s.cycleStart, now);
    if (due > s.nudgeIndex) {
      // Emit only the most recent nudge. After downtime the person needs one
      // clear prompt, not a backlog of six identical ones.
      s.nudgeIndex = due;
      actions.push(nudgeAction(config, s, due, now, overdueBy));
    }
    s.phase = PHASES.DUE;
    return { state: s, actions };
  }

  // --- escalate through the contact tiers -----------------------------------
  const due = tiersDueBy(config, s.cycleStart, now);
  for (let tier = s.tiersNotified + 1; tier <= due; tier += 1) {
    // Unlike nudges, every skipped tier is still emitted: if the service was
    // down, the correct response is that everyone gets told now, not that
    // some contacts are quietly skipped.
    const scheduledFor = tierDueAt(config, s.cycleStart, tier);
    actions.push(alertAction(config, s, tier, now, overdueBy, now - scheduledFor > 5 * MINUTE));
  }
  if (due > s.tiersNotified) s.tiersNotified = due;

  s.phase = s.tiersNotified >= config.tierCount ? PHASES.ALERTED : PHASES.ESCALATING;
  return { state: s, actions };
}

// --- read-only helpers for UI and health ------------------------------------

/** Is this watch actively protecting someone right now? */
export function isArmed(state) {
  return state.phase !== PHASES.DISARMED;
}

/** Is an alarm currently running? */
export function isAlarming(state) {
  return state.phase === PHASES.DUE
      || state.phase === PHASES.ESCALATING
      || state.phase === PHASES.ALERTED;
}

/** When does this watch next need attention? Used to schedule the next wake-up. */
export function nextTransitionAt(config, state) {
  switch (state.phase) {
    case PHASES.OK: return state.deadline;
    case PHASES.PAUSED: return state.pausedUntil;
    case PHASES.DUE: {
      const graceEnd = escalationStartsAt(config, state.cycleStart);
      const nextNudge = state.cycleStart + state.nudgeIndex * config.nudgeEveryMinutes * MINUTE;
      return Math.min(graceEnd, Math.max(nextNudge, state.cycleStart));
    }
    case PHASES.ESCALATING: return tierDueAt(config, state.cycleStart, state.tiersNotified + 1);
    default: return null; // alerted and disarmed wait for a human
  }
}

/** A short status line for dashboards and health output. */
export function summarize(config, state, now) {
  switch (state.phase) {
    case PHASES.DISARMED:
      return state.verifiedAt ? 'ready to arm' : 'not yet verified';
    case PHASES.OK:
      return `ok — next check-in due in ${Math.max(0, Math.round((state.deadline - now) / MINUTE))} min`;
    case PHASES.PAUSED:
      return `paused for another ${Math.max(0, Math.round((state.pausedUntil - now) / MINUTE))} min`;
    case PHASES.DUE:
      return `overdue by ${Math.round((now - state.cycleStart) / MINUTE)} min — nudging`;
    case PHASES.ESCALATING:
      return `overdue — ${state.tiersNotified} of ${config.tierCount} tiers contacted`;
    case PHASES.ALERTED:
      return `alerted — all ${config.tierCount} tiers contacted, awaiting a human`;
    default:
      return state.phase;
  }
}
