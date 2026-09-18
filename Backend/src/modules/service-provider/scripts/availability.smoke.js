/**
 * Smoke checks for the availability/booking pure-logic helpers (no DB required).
 * Run: node Backend/src/modules/service-provider/scripts/availability.smoke.js
 */
import { timeToMinutes, minutesToTime, isValidTimeFormat, dateStringToDayOfWeek, isPastIstDate } from '../utils/istTime.util.js';
import { rangesOverlap, isRangeWithin, subtractRanges } from '../utils/availabilityMath.util.js';

let passed = 0;
let failed = 0;

const assert = (cond, msg) => {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
};

console.log('Time conversion');
assert(timeToMinutes('10:00') === 600, '10:00 -> 600 minutes');
assert(timeToMinutes('19:00') === 1140, '19:00 -> 1140 minutes');
assert(timeToMinutes('9:5') === null, 'rejects malformed HH:mm');
assert(timeToMinutes('25:00') === null, 'rejects hour > 23');
assert(minutesToTime(600) === '10:00', '600 minutes -> 10:00');
assert(minutesToTime(60) === '01:00', 'pads single-digit hour');
assert(isValidTimeFormat('09:30') === true, 'accepts valid HH:mm');
assert(isValidTimeFormat('9:30pm') === false, 'rejects non-24h format');

console.log('Range math');
assert(rangesOverlap(600, 660, 630, 690) === true, 'overlapping ranges detected');
assert(rangesOverlap(600, 660, 660, 720) === false, 'back-to-back ranges do not overlap (half-open)');
assert(rangesOverlap(600, 660, 700, 760) === false, 'disjoint ranges do not overlap');
assert(isRangeWithin(650, 700, 600, 900) === true, 'inner range within outer');
assert(isRangeWithin(550, 700, 600, 900) === false, 'range starting before outer is not within');

console.log('subtractRanges — the core slot-carving algorithm');
{
  // Working 10:00-19:00 (600-1140), break 13:00-14:00 (780-840)
  const open = subtractRanges(600, 1140, [{ start: 780, end: 840 }]);
  assert(open.length === 2, 'one break splits the day into two open windows');
  assert(open[0].start === 600 && open[0].end === 780, 'first window ends at break start');
  assert(open[1].start === 840 && open[1].end === 1140, 'second window starts at break end');
}
{
  // Cut fully covers the window
  const open = subtractRanges(600, 660, [{ start: 500, end: 700 }]);
  assert(open.length === 0, 'a cut fully covering the window leaves nothing open');
}
{
  // Cut outside the window has no effect
  const open = subtractRanges(600, 660, [{ start: 700, end: 800 }]);
  assert(open.length === 1 && open[0].start === 600 && open[0].end === 660, 'a cut outside the window is a no-op');
}
{
  // Multiple non-overlapping cuts
  const open = subtractRanges(0, 1440, [{ start: 780, end: 840 }, { start: 1000, end: 1020 }]);
  assert(open.length === 3, 'two breaks produce three open windows');
}

console.log('Date/day-of-week');
assert(dateStringToDayOfWeek('2026-08-10') === 1, '2026-08-10 is a Monday (dayOfWeek 1)');
assert(dateStringToDayOfWeek('2026-08-16') === 0, '2026-08-16 is a Sunday (dayOfWeek 0)');
assert(typeof isPastIstDate('2000-01-01') === 'boolean', 'isPastIstDate returns a boolean');
assert(isPastIstDate('2000-01-01') === true, 'a date from 2000 is in the past');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
