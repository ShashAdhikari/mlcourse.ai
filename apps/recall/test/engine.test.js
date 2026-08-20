import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN, DAY, GRADE, DEFAULT_CONFIG,
  initState, applyGrade, buildQueue, nextLearningDueAt,
  topicMastery, overview, bumpStreak, dayKey,
} from '../src/engine.js';

const cfg = DEFAULT_CONFIG;
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0); // fixed clock

test('initState starts new and due immediately', () => {
  const s = initState(T0);
  assert.equal(s.status, 'new');
  assert.equal(s.due, T0);
  assert.equal(s.reps, 0);
  assert.equal(s.ease, cfg.startEase);
});

test('grading is pure: input state is not mutated', () => {
  const s = initState(T0);
  const frozen = JSON.stringify(s);
  applyGrade(s, GRADE.GOOD, T0);
  assert.equal(JSON.stringify(s), frozen);
});

test('invalid grade throws', () => {
  assert.throws(() => applyGrade(initState(T0), 5, T0), RangeError);
  assert.throws(() => applyGrade(initState(T0), -1, T0), RangeError);
});

test('new card: GOOD walks the learning steps then graduates at 1 day', () => {
  let s = initState(T0);
  s = applyGrade(s, GRADE.GOOD, T0);            // step 0 → 1
  assert.equal(s.status, 'learning');
  assert.equal(s.due, T0 + 10 * MIN);           // second step: 10 min
  s = applyGrade(s, GRADE.GOOD, s.due);         // graduates
  assert.equal(s.status, 'review');
  assert.equal(s.intervalDays, cfg.graduatingIntervalDays);
  assert.equal(s.due, T0 + 10 * MIN + 1 * DAY);
});

test('new card: AGAIN resets to first step', () => {
  let s = initState(T0);
  s = applyGrade(s, GRADE.GOOD, T0);
  s = applyGrade(s, GRADE.AGAIN, T0 + 10 * MIN);
  assert.equal(s.status, 'learning');
  assert.equal(s.step, 0);
  assert.equal(s.due, T0 + 10 * MIN + 1 * MIN);
});

test('new card: HARD repeats current step without advancing', () => {
  let s = initState(T0);
  s = applyGrade(s, GRADE.HARD, T0);
  assert.equal(s.status, 'learning');
  assert.equal(s.step, 0);
  assert.equal(s.due, T0 + 1 * MIN);
});

test('new card: EASY jumps straight to a 4-day review', () => {
  const s = applyGrade(initState(T0), GRADE.EASY, T0);
  assert.equal(s.status, 'review');
  assert.equal(s.intervalDays, cfg.easyIntervalDays);
  assert.equal(s.due, T0 + 4 * DAY);
});

test('review GOOD multiplies interval by ease', () => {
  let s = { ...initState(T0), status: 'review', intervalDays: 10, ease: 2.5, due: T0 };
  s = applyGrade(s, GRADE.GOOD, T0);
  assert.equal(s.intervalDays, 25);
  assert.equal(s.due, T0 + 25 * DAY);
  assert.equal(s.ease, 2.5); // GOOD leaves ease unchanged
});

test('review HARD: interval ×1.2, ease −0.15', () => {
  let s = { ...initState(T0), status: 'review', intervalDays: 10, ease: 2.5, due: T0 };
  s = applyGrade(s, GRADE.HARD, T0);
  assert.equal(s.intervalDays, 12);
  assert.ok(Math.abs(s.ease - 2.35) < 1e-9);
});

test('review EASY: ease bonus applied before multiplier', () => {
  let s = { ...initState(T0), status: 'review', intervalDays: 10, ease: 2.5, due: T0 };
  s = applyGrade(s, GRADE.EASY, T0);
  assert.ok(Math.abs(s.ease - 2.65) < 1e-9);
  assert.equal(s.intervalDays, Math.ceil(10 * 2.65 * cfg.easyIntervalFactor)); // 35
});

test('review AGAIN lapses: back to learning, ease floor respected', () => {
  let s = { ...initState(T0), status: 'review', intervalDays: 20, ease: 1.4, due: T0 };
  s = applyGrade(s, GRADE.AGAIN, T0);
  assert.equal(s.status, 'learning');
  assert.equal(s.lapses, 1);
  assert.equal(s.ease, cfg.minEase);          // 1.4 − 0.2 clamps at 1.3
  assert.equal(s.intervalDays, 10);           // halved, remembered for regraduation
  assert.equal(s.due, T0 + 10 * MIN);         // quick relearning step
});

test('interval never exceeds maxIntervalDays', () => {
  let s = { ...initState(T0), status: 'review', intervalDays: 300, ease: 2.5, due: T0 };
  s = applyGrade(s, GRADE.EASY, T0);
  assert.equal(s.intervalDays, cfg.maxIntervalDays);
});

test('interval growth over a realistic GOOD streak is monotonic', () => {
  let s = initState(T0);
  let now = T0;
  s = applyGrade(s, GRADE.GOOD, now); now = s.due;
  s = applyGrade(s, GRADE.GOOD, now); now = s.due;
  const seen = [];
  for (let i = 0; i < 6; i++) {
    s = applyGrade(s, GRADE.GOOD, now);
    seen.push(s.intervalDays);
    now = s.due;
  }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] > seen[i - 1], `${seen}`);
  assert.ok(seen.at(-1) <= cfg.maxIntervalDays);
});

// ---------------------------------------------------------------------------

const bank = [
  { id: 'a', topic: 'trees' }, { id: 'b', topic: 'trees' },
  { id: 'c', topic: 'linear' }, { id: 'd', topic: 'linear' },
  { id: 'e', topic: 'linear' },
];

test('buildQueue: unseen cards fill the new budget in bank order', () => {
  const q = buildQueue(bank, {}, T0, { ...cfg, newPerDay: 2 }, 0);
  assert.deepEqual(q.fresh, ['a', 'b']);
  assert.deepEqual(q.due, []);
});

test('buildQueue: new budget respects cards already introduced today', () => {
  const q = buildQueue(bank, {}, T0, { ...cfg, newPerDay: 3 }, 2);
  assert.deepEqual(q.fresh, ['a']);
  const q2 = buildQueue(bank, {}, T0, { ...cfg, newPerDay: 3 }, 7);
  assert.deepEqual(q2.fresh, []);
});

test('buildQueue: due reviews sorted most-overdue first, future ones excluded', () => {
  const states = {
    a: { ...initState(T0), status: 'review', intervalDays: 3, due: T0 - 2 * DAY },
    b: { ...initState(T0), status: 'review', intervalDays: 3, due: T0 - 5 * DAY },
    c: { ...initState(T0), status: 'review', intervalDays: 3, due: T0 + 1 * DAY },
    d: { ...initState(T0), status: 'learning', step: 1, due: T0 - 5 * MIN },
  };
  const q = buildQueue(bank, states, T0, cfg, 0);
  assert.deepEqual(q.due, ['b', 'a']);
  assert.deepEqual(q.learning, ['d']);
  assert.deepEqual(q.fresh, ['e']);
});

test('buildQueue: review cap enforced', () => {
  const states = Object.fromEntries(bank.map((c, i) => [
    c.id, { ...initState(T0), status: 'review', intervalDays: 2, due: T0 - i * MIN },
  ]));
  const q = buildQueue(bank, states, T0, { ...cfg, maxReviewsPerDay: 2 }, 0);
  assert.equal(q.due.length, 2);
});

test('nextLearningDueAt finds the soonest future learning card', () => {
  const states = {
    a: { ...initState(T0), status: 'learning', due: T0 + 9 * MIN },
    b: { ...initState(T0), status: 'learning', due: T0 + 3 * MIN },
    c: { ...initState(T0), status: 'review', due: T0 + 1 * MIN },
  };
  assert.equal(nextLearningDueAt(states, T0), T0 + 3 * MIN);
  assert.equal(nextLearningDueAt({}, T0), null);
});

test('topicMastery: new=0, learning=0.25, 21d review=1', () => {
  const states = {
    a: undefined,
    b: { ...initState(T0), status: 'learning' },
    c: { ...initState(T0), status: 'review', intervalDays: 21 },
    d: { ...initState(T0), status: 'review', intervalDays: 42 }, // capped at 1
    e: undefined,
  };
  const m = topicMastery(bank, states);
  assert.ok(Math.abs(m.trees - (0 + 0.25) / 2) < 1e-9);
  assert.ok(Math.abs(m.linear - (1 + 1 + 0) / 3) < 1e-9);
});

test('overview counts states and due-now', () => {
  const states = {
    a: { ...initState(T0), status: 'review', due: T0 - DAY },
    b: { ...initState(T0), status: 'learning', due: T0 + MIN },
  };
  const o = overview(bank, states, T0);
  assert.deepEqual(o, { fresh: 3, learning: 1, review: 1, dueNow: 1, total: 5 });
});

test('bumpStreak: same day idempotent, consecutive days increment, gap resets', () => {
  let s = bumpStreak({ last: null, count: 0 }, T0);
  assert.equal(s.count, 1);
  s = bumpStreak(s, T0 + 60 * MIN);            // same day
  assert.equal(s.count, 1);
  s = bumpStreak(s, T0 + DAY);                 // next day
  assert.equal(s.count, 2);
  s = bumpStreak(s, T0 + 4 * DAY);             // gap
  assert.equal(s.count, 1);
});

test('dayKey respects timezone offset', () => {
  const nearMidnightUTC = Date.UTC(2026, 0, 2, 0, 30);
  assert.equal(dayKey(nearMidnightUTC, 0), '2026-01-02');
  assert.equal(dayKey(nearMidnightUTC, 60), '2026-01-01'); // UTC+... offset in minutes west
});
