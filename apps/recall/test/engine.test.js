import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN, DAY, GRADE, DEFAULT_CONFIG,
  initState, applyGrade, buildQueue, nextLearningDueAt,
  topicMastery, overview, bumpStreak, dayKey,
  roundRobin, orderSession, cardMastery, masteryOf,
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

// ---------------------------------------------------------------------------
// session ordering (multi-deck)
// ---------------------------------------------------------------------------

test('roundRobin interleaves groups and preserves within-group order', () => {
  const deckOf = (id) => id[0];
  const out = roundRobin(['a1', 'a2', 'a3', 'b1', 'b2', 'c1'], deckOf);
  assert.deepEqual(out, ['a1', 'b1', 'c1', 'a2', 'b2', 'a3']);
});

test('roundRobin returns every id exactly once, even with one group', () => {
  const ids = ['x1', 'x2', 'x3'];
  assert.deepEqual(roundRobin(ids, () => 'x'), ids);
  assert.deepEqual(roundRobin([], () => 'x'), []);
});

test('orderSession puts learning first, then reviews with new cards spaced in', () => {
  const out = orderSession({
    learning: ['L1'],
    due: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'],
    fresh: ['n1', 'n2'],
  }, () => 'one', 3);
  assert.deepEqual(out, ['L1', 'd1', 'd2', 'd3', 'n1', 'd4', 'd5', 'd6', 'n2']);
});

test('orderSession appends leftover new cards when reviews run out', () => {
  const out = orderSession({ due: ['d1'], fresh: ['n1', 'n2'] }, () => 'one', 3);
  assert.deepEqual(out, ['d1', 'n1', 'n2']);
});

test('orderSession loses no cards and never duplicates', () => {
  const q = {
    learning: ['ml:a', 'phys:b'],
    due: ['ml:c', 'phys:d', 'logic:e'],
    fresh: ['ml:f', 'logic:g'],
  };
  const out = orderSession(q, (id) => id.split(':')[0]);
  const all = [...q.learning, ...q.due, ...q.fresh];
  assert.equal(out.length, all.length);
  assert.deepEqual([...out].sort(), [...all].sort());
});

test('orderSession spreads decks rather than blocking one subject', () => {
  const due = ['ml:1', 'ml:2', 'ml:3', 'phys:1', 'phys:2', 'phys:3'];
  const out = orderSession({ due }, (id) => id.split(':')[0]);
  const decks = out.map((id) => id.split(':')[0]);
  // No three consecutive cards from the same deck.
  for (let i = 2; i < decks.length; i++) {
    assert.ok(!(decks[i] === decks[i - 1] && decks[i] === decks[i - 2]),
      `three in a row at ${i}: ${decks}`);
  }
});

// ---------------------------------------------------------------------------
// mastery
// ---------------------------------------------------------------------------

test('cardMastery scales from unseen to fully known', () => {
  assert.equal(cardMastery(undefined), 0);
  assert.equal(cardMastery({ status: 'new' }), 0);
  assert.equal(cardMastery({ status: 'learning' }), 0.25);
  assert.equal(cardMastery({ status: 'review', intervalDays: 21 }), 1);
  assert.equal(cardMastery({ status: 'review', intervalDays: 100 }), 1); // capped
  assert.ok(cardMastery({ status: 'review', intervalDays: 7 }) > 0.25);
});

test('masteryOf averages over a card set and handles the empty set', () => {
  const states = {
    a: { status: 'review', intervalDays: 21 },
    b: { status: 'learning' },
  };
  const m = masteryOf([{ id: 'a' }, { id: 'b' }, { id: 'missing' }], states);
  assert.ok(Math.abs(m - (1 + 0.25 + 0) / 3) < 1e-9);
  assert.equal(masteryOf([], states), 0);
});

test('buildQueue spreads the new-card budget across groups', () => {
  // Regression: taking the first N in bank order handed a new user ten cards
  // from whichever deck sorted first and nothing from the other eight.
  const cards = [];
  for (const deck of ['aaa', 'bbb', 'ccc']) {
    for (let i = 0; i < 10; i++) cards.push({ id: `${deck}:${i}`, topic: `${deck}:t` });
  }
  const groupOf = (id) => id.split(':')[0];
  const q = buildQueue(cards, {}, T0, { ...cfg, newPerDay: 6 }, 0, groupOf);
  assert.equal(q.fresh.length, 6);
  const decks = new Set(q.fresh.map(groupOf));
  assert.equal(decks.size, 3, `expected all three decks, got ${[...q.fresh]}`);
});

test('buildQueue without a group function keeps bank order', () => {
  const q = buildQueue(bank, {}, T0, { ...cfg, newPerDay: 3 }, 0);
  assert.deepEqual(q.fresh, ['a', 'b', 'c']);
});

test('buildQueue new budget still respects cards introduced today when grouping', () => {
  const cards = [{ id: 'x:1', topic: 't' }, { id: 'y:1', topic: 't' }, { id: 'x:2', topic: 't' }];
  const q = buildQueue(cards, {}, T0, { ...cfg, newPerDay: 5 }, 4, (id) => id[0]);
  assert.equal(q.fresh.length, 1);
});
