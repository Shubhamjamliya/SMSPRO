import { ValidationError } from '../../../core/auth/errors.js';
import { ServiceProviderProfile } from '../models/serviceProviderProfile.model.js';
import { ProviderAvailability, DAYS_OF_WEEK } from '../models/providerAvailability.model.js';
import { ProviderUnavailability } from '../models/providerUnavailability.model.js';
import { Booking } from '../models/booking.model.js';
import { timeToMinutes, isValidTimeFormat, isPastIstDate, dateStringToDayOfWeek } from '../utils/istTime.util.js';
import { rangesOverlap } from '../utils/availabilityMath.util.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const getOwnedProvider = async (providerId) => {
  const provider = await ServiceProviderProfile.findOne({ _id: providerId, isDeleted: { $ne: true } }).lean();
  if (!provider) throw new ValidationError('Service provider not found');
  return provider;
};

const getOrCreateAvailability = async (providerId) => {
  let doc = await ProviderAvailability.findOne({ providerId });
  if (!doc) {
    doc = await ProviderAvailability.create({
      providerId,
      weeklySchedule: DAYS_OF_WEEK.map((dayOfWeek) => ({ dayOfWeek, isEnabled: false, startTime: '', endTime: '', breaks: [] })),
    });
  }
  return doc;
};

export const getMyAvailability = async (providerId) => {
  await getOwnedProvider(providerId);
  const [availability, unavailableDates] = await Promise.all([
    getOrCreateAvailability(providerId),
    ProviderUnavailability.find({ providerId }).sort({ date: 1 }).lean(),
  ]);
  return {
    schedule: availability.weeklySchedule,
    bufferMinutes: availability.bufferMinutes,
    unavailableDates,
  };
};

/** Validates + normalizes a client-supplied weekly schedule payload. Throws with a
 *  specific, actionable message on the first rule violated — never trusts ordering,
 *  presence, or shape from the client beyond what's checked here. */
const validateWeeklySchedule = (schedule) => {
  if (!Array.isArray(schedule) || schedule.length !== 7) {
    throw new ValidationError('Provide all 7 days of the week');
  }

  const seenDays = new Set();
  const normalized = DAYS_OF_WEEK.map((dayOfWeek) => {
    const entry = schedule.find((d) => Number(d.dayOfWeek) === dayOfWeek);
    if (!entry) throw new ValidationError(`Missing schedule for ${DAY_NAMES[dayOfWeek]}`);
    if (seenDays.has(dayOfWeek)) throw new ValidationError(`Duplicate schedule entry for ${DAY_NAMES[dayOfWeek]}`);
    seenDays.add(dayOfWeek);

    const isEnabled = Boolean(entry.isEnabled);
    if (!isEnabled) {
      return { dayOfWeek, isEnabled: false, startTime: '', endTime: '', breaks: [] };
    }

    if (!isValidTimeFormat(entry.startTime) || !isValidTimeFormat(entry.endTime)) {
      throw new ValidationError(`Enter valid start/end times for ${DAY_NAMES[dayOfWeek]}`);
    }
    const dayStart = timeToMinutes(entry.startTime);
    const dayEnd = timeToMinutes(entry.endTime);
    if (dayStart >= dayEnd) {
      throw new ValidationError(`${DAY_NAMES[dayOfWeek]}: start time must be before end time`);
    }

    const breaksIn = Array.isArray(entry.breaks) ? entry.breaks : [];
    const normalizedBreaks = [];
    for (const brk of breaksIn) {
      if (!isValidTimeFormat(brk.startTime) || !isValidTimeFormat(brk.endTime)) {
        throw new ValidationError(`${DAY_NAMES[dayOfWeek]}: enter valid break start/end times`);
      }
      const bStart = timeToMinutes(brk.startTime);
      const bEnd = timeToMinutes(brk.endTime);
      if (bStart >= bEnd) {
        throw new ValidationError(`${DAY_NAMES[dayOfWeek]}: break start time must be before end time`);
      }
      if (bStart < dayStart || bEnd > dayEnd) {
        throw new ValidationError(`${DAY_NAMES[dayOfWeek]}: break must be inside working hours`);
      }
      const conflict = normalizedBreaks.some((existing) => rangesOverlap(bStart, bEnd, timeToMinutes(existing.startTime), timeToMinutes(existing.endTime)));
      if (conflict) {
        throw new ValidationError(`${DAY_NAMES[dayOfWeek]}: breaks cannot overlap each other`);
      }
      normalizedBreaks.push({ startTime: brk.startTime, endTime: brk.endTime });
    }

    return { dayOfWeek, isEnabled: true, startTime: entry.startTime, endTime: entry.endTime, breaks: normalizedBreaks };
  });

  return normalized;
};

/** Future confirmed bookings that would fall outside the given schedule — used to warn
 *  (never to silently cancel/modify) when a provider changes their weekly hours. */
const findScheduleConflicts = async (providerId, schedule, fromDate) => {
  const bookings = await Booking.find({ providerId, slotClaimed: true, date: { $gte: fromDate } })
    .select('date startTime endTime serviceName')
    .lean();
  if (!bookings.length) return [];

  const byDay = new Map(schedule.map((d) => [d.dayOfWeek, d]));
  const conflicts = [];
  for (const booking of bookings) {
    const dayOfWeek = dateStringToDayOfWeek(booking.date);
    const day = byDay.get(dayOfWeek);
    const bStart = timeToMinutes(booking.startTime);
    const bEnd = timeToMinutes(booking.endTime);

    if (!day?.isEnabled) {
      conflicts.push({ ...booking, reason: 'Day is now off' });
      continue;
    }
    const dayStart = timeToMinutes(day.startTime);
    const dayEnd = timeToMinutes(day.endTime);
    if (bStart < dayStart || bEnd > dayEnd) {
      conflicts.push({ ...booking, reason: 'Outside new working hours' });
      continue;
    }
    const crossesBreak = (day.breaks || []).some((brk) => rangesOverlap(bStart, bEnd, timeToMinutes(brk.startTime), timeToMinutes(brk.endTime)));
    if (crossesBreak) conflicts.push({ ...booking, reason: 'Now overlaps a break' });
  }
  return conflicts;
};

export const updateWeeklySchedule = async (providerId, body) => {
  const provider = await getOwnedProvider(providerId);
  const schedule = validateWeeklySchedule(body?.schedule);

  const bufferMinutes = body?.bufferMinutes === undefined ? undefined : Number(body.bufferMinutes);
  if (bufferMinutes !== undefined && (!Number.isFinite(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 240)) {
    throw new ValidationError('Buffer must be between 0 and 240 minutes');
  }

  const conflicts = await findScheduleConflicts(providerId, schedule, new Date().toISOString().slice(0, 10));

  const availability = await getOrCreateAvailability(providerId);
  availability.weeklySchedule = schedule;
  if (bufferMinutes !== undefined) availability.bufferMinutes = bufferMinutes;
  availability.updatedBy = provider._id;
  await availability.save();

  return { schedule: availability.weeklySchedule, bufferMinutes: availability.bufferMinutes, conflictingBookings: conflicts };
};

export const addUnavailableDate = async (providerId, body) => {
  await getOwnedProvider(providerId);

  const date = String(body?.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError('Enter a valid date');
  if (isPastIstDate(date)) throw new ValidationError('Cannot block a date in the past');

  const isFullDay = body?.isFullDay !== false;
  let startTime = '';
  let endTime = '';
  if (!isFullDay) {
    if (!isValidTimeFormat(body?.startTime) || !isValidTimeFormat(body?.endTime)) {
      throw new ValidationError('Enter valid start/end times');
    }
    startTime = body.startTime;
    endTime = body.endTime;
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      throw new ValidationError('Start time must be before end time');
    }

    // A partial (time-range) block only makes sense inside that day's own working
    // hours — outside them there's nothing to block that isn't already unavailable.
    const availability = await getOrCreateAvailability(providerId);
    const dayOfWeek = dateStringToDayOfWeek(date);
    const day = availability.weeklySchedule.find((d) => d.dayOfWeek === dayOfWeek);
    if (!day?.isEnabled) {
      throw new ValidationError('This day is already off — mark the whole day unavailable instead');
    }
    if (timeToMinutes(startTime) < timeToMinutes(day.startTime) || timeToMinutes(endTime) > timeToMinutes(day.endTime)) {
      throw new ValidationError('Unavailable time must be within your working hours for this day');
    }
  }

  const existing = await ProviderUnavailability.find({ providerId, date }).lean();

  if (isFullDay) {
    if (existing.length) throw new ValidationError('This date already has an unavailable entry — remove it first');
  } else {
    if (existing.some((e) => e.isFullDay)) {
      throw new ValidationError('This date is already fully blocked');
    }
    const newStart = timeToMinutes(startTime);
    const newEnd = timeToMinutes(endTime);
    const overlap = existing.some((e) => rangesOverlap(newStart, newEnd, timeToMinutes(e.startTime), timeToMinutes(e.endTime)));
    if (overlap) throw new ValidationError('This overlaps a time range you already blocked on this date');
  }

  const conflictFilter = { providerId, slotClaimed: true, date };
  const bookingsOnDate = await Booking.find(conflictFilter).select('date startTime endTime serviceName').lean();
  const conflicts = isFullDay
    ? bookingsOnDate
    : bookingsOnDate.filter((b) => rangesOverlap(timeToMinutes(b.startTime), timeToMinutes(b.endTime), timeToMinutes(startTime), timeToMinutes(endTime)));

  const entry = await ProviderUnavailability.create({
    providerId,
    date,
    isFullDay,
    startTime,
    endTime,
    reason: String(body?.reason || '').trim().slice(0, 200),
  });

  return { entry: entry.toObject(), conflictingBookings: conflicts };
};

export const removeUnavailableDate = async (providerId, entryId) => {
  await getOwnedProvider(providerId);
  const entry = await ProviderUnavailability.findOne({ _id: entryId, providerId });
  if (!entry) throw new ValidationError('Unavailable date entry not found');
  await entry.deleteOne();
  return { id: entryId };
};

export { getOrCreateAvailability, getOwnedProvider };
