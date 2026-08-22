// Lantern — timezone-aware time arithmetic.
//
// Everything here is pure and takes instants as epoch milliseconds. No
// Date.now() in this module: a safety system's timing must be reproducible in
// tests, including across daylight-saving transitions.
//
// Timezone support comes from Intl, which is built into Node — no dependency,
// and it tracks the IANA database that ships with the runtime.

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const PART_FORMATTERS = new Map();
function formatter(tz) {
  let f = PART_FORMATTERS.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      weekday: 'short',
    });
    PART_FORMATTERS.set(tz, f);
  }
  return f;
}

/** Throws if the zone is not one the runtime knows — fail at config time, not at 3am. */
export function assertValidZone(tz) {
  try {
    formatter(tz).format(0);
  } catch {
    throw new RangeError(`unknown time zone: ${tz}`);
  }
  return tz;
}

/** Wall-clock parts in `tz` at instant `ts`. */
export function localParts(ts, tz) {
  const parts = {};
  for (const p of formatter(tz).formatToParts(ts)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Some ICU versions render midnight as hour 24 under hour12:false.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
  };
}

/** Offset of `tz` from UTC at instant `ts`, in ms (positive east of Greenwich). */
export function zoneOffsetMs(ts, tz) {
  const p = localParts(ts, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Compare at second resolution; sub-second offsets do not exist in the IANA data.
  return asUTC - Math.floor(ts / SECOND) * SECOND;
}

/**
 * The instant at which `tz`'s wall clock reads the given local time.
 *
 * Two edge cases, both handled deterministically rather than thrown:
 *  - Spring-forward gaps (a local time that never occurs) resolve to the
 *    instant just after the jump.
 *  - Autumn-fallback repeats (a local time occurring twice) resolve to the
 *    first occurrence.
 * A check-in deadline landing in either is a nuisance, never a safety
 * failure, because the deadline still exists and still passes.
 */
export function fromLocal({ year, month, day, hour = 0, minute = 0, second = 0 }, tz) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = wall - zoneOffsetMs(wall, tz);
  // Two refinements settle every real-world zone, including 45-minute offsets.
  for (let i = 0; i < 2; i += 1) {
    const next = wall - zoneOffsetMs(guess, tz);
    if (next === guess) return guess;
    guess = next;
  }
  return guess;
}

/** Local midnight starting the day that contains `ts`. */
export function startOfLocalDay(ts, tz) {
  const p = localParts(ts, tz);
  return fromLocal({ year: p.year, month: p.month, day: p.day }, tz);
}

/** The instant of a given local hour:minute on the day containing `ts`. */
export function localTimeOnDay(ts, tz, hour, minute = 0) {
  const p = localParts(ts, tz);
  return fromLocal({ year: p.year, month: p.month, day: p.day, hour, minute }, tz);
}

// ---------------------------------------------------------------------------
// Quiet hours
// ---------------------------------------------------------------------------
// A quiet window is a local-time range that may wrap midnight (22:00 → 08:00).
// Its purpose is to stop the system demanding proof of life while someone is
// asleep — the single largest source of false alarms in a check-in service.

/** Does the wall clock in `tz` sit inside the quiet window at `ts`? */
export function inQuietHours(ts, tz, quiet) {
  if (!quiet) return false;
  const { startHour, endHour } = quiet;
  if (startHour === endHour) return false; // empty window, not a 24h one
  const { hour, minute } = localParts(ts, tz);
  const mins = hour * 60 + minute;
  const start = startHour * 60;
  const end = endHour * 60;
  return start < end
    ? mins >= start && mins < end
    : mins >= start || mins < end; // wraps midnight
}

/**
 * Move an instant forward to the end of the quiet window, if it falls inside.
 * Used to place deadlines: a check-in due at 03:00 is really due when the
 * person is plausibly awake.
 */
export function pushPastQuietHours(ts, tz, quiet) {
  if (!inQuietHours(ts, tz, quiet)) return ts;
  const { hour } = localParts(ts, tz);
  // If we are past midnight the window ends today, otherwise tomorrow.
  const wrapped = quiet.startHour > quiet.endHour;
  const endsTomorrow = wrapped && hour >= quiet.startHour;
  const base = endsTomorrow ? ts + DAY : ts;
  const out = localTimeOnDay(base, tz, quiet.endHour, 0);
  // Guard against a DST shift landing us back inside the window or behind ts.
  return out > ts ? out : ts;
}

/**
 * When must the next check-in happen?
 * @param {number} from - instant the clock restarts from (usually the last check-in)
 * @param {number} everyHours - the interval the person committed to
 * @param {string} tz
 * @param {{startHour:number,endHour:number}|null} quiet
 */
export function nextDeadline(from, everyHours, tz, quiet) {
  return pushPastQuietHours(from + everyHours * HOUR, tz, quiet);
}

/** Human-readable duration, for messages people read while worried. */
export function humanDuration(ms) {
  const abs = Math.abs(ms);
  if (abs < MINUTE) return 'less than a minute';
  if (abs < HOUR) {
    const m = Math.round(abs / MINUTE);
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  if (abs < DAY) {
    const h = Math.floor(abs / HOUR);
    const m = Math.round((abs % HOUR) / MINUTE);
    if (m === 0) return `${h} hour${h === 1 ? '' : 's'}`;
    return `${h} hour${h === 1 ? '' : 's'} ${m} minute${m === 1 ? '' : 's'}`;
  }
  const d = Math.floor(abs / DAY);
  const h = Math.round((abs % DAY) / HOUR);
  if (h === 0) return `${d} day${d === 1 ? '' : 's'}`;
  return `${d} day${d === 1 ? '' : 's'} ${h} hour${h === 1 ? '' : 's'}`;
}

/** Local wall-clock rendering for messages, e.g. "Tue 14 Jan, 20:00". */
export function formatLocal(ts, tz) {
  const p = localParts(ts, tz);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  return `${p.weekday} ${p.day} ${months[p.month - 1]}, ${hh}:${mm}`;
}
