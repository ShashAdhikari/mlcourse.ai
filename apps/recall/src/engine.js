// Recall — spaced-repetition scheduling engine.
// A deliberately small, pure, dependency-free SM-2 variant (Anki-flavored).
// All functions are pure: state in, state out. Time is always passed in
// explicitly (epoch milliseconds) so behavior is fully deterministic and
// testable. No Date.now() anywhere in this module.

export const MIN = 60 * 1000;
export const DAY = 24 * 60 * 60 * 1000;

export const GRADE = Object.freeze({ AGAIN: 0, HARD: 1, GOOD: 2, EASY: 3 });

export const DEFAULT_CONFIG = Object.freeze({
  learningStepsMin: [1, 10],   // minutes between learning steps
  graduatingIntervalDays: 1,   // first review interval after learning
  easyIntervalDays: 4,         // interval when EASY is pressed on a new/learning card
  startEase: 2.5,
  minEase: 1.3,
  easeBonusEasy: 0.15,
  easePenaltyHard: 0.15,
  easePenaltyAgain: 0.2,
  hardIntervalFactor: 1.2,
  easyIntervalFactor: 1.3,
  lapseIntervalFactor: 0.5,    // interval multiplier applied on a lapse
  maxIntervalDays: 365,
  newPerDay: 10,
  maxReviewsPerDay: 200,
});

// ---------------------------------------------------------------------------
// Card state
// ---------------------------------------------------------------------------

// status: 'new' → never seen; 'learning' → inside learning steps;
// 'review' → graduated, on day-scale intervals.
export function initState(now = 0) {
  return {
    status: 'new',
    step: 0,          // index into learningStepsMin while learning
    intervalDays: 0,  // current review interval (only meaningful in 'review')
    ease: DEFAULT_CONFIG.startEase,
    due: now,         // epoch ms when the card is next due
    reps: 0,          // total number of grades ever given
    lapses: 0,        // times a review card fell back to learning
    lastGraded: null, // epoch ms of the most recent grade
  };
}

function clampEase(ease, cfg) {
  return Math.max(cfg.minEase, ease);
}

function clampIntervalDays(days, cfg) {
  return Math.min(cfg.maxIntervalDays, Math.max(1, days));
}

/**
 * Apply a grade to a card state. Returns a NEW state object.
 * @param {object} state - card state (from initState or a prior grade call)
 * @param {0|1|2|3} grade - GRADE.AGAIN..GRADE.EASY
 * @param {number} now - current time, epoch ms
 * @param {object} cfg - scheduling config (DEFAULT_CONFIG shape)
 */
export function applyGrade(state, grade, now, cfg = DEFAULT_CONFIG) {
  if (!(grade >= 0 && grade <= 3)) throw new RangeError(`bad grade: ${grade}`);
  const s = { ...state, reps: state.reps + 1, lastGraded: now };
  const steps = cfg.learningStepsMin;

  if (s.status === 'new') {
    s.status = 'learning';
    s.step = 0;
  }

  if (s.status === 'learning') {
    if (grade === GRADE.AGAIN) {
      s.step = 0;
      s.due = now + steps[0] * MIN;
    } else if (grade === GRADE.HARD) {
      // Repeat the current step without advancing.
      s.due = now + steps[Math.min(s.step, steps.length - 1)] * MIN;
    } else if (grade === GRADE.EASY) {
      s.status = 'review';
      s.intervalDays = cfg.easyIntervalDays;
      s.due = now + s.intervalDays * DAY;
    } else { // GOOD
      s.step += 1;
      if (s.step >= steps.length) {
        s.status = 'review';
        s.intervalDays = cfg.graduatingIntervalDays;
        s.due = now + s.intervalDays * DAY;
      } else {
        s.due = now + steps[s.step] * MIN;
      }
    }
    return s;
  }

  // status === 'review'
  if (grade === GRADE.AGAIN) {
    s.lapses += 1;
    s.ease = clampEase(s.ease - cfg.easePenaltyAgain, cfg);
    s.intervalDays = clampIntervalDays(Math.floor(s.intervalDays * cfg.lapseIntervalFactor), cfg);
    s.status = 'learning';
    s.step = Math.max(0, steps.length - 1); // one quick relearning step
    s.due = now + steps[s.step] * MIN;
    return s;
  }

  if (grade === GRADE.HARD) {
    s.ease = clampEase(s.ease - cfg.easePenaltyHard, cfg);
    s.intervalDays = clampIntervalDays(Math.ceil(s.intervalDays * cfg.hardIntervalFactor), cfg);
  } else if (grade === GRADE.GOOD) {
    s.intervalDays = clampIntervalDays(Math.ceil(s.intervalDays * s.ease), cfg);
  } else { // EASY
    s.ease = s.ease + cfg.easeBonusEasy;
    s.intervalDays = clampIntervalDays(Math.ceil(s.intervalDays * s.ease * cfg.easyIntervalFactor), cfg);
  }
  s.due = now + s.intervalDays * DAY;
  return s;
}

// ---------------------------------------------------------------------------
// Queue building
// ---------------------------------------------------------------------------

/** Local-day key (YYYY-MM-DD) for daily new-card accounting. */
export function dayKey(now, tzOffsetMin = 0) {
  const d = new Date(now - tzOffsetMin * MIN);
  return d.toISOString().slice(0, 10);
}

/**
 * Build today's study queue.
 * @param {Array<{id: string}>} cards - available cards (already filtered to unlocked topics)
 * @param {Object<string, object>} states - card id → state; missing means new
 * @param {number} now - epoch ms
 * @param {object} cfg
 * @param {number} newIntroducedToday - new cards already introduced today
 * @returns {{due: string[], learning: string[], fresh: string[]}} card id lists
 */
export function buildQueue(cards, states, now, cfg = DEFAULT_CONFIG, newIntroducedToday = 0) {
  const due = [];      // review cards whose due time has passed
  const learning = []; // learning cards due now (minute-scale)
  const fresh = [];    // never-seen cards, up to today's new allowance

  const newBudget = Math.max(0, cfg.newPerDay - newIntroducedToday);

  for (const card of cards) {
    const s = states[card.id];
    if (!s || s.status === 'new') {
      if (fresh.length < newBudget) fresh.push(card.id);
      continue;
    }
    if (s.due > now) continue;
    if (s.status === 'learning') learning.push(card.id);
    else if (due.length < cfg.maxReviewsPerDay) due.push(card.id);
  }

  // Most overdue first — highest forgetting risk gets reviewed first.
  const byDue = (a, b) => states[a].due - states[b].due;
  due.sort(byDue);
  learning.sort(byDue);
  return { due, learning, fresh };
}

/** Cards in learning that are scheduled later today (so the UI can say "come back in N min"). */
export function nextLearningDueAt(states, now) {
  let next = null;
  for (const s of Object.values(states)) {
    if (s.status === 'learning' && s.due > now) {
      if (next === null || s.due < next) next = s.due;
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * Mastery per topic in [0, 1]. A card contributes by how far along it is:
 * new = 0, learning = 0.25, review scales with interval up to 21 days = 1.
 */
export function topicMastery(cards, states) {
  const acc = {}; // topic → {sum, n}
  for (const card of cards) {
    const t = card.topic;
    if (!acc[t]) acc[t] = { sum: 0, n: 0 };
    acc[t].n += 1;
    const s = states[card.id];
    if (!s || s.status === 'new') continue;
    if (s.status === 'learning') acc[t].sum += 0.25;
    else acc[t].sum += 0.25 + 0.75 * Math.min(1, s.intervalDays / 21);
  }
  const out = {};
  for (const [t, { sum, n }] of Object.entries(acc)) out[t] = n ? sum / n : 0;
  return out;
}

/** Overall counts for the dashboard. */
export function overview(cards, states, now) {
  let fresh = 0, learning = 0, review = 0, dueNow = 0;
  for (const card of cards) {
    const s = states[card.id];
    if (!s || s.status === 'new') { fresh += 1; continue; }
    if (s.status === 'learning') learning += 1; else review += 1;
    if (s.due <= now) dueNow += 1;
  }
  return { fresh, learning, review, dueNow, total: cards.length };
}

/**
 * Update a day-streak record given that the user studied at `now`.
 * @param {{last: string|null, count: number}} streak
 */
export function bumpStreak(streak, now, tzOffsetMin = 0) {
  const today = dayKey(now, tzOffsetMin);
  if (streak.last === today) return { ...streak };
  const yesterday = dayKey(now - DAY, tzOffsetMin);
  const count = streak.last === yesterday ? streak.count + 1 : 1;
  return { last: today, count };
}
