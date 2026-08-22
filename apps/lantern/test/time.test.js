import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUR, MINUTE, DAY,
  assertValidZone, localParts, zoneOffsetMs, fromLocal,
  startOfLocalDay, localTimeOnDay,
  inQuietHours, pushPastQuietHours, nextDeadline,
  humanDuration, formatLocal,
} from '../src/time.js';

const LON = 'Europe/London';
const NYC = 'America/New_York';
const KTM = 'Asia/Kathmandu';   // UTC+05:45 — catches offset maths that assume whole hours
const UTC = 'UTC';

test('unknown zones are rejected at configuration time', () => {
  assert.throws(() => assertValidZone('Mars/Olympus'), RangeError);
  assert.equal(assertValidZone(LON), LON);
});

test('localParts reads the wall clock in the target zone', () => {
  const ts = Date.UTC(2026, 0, 15, 18, 30); // 18:30 UTC
  assert.deepEqual(
    { ...localParts(ts, UTC), weekday: undefined },
    { year: 2026, month: 1, day: 15, hour: 18, minute: 30, second: 0, weekday: undefined });
  assert.equal(localParts(ts, NYC).hour, 13);   // UTC-5 in January
  assert.equal(localParts(ts, KTM).hour, 0);    // +5:45 → next day 00:15
  assert.equal(localParts(ts, KTM).minute, 15);
  assert.equal(localParts(ts, KTM).day, 16);
});

test('midnight is reported as hour 0, never 24', () => {
  for (const tz of [UTC, LON, NYC, KTM]) {
    for (const month of [1, 6]) {
      const midnight = fromLocal({ year: 2026, month, day: 10 }, tz);
      assert.equal(localParts(midnight, tz).hour, 0, `${tz} month ${month}`);
    }
  }
});

test('zoneOffsetMs handles whole, half and quarter-hour zones', () => {
  const jan = Date.UTC(2026, 0, 15, 12);
  assert.equal(zoneOffsetMs(jan, UTC), 0);
  assert.equal(zoneOffsetMs(jan, NYC), -5 * HOUR);
  assert.equal(zoneOffsetMs(jan, KTM), 5 * HOUR + 45 * MINUTE);
  const jul = Date.UTC(2026, 6, 15, 12);
  assert.equal(zoneOffsetMs(jul, NYC), -4 * HOUR); // daylight saving
  assert.equal(zoneOffsetMs(jul, LON), 1 * HOUR);
});

test('fromLocal round-trips through localParts in every zone', () => {
  for (const tz of [UTC, LON, NYC, KTM]) {
    for (const [month, day, hour] of [[1, 15, 9], [6, 15, 23], [11, 3, 0], [3, 20, 14]]) {
      const ts = fromLocal({ year: 2026, month, day, hour, minute: 30 }, tz);
      const p = localParts(ts, tz);
      assert.deepEqual([p.year, p.month, p.day, p.hour, p.minute],
        [2026, month, day, hour, 30], `${tz} ${month}/${day} ${hour}:30`);
    }
  }
});

// --- daylight saving --------------------------------------------------------
// US 2026: forward 08 Mar 02:00→03:00, back 01 Nov 02:00→01:00.

test('a local time inside the spring-forward gap resolves to a real instant', () => {
  // 02:30 on 8 Mar 2026 never happens in New York.
  const ts = fromLocal({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, NYC);
  const p = localParts(ts, NYC);
  assert.equal(p.hour, 3, 'lands just after the jump');
  assert.equal(p.day, 8);
  assert.ok(Number.isFinite(ts));
});

test('an ambiguous autumn local time resolves to the first occurrence', () => {
  // 01:30 on 1 Nov 2026 happens twice in New York (EDT then EST).
  const ts = fromLocal({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, NYC);
  assert.equal(localParts(ts, NYC).hour, 1);
  assert.equal(zoneOffsetMs(ts, NYC), -4 * HOUR, 'the earlier, still-daylight instant');
});

test('a 24-hour interval across spring-forward is still 24 hours of real time', () => {
  // Elapsed time must not change just because the wall clock jumped: a
  // deadline of "24 hours from now" is a promise about real time.
  const before = fromLocal({ year: 2026, month: 3, day: 7, hour: 20 }, NYC);
  const deadline = nextDeadline(before, 24, NYC, null);
  assert.equal(deadline - before, 24 * HOUR);
  assert.equal(localParts(deadline, NYC).hour, 21, 'wall clock reads an hour later');
});

test('a 24-hour interval across autumn fallback is still 24 hours of real time', () => {
  const before = fromLocal({ year: 2026, month: 10, day: 31, hour: 20 }, NYC);
  const deadline = nextDeadline(before, 24, NYC, null);
  assert.equal(deadline - before, 24 * HOUR);
  assert.equal(localParts(deadline, NYC).hour, 19);
});

test('startOfLocalDay and localTimeOnDay respect the zone', () => {
  const ts = Date.UTC(2026, 0, 15, 3, 0); // 22:00 on the 14th in New York
  assert.equal(localParts(startOfLocalDay(ts, NYC), NYC).day, 14);
  assert.equal(localParts(startOfLocalDay(ts, NYC), NYC).hour, 0);
  const eight = localTimeOnDay(ts, NYC, 8);
  assert.equal(localParts(eight, NYC).hour, 8);
  assert.equal(localParts(eight, NYC).day, 14);
});

// --- quiet hours ------------------------------------------------------------

const QUIET = { startHour: 22, endHour: 8 }; // wraps midnight

test('inQuietHours handles windows that wrap midnight', () => {
  const at = (h, m = 0) => fromLocal({ year: 2026, month: 1, day: 15, hour: h, minute: m }, LON);
  assert.equal(inQuietHours(at(23), LON, QUIET), true);
  assert.equal(inQuietHours(at(3), LON, QUIET), true);
  assert.equal(inQuietHours(at(7, 59), LON, QUIET), true);
  assert.equal(inQuietHours(at(8), LON, QUIET), false, 'end is exclusive');
  assert.equal(inQuietHours(at(12), LON, QUIET), false);
  assert.equal(inQuietHours(at(22), LON, QUIET), true, 'start is inclusive');
  assert.equal(inQuietHours(at(21, 59), LON, QUIET), false);
});

test('inQuietHours handles windows inside one day, and no window at all', () => {
  const nap = { startHour: 13, endHour: 15 };
  const at = (h) => fromLocal({ year: 2026, month: 1, day: 15, hour: h }, LON);
  assert.equal(inQuietHours(at(14), LON, nap), true);
  assert.equal(inQuietHours(at(16), LON, nap), false);
  assert.equal(inQuietHours(at(3), LON, nap), false);
  assert.equal(inQuietHours(at(3), LON, null), false);
  assert.equal(inQuietHours(at(3), LON, { startHour: 5, endHour: 5 }), false, 'empty window');
});

test('a deadline landing at night is pushed to the end of quiet hours', () => {
  // Someone checking in at 15:00 with a 12-hour interval would otherwise be
  // due at 03:00 — the classic 3am false alarm this exists to prevent.
  const from = fromLocal({ year: 2026, month: 1, day: 15, hour: 15 }, LON);
  const deadline = nextDeadline(from, 12, LON, QUIET);
  const p = localParts(deadline, LON);
  assert.equal(p.hour, 8);
  assert.equal(p.day, 16, 'the following morning');
});

test('a deadline landing in the small hours moves to that same morning', () => {
  const from = fromLocal({ year: 2026, month: 1, day: 15, hour: 20 }, LON);
  const deadline = nextDeadline(from, 6, LON, QUIET); // 02:00
  const p = localParts(deadline, LON);
  assert.equal(p.hour, 8);
  assert.equal(p.day, 16);
});

test('a daytime deadline is left exactly where it falls', () => {
  const from = fromLocal({ year: 2026, month: 1, day: 15, hour: 9 }, LON);
  const deadline = nextDeadline(from, 6, LON, QUIET);
  assert.equal(deadline, from + 6 * HOUR);
  assert.equal(localParts(deadline, LON).hour, 15);
});

test('pushing past quiet hours never moves an instant backwards', () => {
  // Property: the returned deadline is always >= the input, in every zone,
  // at every hour of a DST-transition day. A deadline that moved backwards
  // would fire immediately and alarm someone's family for nothing.
  for (const tz of [UTC, LON, NYC, KTM]) {
    for (const [month, day] of [[3, 8], [11, 1], [3, 29], [10, 25], [6, 15]]) {
      for (let hour = 0; hour < 24; hour += 1) {
        for (const quiet of [QUIET, { startHour: 1, endHour: 6 }, { startHour: 20, endHour: 2 }]) {
          const ts = fromLocal({ year: 2026, month, day, hour, minute: 30 }, tz);
          const out = pushPastQuietHours(ts, tz, quiet);
          assert.ok(out >= ts, `${tz} ${month}/${day} ${hour}:30 moved backwards`);
          assert.ok(out - ts < 2 * DAY, `${tz} ${month}/${day} ${hour}:30 moved absurdly far`);
        }
      }
    }
  }
});

test('after pushing, the instant is outside the quiet window', () => {
  for (const tz of [UTC, LON, NYC, KTM]) {
    for (const quiet of [QUIET, { startHour: 1, endHour: 6 }, { startHour: 20, endHour: 2 }]) {
      for (let hour = 0; hour < 24; hour += 1) {
        const ts = fromLocal({ year: 2026, month: 11, day: 1, hour, minute: 15 }, tz);
        const out = pushPastQuietHours(ts, tz, quiet);
        assert.equal(inQuietHours(out, tz, quiet), false,
          `${tz} ${hour}:15 still quiet after push`);
      }
    }
  }
});

// --- presentation -----------------------------------------------------------

test('humanDuration reads naturally at every scale', () => {
  assert.equal(humanDuration(30 * 1000), 'less than a minute');
  assert.equal(humanDuration(1 * MINUTE), '1 minute');
  assert.equal(humanDuration(45 * MINUTE), '45 minutes');
  assert.equal(humanDuration(1 * HOUR), '1 hour');
  assert.equal(humanDuration(2 * HOUR + 30 * MINUTE), '2 hours 30 minutes');
  assert.equal(humanDuration(DAY), '1 day');
  assert.equal(humanDuration(2 * DAY + 3 * HOUR), '2 days 3 hours');
  assert.equal(humanDuration(-45 * MINUTE), '45 minutes', 'sign-agnostic');
});

test('formatLocal renders a wall clock people can act on', () => {
  const ts = fromLocal({ year: 2026, month: 1, day: 15, hour: 20, minute: 5 }, LON);
  assert.equal(formatLocal(ts, LON), 'Thu 15 Jan, 20:05');
  assert.equal(formatLocal(ts, NYC), 'Thu 15 Jan, 15:05');
});
