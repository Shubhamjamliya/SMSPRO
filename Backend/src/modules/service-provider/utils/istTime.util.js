/**
 * Timezone helpers for the availability/booking system — the app has no shared
 * timezone utility (other modules hardcode 'Asia/Kolkata' locally via an undeclared
 * `dayjs` transitive dependency); this uses only native `Intl`/`Date`, matching the
 * dependency-free pattern already used in taxi/utils/surge.util.js.
 */
const IST_TIMEZONE = 'Asia/Kolkata';

const WEEKDAY_TO_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** 'HH:mm' -> minutes since midnight. Returns null for anything unparseable. */
export const timeToMinutes = (hhmm) => {
  if (typeof hhmm !== 'string' || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};

/** minutes since midnight -> 'HH:mm'. */
export const minutesToTime = (mins) => {
  const clamped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const isValidTimeFormat = (hhmm) => timeToMinutes(hhmm) !== null;

/** { date: 'YYYY-MM-DD', dayOfWeek: 0-6, minutesOfDay } for `at` (default now), in IST. */
export const getIstParts = (at = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    dayOfWeek: WEEKDAY_TO_INDEX[map.weekday] ?? 0,
    minutesOfDay: hour * 60 + Number(map.minute),
  };
};

export const getTodayIstDate = () => getIstParts().date;

/** 'YYYY-MM-DD' -> day-of-week (0=Sun..6=Sat), computed in IST regardless of server TZ. */
export const dateStringToDayOfWeek = (dateStr) => {
  // Noon UTC avoids any DST/rounding edge landing on the wrong IST calendar day.
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return null;
  const at = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return getIstParts(at).dayOfWeek;
};

export const isPastIstDate = (dateStr) => String(dateStr) < getTodayIstDate();

export { IST_TIMEZONE };
