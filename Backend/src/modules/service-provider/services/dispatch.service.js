import crypto from 'crypto';
import { ValidationError, NotFoundError } from '../../../core/auth/errors.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { ServiceProviderProfile } from '../models/serviceProviderProfile.model.js';
import { ProviderService } from '../models/providerService.model.js';
import { Service } from '../models/service.model.js';
import { Booking } from '../models/booking.model.js';
import { computeAvailableSlots } from './slotCalculation.service.js';
import { computeBookingPricing } from './pricing.service.js';
import { getOperationalSettings } from './operationalSettings.service.js';
import { detectServiceProviderZone } from './zoneAccess.service.js';
import { isValidTimeFormat, timeToMinutes, minutesToTime } from '../utils/istTime.util.js';
import { notifyProviderNewRequest, notifyCustomerStatus } from './notify.service.js';
import { stripProviderSensitiveFields } from '../utils/bookingSerializers.util.js';

export const NO_PROVIDER_MESSAGE = 'No service provider is available for your selected time. Please try another time.';
const isDup = (error) => error?.code === 11000;
const generateOtp = () => String(crypto.randomInt(100000, 1000000));

/**
 * Eligible providers for serviceId+zoneId who ALSO have the exact requested slot free
 * right now — reuses computeAvailableSlots per candidate (the same engine the
 * customer's own slot picker uses), so "eligible" here always means genuinely
 * bookable, never just "offers this service in this zone." Sorted by rating desc, then
 * _id for a stable, deterministic order (no rating yet = "New", sorts last).
 */
export const buildCandidateList = async ({ serviceId, zoneId, date, startTime, onlyProviderId = null }) => {
  const offers = await ProviderService.find({ serviceId, status: 'active' }).select('providerId price').lean();
  if (!offers.length) return [];

  const priceByProvider = new Map(offers.map((o) => [String(o.providerId), o.price]));
  let providerIds = offers.map((o) => String(o.providerId));
  if (onlyProviderId) {
    providerIds = providerIds.filter((id) => id === String(onlyProviderId));
    if (!providerIds.length) return [];
  }

  const providers = await ServiceProviderProfile.find({
    _id: { $in: providerIds },
    isDeleted: { $ne: true },
    isActive: { $ne: false },
    status: 'approved',
    zoneId,
  }).select('_id ownerName rating').lean();
  if (!providers.length) return [];

  const withSlot = [];
  for (const p of providers) {
    const result = await computeAvailableSlots({ providerId: p._id, serviceId, zoneId, date });
    if (result.slots.some((s) => s.startTime === startTime)) {
      withSlot.push({ _id: p._id, ownerName: p.ownerName, rating: p.rating || 0, providerPrice: priceByProvider.get(String(p._id)) ?? 0 });
    }
  }

  withSlot.sort((a, b) => b.rating - a.rating || String(a._id).localeCompare(String(b._id)));
  return withSlot;
};

/**
 * Creates a booking REQUEST — nothing is confirmed yet. Tries each eligible candidate
 * in order, claiming the (providerId, date, startTime) slot atomically via the
 * partial-unique index (see booking.model.js) on the FIRST successful insert; if a
 * candidate has been claimed elsewhere in the meantime, the insert throws a duplicate
 * key error and the loop moves on to the next candidate — this is what "sequential
 * fallback" means at request-creation time. 'specific' mode has a candidate list of
 * exactly one provider (no fallback beyond them, by design — see BookService flow).
 */
export const createBookingRequest = async (customerId, body = {}) => {
  const serviceId = String(body.serviceId || '');
  const date = String(body.date || '');
  const startTime = String(body.startTime || '');
  const mode = body.mode === 'specific' ? 'specific' : 'auto';
  const requestedProviderId = mode === 'specific' ? String(body.providerId || '') : null;
  const lat = Number(body.serviceLocation?.lat);
  const lng = Number(body.serviceLocation?.lng);
  const address = String(body.serviceLocation?.address || '').trim();

  if (!serviceId || !date || !isValidTimeFormat(startTime)) {
    throw new ValidationError('Service, date and time are required');
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ValidationError('A valid service location is required');
  }
  if (mode === 'specific' && !requestedProviderId) {
    throw new ValidationError('Select a provider or choose automatic matching');
  }

  // Zone is ALWAYS derived server-side from the given coordinates — a client-supplied
  // zoneId is never trusted for eligibility or matching.
  const zone = await detectServiceProviderZone(lat, lng);
  if (!zone) {
    throw new ValidationError('Service is not available in your area yet.');
  }

  const service = await Service.findOne({ _id: serviceId, isDeleted: { $ne: true }, status: 'active' })
    .populate('categoryId', 'name status isDeleted')
    .lean();
  if (!service || !service.categoryId || service.categoryId.status !== 'active' || service.categoryId.isDeleted) {
    throw new ValidationError('This service is not currently available');
  }

  const customer = await FoodUser.findById(customerId).select('name phone').lean();
  if (!customer) throw new ValidationError('Customer account not found');

  const candidates = await buildCandidateList({
    serviceId, zoneId: zone._id, date, startTime, onlyProviderId: requestedProviderId,
  });
  if (!candidates.length) {
    throw new ValidationError(NO_PROVIDER_MESSAGE);
  }

  const settings = await getOperationalSettings();
  const pricing = await computeBookingPricing(service.basePrice);
  const duration = Number(service.duration) > 0 ? Number(service.duration) : 60;
  const endTime = minutesToTime(timeToMinutes(startTime) + duration);
  const candidateIds = candidates.map((c) => c._id);

  let booking = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const now = new Date();
    const doc = new Booking({
      providerId: candidate._id,
      serviceId,
      categoryId: service.categoryId._id,
      zoneId: zone._id,
      customerId,
      serviceLocation: { lat, lng, address },
      serviceName: service.name,
      categoryName: service.categoryId.name,
      providerName: candidate.ownerName,
      durationMinutes: duration,
      adminPrice: pricing.adminPrice,
      providerPrice: candidate.providerPrice,
      platformFee: pricing.platformFee,
      taxAmount: pricing.taxAmount,
      totalAmount: pricing.totalAmount,
      finalPayableAmount: pricing.totalAmount,
      customerName: customer.name || '',
      customerPhone: customer.phone || '',
      date,
      startTime,
      endTime,
      status: 'requested',
      slotClaimed: true,
      dispatch: {
        mode,
        status: 'pending',
        candidateProviderIds: candidateIds,
        candidateIndex: i,
        offeredAt: now,
        respondBy: new Date(now.getTime() + settings.requestTimeoutSeconds * 1000),
        history: [{ providerId: candidate._id, offeredAt: now, action: 'offered' }],
      },
    });
    try {
      await doc.save();
      booking = doc;
      notifyProviderNewRequest(candidate._id, booking);
      break;
    } catch (error) {
      if (isDup(error)) continue; // claimed elsewhere in the meantime — try next candidate
      throw error;
    }
  }

  if (!booking) {
    throw new ValidationError(NO_PROVIDER_MESSAGE);
  }
  return booking.toObject();
};

/**
 * Moves a request past its current offer — used by explicit provider rejection AND by
 * the timeout sweep. Guarded by an atomic claim on a transient 'advancing' dispatch
 * status so a reject and a timeout racing the same offer can't both try to advance it.
 * Re-validates each remaining candidate's real-time availability (not just the
 * unique-index race guard) before offering, since a provider's own schedule may have
 * changed since the candidate list was built.
 */
const advancePastCurrentOffer = async (bookingId, expectedProviderId, action) => {
  const now = new Date();
  const claimed = await Booking.findOneAndUpdate(
    { _id: bookingId, providerId: expectedProviderId, status: 'requested', 'dispatch.status': 'pending' },
    { $set: { 'dispatch.status': 'advancing' } },
    { new: true },
  );
  if (!claimed) return null; // already handled by someone else (accept/reject/timeout race)

  const settings = await getOperationalSettings();
  const lastEntry = claimed.dispatch.history[claimed.dispatch.history.length - 1];
  if (lastEntry && !lastEntry.respondedAt) {
    lastEntry.respondedAt = now;
    lastEntry.action = action;
  }

  let nextIndex = claimed.dispatch.candidateIndex + 1;
  const candidateIds = claimed.dispatch.candidateProviderIds;

  while (nextIndex < candidateIds.length) {
    const nextProviderId = candidateIds[nextIndex];

    // eslint-disable-next-line no-await-in-loop
    const slotCheck = await computeAvailableSlots({
      providerId: nextProviderId, serviceId: claimed.serviceId, zoneId: claimed.zoneId, date: claimed.date,
    });
    const stillFree = slotCheck.slots.some((s) => s.startTime === claimed.startTime);
    if (!stillFree) {
      claimed.dispatch.history.push({ providerId: nextProviderId, offeredAt: now, respondedAt: now, action: 'conflict' });
      nextIndex += 1;
      continue; // eslint-disable-line no-continue
    }

    // eslint-disable-next-line no-await-in-loop
    const [providerProfile, offer] = await Promise.all([
      ServiceProviderProfile.findById(nextProviderId).select('ownerName').lean(),
      ProviderService.findOne({ providerId: nextProviderId, serviceId: claimed.serviceId, status: 'active' }).select('price').lean(),
    ]);

    claimed.providerId = nextProviderId;
    claimed.providerName = providerProfile?.ownerName || '';
    if (offer) claimed.providerPrice = offer.price;
    claimed.dispatch.candidateIndex = nextIndex;
    claimed.dispatch.status = 'pending';
    claimed.dispatch.offeredAt = now;
    claimed.dispatch.respondBy = new Date(now.getTime() + settings.requestTimeoutSeconds * 1000);
    claimed.dispatch.history.push({ providerId: nextProviderId, offeredAt: now, action: 'offered' });

    try {
      // eslint-disable-next-line no-await-in-loop
      await claimed.save();
      notifyProviderNewRequest(nextProviderId, claimed);
      return claimed;
    } catch (error) {
      if (isDup(error)) { nextIndex += 1; continue; } // eslint-disable-line no-continue
      throw error;
    }
  }

  // Every remaining candidate rejected/timed-out/conflicted — nobody left to offer.
  claimed.dispatch.status = 'exhausted';
  claimed.status = 'cancelled';
  claimed.slotClaimed = false;
  claimed.cancelledAt = now;
  claimed.cancelledBy = 'system';
  claimed.cancelReason = NO_PROVIDER_MESSAGE;
  await claimed.save();
  notifyCustomerStatus(claimed.customerId, claimed);
  return claimed;
};

export const acceptBookingRequest = async (providerId, bookingId) => {
  const otp = generateOtp();
  const now = new Date();
  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, providerId, status: 'requested', 'dispatch.status': 'pending' },
    {
      $set: { status: 'assigned', serviceOtp: otp, 'dispatch.status': 'accepted' },
      $push: { 'dispatch.history': { providerId, offeredAt: now, respondedAt: now, action: 'accepted' } },
    },
    { new: true },
  );
  if (!booking) {
    throw new ValidationError('This request is no longer available — it may have expired or already been handled');
  }
  notifyCustomerStatus(booking.customerId, booking);
  return stripProviderSensitiveFields(booking.toObject());
};

export const rejectBookingRequest = async (providerId, bookingId) => {
  const result = await advancePastCurrentOffer(bookingId, providerId, 'rejected');
  if (!result) {
    throw new ValidationError('This request is no longer available');
  }
  return stripProviderSensitiveFields(result.toObject());
};

/**
 * Background/lazy sweep: any 'requested' booking whose current offer is past its
 * respondBy deadline gets advanced (or exhausted) exactly like an explicit reject —
 * see operationalSettings for the configurable timeout window.
 */
export const sweepStalledRequests = async (filter = {}) => {
  const stalled = await Booking.find({
    ...filter,
    status: 'requested',
    'dispatch.status': 'pending',
    'dispatch.respondBy': { $lt: new Date() },
  }).select('_id providerId').lean();

  for (const b of stalled) {
    // eslint-disable-next-line no-await-in-loop
    await advancePastCurrentOffer(b._id, b.providerId, 'timed_out').catch(() => {});
  }
  return stalled.length;
};

export const listIncomingRequests = async (providerId) => {
  await sweepStalledRequests({ providerId });
  const requests = await Booking.find({ providerId, status: 'requested', 'dispatch.status': 'pending' })
    .sort({ 'dispatch.offeredAt': 1 })
    .lean();
  return requests.map(stripProviderSensitiveFields);
};

export const getBookingForCustomer = async (customerId, bookingId) => {
  await sweepStalledRequests({ customerId });
  const booking = await Booking.findOne({ _id: bookingId, customerId }).lean();
  if (!booking) throw new NotFoundError('Booking not found');
  return booking;
};
