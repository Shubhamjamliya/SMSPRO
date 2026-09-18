import { ServiceProviderProfile } from '../models/serviceProviderProfile.model.js';
import { Service } from '../models/service.model.js';
import { ServiceZone } from '../models/serviceZone.model.js';
import { ProviderService } from '../models/providerService.model.js';
import { ProviderAvailability } from '../models/providerAvailability.model.js';
import { ProviderUnavailability } from '../models/providerUnavailability.model.js';
import { Booking } from '../models/booking.model.js';
import { timeToMinutes, minutesToTime, dateStringToDayOfWeek, isPastIstDate, getIstParts } from '../utils/istTime.util.js';
import { subtractRanges, rangesOverlap } from '../utils/availabilityMath.util.js';

const DEFAULT_DURATION_MINUTES = 60;

/**
 * The single source of truth for "what can a customer actually book" — Provider working
 * schedule + breaks + unavailable dates/times + existing confirmed bookings + service
 * duration + booking buffer. Nothing is ever read from a pre-stored slot list; every
 * call recomputes from these live inputs. Returns { slots, unavailableReason, ...context }
 * — `slots` is empty with a reason whenever any eligibility rule fails, so the caller can
 * show a clear message instead of a bare empty state.
 */
export const computeAvailableSlots = async ({ providerId, serviceId, zoneId, date }) => {
  if (!providerId || !serviceId || !zoneId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    return { slots: [], unavailableReason: 'invalid_request' };
  }
  if (isPastIstDate(date)) {
    return { slots: [], unavailableReason: 'past_date' };
  }

  const [provider, service] = await Promise.all([
    ServiceProviderProfile.findOne({ _id: providerId, isDeleted: { $ne: true } }).lean(),
    Service.findOne({ _id: serviceId, isDeleted: { $ne: true } }).lean(),
  ]);

  if (!provider || provider.status !== 'approved' || provider.isActive === false) {
    return { slots: [], unavailableReason: 'provider_unavailable' };
  }
  if (!service || service.status !== 'active') {
    return { slots: [], unavailableReason: 'service_unavailable' };
  }
  if (!provider.zoneId || String(provider.zoneId) !== String(zoneId)) {
    return { slots: [], unavailableReason: 'zone_mismatch' };
  }

  const zone = await ServiceZone.findOne({ _id: zoneId, isDeleted: { $ne: true }, status: 'active' }).select('_id name').lean();
  if (!zone) {
    return { slots: [], unavailableReason: 'zone_inactive' };
  }

  const offer = await ProviderService.findOne({ providerId, serviceId, status: 'active' }).select('price').lean();
  if (!offer) {
    return { slots: [], unavailableReason: 'service_not_offered' };
  }

  const availability = await ProviderAvailability.findOne({ providerId }).lean();
  if (!availability) {
    return { slots: [], unavailableReason: 'no_schedule' };
  }

  const dayOfWeek = dateStringToDayOfWeek(date);
  const day = (availability.weeklySchedule || []).find((d) => d.dayOfWeek === dayOfWeek);
  if (!day?.isEnabled) {
    return { slots: [], unavailableReason: 'day_off' };
  }

  const dayStart = timeToMinutes(day.startTime);
  const dayEnd = timeToMinutes(day.endTime);
  if (dayStart === null || dayEnd === null) {
    return { slots: [], unavailableReason: 'day_off' };
  }

  const unavailableEntries = await ProviderUnavailability.find({ providerId, date }).lean();
  if (unavailableEntries.some((e) => e.isFullDay)) {
    return { slots: [], unavailableReason: 'date_blocked' };
  }

  const cuts = [
    ...(day.breaks || []).map((b) => ({ start: timeToMinutes(b.startTime), end: timeToMinutes(b.endTime) })),
    ...unavailableEntries.map((e) => ({ start: timeToMinutes(e.startTime), end: timeToMinutes(e.endTime) })),
  ].filter((r) => r.start !== null && r.end !== null);

  const openWindows = subtractRanges(dayStart, dayEnd, cuts);

  const duration = Number(service.duration) > 0 ? Number(service.duration) : DEFAULT_DURATION_MINUTES;
  const bufferMinutes = Number(availability.bufferMinutes) || 0;
  const step = duration + bufferMinutes;

  const candidates = [];
  for (const window of openWindows) {
    for (let start = window.start; start + duration <= window.end; start += step) {
      candidates.push({ start, end: start + duration });
    }
  }

  // slotClaimed:true covers the booking's ENTIRE life from 'requested' (currently
  // offered/held, before any provider has even accepted) through every execution status
  // up to (but excluding) 'cancelled' — see ACTIVE_BOOKING_STATUSES on the model.
  const existingBookings = await Booking.find({ providerId, date, slotClaimed: true })
    .select('startTime endTime')
    .lean();
  // Padded by the buffer on both sides — a candidate slot must leave the configured
  // gap before AND after an existing booking, not just avoid literally overlapping it.
  const bookedRangesPadded = existingBookings
    .map((b) => ({ start: timeToMinutes(b.startTime) - bufferMinutes, end: timeToMinutes(b.endTime) + bufferMinutes }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end));

  let freeSlots = candidates.filter((slot) => !bookedRangesPadded.some((b) => rangesOverlap(slot.start, slot.end, b.start, b.end)));

  const todayParts = getIstParts();
  if (date === todayParts.date) {
    freeSlots = freeSlots.filter((slot) => slot.start > todayParts.minutesOfDay);
  }

  return {
    slots: freeSlots.map((s) => ({ startTime: minutesToTime(s.start), endTime: minutesToTime(s.end) })),
    unavailableReason: freeSlots.length ? null : 'fully_booked',
    service: { _id: service._id, name: service.name, duration, adminPrice: service.basePrice, providerPrice: offer.price },
    provider: { _id: provider._id, ownerName: provider.ownerName },
    zone: { _id: zone._id, name: zone.name },
    bufferMinutes,
  };
};

/**
 * The customer picks a date+time BEFORE picking a provider (spec: "Date & Time →
 * Available Providers"), so this answers "on this date, at what times is AT LEAST ONE
 * eligible provider free" — the union of every eligible provider's own
 * computeAvailableSlots for this service+zone+date, deduped by startTime. The actual
 * per-provider eligibility for a chosen slot is re-derived by buildCandidateList
 * (dispatch.service.js) when the request is created — this is a display aid only.
 */
export const computeAvailableSlotsForZone = async ({ serviceId, zoneId, date }) => {
  if (!serviceId || !zoneId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    return { slots: [], unavailableReason: 'invalid_request', service: null };
  }
  if (isPastIstDate(date)) {
    return { slots: [], unavailableReason: 'past_date', service: null };
  }

  const service = await Service.findOne({ _id: serviceId, isDeleted: { $ne: true }, status: 'active' }).lean();
  if (!service) {
    return { slots: [], unavailableReason: 'service_unavailable', service: null };
  }

  const offers = await ProviderService.find({ serviceId, status: 'active' }).select('providerId').lean();
  const providerIds = offers.map((o) => o.providerId);
  const providers = providerIds.length
    ? await ServiceProviderProfile.find({
      _id: { $in: providerIds }, isDeleted: { $ne: true }, isActive: { $ne: false }, status: 'approved', zoneId,
    }).select('_id').lean()
    : [];

  const duration = Number(service.duration) > 0 ? Number(service.duration) : DEFAULT_DURATION_MINUTES;
  if (!providers.length) {
    return { slots: [], unavailableReason: 'no_providers', service: { _id: service._id, name: service.name, duration, adminPrice: service.basePrice } };
  }

  const slotMap = new Map();
  for (const p of providers) {
    // eslint-disable-next-line no-await-in-loop
    const result = await computeAvailableSlots({ providerId: p._id, serviceId, zoneId, date });
    for (const s of result.slots) {
      const existing = slotMap.get(s.startTime);
      if (existing) existing.providerCount += 1;
      else slotMap.set(s.startTime, { startTime: s.startTime, endTime: s.endTime, providerCount: 1 });
    }
  }

  const slots = [...slotMap.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
  return {
    slots,
    unavailableReason: slots.length ? null : 'fully_booked',
    service: { _id: service._id, name: service.name, duration, adminPrice: service.basePrice },
  };
};
