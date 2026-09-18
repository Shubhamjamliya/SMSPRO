import { ValidationError, NotFoundError } from '../../../core/auth/errors.js';
import { Booking } from '../models/booking.model.js';
import { ServiceProviderProfile } from '../models/serviceProviderProfile.model.js';
import { notifyCustomerStatus, notifyProviderStatus } from './notify.service.js';
import { stripProviderSensitiveFields } from '../utils/bookingSerializers.util.js';

/** Legal status transitions for the post-acceptance execution lifecycle — same
 *  assert-on-every-mutation guard pattern as Taxi's rideStateMachine.js. */
const EXECUTION_TRANSITIONS = {
  assigned: ['provider_on_the_way', 'provider_arrived'],
  provider_on_the_way: ['provider_arrived'],
  provider_arrived: ['service_started'],
  service_started: ['service_completed'],
  service_completed: ['customer_confirmed'],
};

const assertExecutionTransition = (from, to) => {
  const allowed = EXECUTION_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new ValidationError(`This booking cannot move from ${from.replace(/_/g, ' ')} to ${to.replace(/_/g, ' ')} right now`);
  }
};

const assertOwnedByProvider = (booking, providerId) => {
  if (String(booking.providerId) !== String(providerId)) {
    throw new ValidationError('You are not authorized for this booking');
  }
};

const normalizeMediaList = (list) =>
  (Array.isArray(list) ? list : [])
    .map((item) => ({ url: String(item?.url || '').trim(), publicId: String(item?.publicId || '').trim() }))
    .filter((item) => item.url)
    .slice(0, 10);

const loadOwnedBooking = async (providerId, bookingId) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new NotFoundError('Booking not found');
  assertOwnedByProvider(booking, providerId);
  return booking;
};

/** After a status-guarded findOneAndUpdate returns null (meaning the ownership+status
 *  filter didn't match — e.g. a concurrent duplicate request already won the race),
 *  re-reads the doc with NO status filter purely to throw the same specific error the
 *  old load-then-mutate pattern gave: "not found" / "not yours" / assertExecutionTransition's
 *  "cannot move from X to Y" — never a generic conflict message when we can be precise. */
const explainTransitionFailure = async (bookingId, ownerField, ownerId, toStatus) => {
  const existing = await Booking.findById(bookingId).select(`${ownerField} status`).lean();
  if (!existing) throw new NotFoundError('Booking not found');
  if (String(existing[ownerField]) !== String(ownerId)) {
    throw new ValidationError('You are not authorized for this booking');
  }
  assertExecutionTransition(existing.status, toStatus); // always throws in this branch
};

export const markOnTheWay = async (providerId, bookingId) => {
  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, providerId, status: 'assigned' },
    { $set: { status: 'provider_on_the_way', onTheWayAt: new Date() } },
    { new: true },
  );
  if (!booking) await explainTransitionFailure(bookingId, 'providerId', providerId, 'provider_on_the_way');
  notifyCustomerStatus(booking.customerId, booking);
  return stripProviderSensitiveFields(booking.toObject());
};

export const markArrived = async (providerId, bookingId) => {
  // 'assigned' can jump straight to 'provider_arrived' too (see EXECUTION_TRANSITIONS),
  // so both starting states are valid here, not just 'provider_on_the_way'.
  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, providerId, status: { $in: ['assigned', 'provider_on_the_way'] } },
    { $set: { status: 'provider_arrived', arrivedAt: new Date() } },
    { new: true },
  );
  if (!booking) await explainTransitionFailure(bookingId, 'providerId', providerId, 'provider_arrived');
  notifyCustomerStatus(booking.customerId, booking);
  return stripProviderSensitiveFields(booking.toObject());
};

/** OTP-gated — mirrors Taxi's rideOtp-at-accept-time pattern (the OTP was generated
 *  and shown to the customer the moment the provider accepted the request). Also
 *  requires at least one before-photo, mirroring Bike Rent's pickup-inspection gate. */
export const startService = async (providerId, bookingId, { otp, beforePhotos = [] } = {}) => {
  const booking = await loadOwnedBooking(providerId, bookingId);
  assertExecutionTransition(booking.status, 'service_started');

  const submitted = String(otp || '').trim();
  if (!/^\d{6}$/.test(submitted)) {
    throw new ValidationError('Enter the 6-digit OTP shared by the customer');
  }
  if (submitted !== booking.serviceOtp) {
    throw new ValidationError('Invalid OTP');
  }

  const photos = normalizeMediaList(beforePhotos);
  if (!photos.length) {
    throw new ValidationError('Upload at least one before-service photo');
  }

  const updated = await Booking.findOneAndUpdate(
    { _id: bookingId, providerId, status: 'provider_arrived' },
    { $set: { beforePhotos: photos, status: 'service_started', startedAt: new Date() } },
    { new: true },
  );
  if (!updated) {
    // A concurrent duplicate already flipped it in the tiny window since our read above —
    // the OTP already did its job on the winning request, so don't re-run OTP checks.
    throw new ValidationError('This service has already been started');
  }
  notifyCustomerStatus(updated.customerId, updated);
  return stripProviderSensitiveFields(updated.toObject());
};

export const completeService = async (providerId, bookingId, { afterPhotos = [], completionNotes = '' } = {}) => {
  // Photo/notes validation is pure request-body validation, independent of the
  // booking's current DB state — no read needed before the guarded write.
  const photos = normalizeMediaList(afterPhotos);
  if (!photos.length) {
    throw new ValidationError('Upload at least one after-service photo');
  }
  const notes = String(completionNotes || '').trim().slice(0, 1000);

  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, providerId, status: 'service_started' },
    { $set: { afterPhotos: photos, completionNotes: notes, status: 'service_completed', serviceCompletedAt: new Date() } },
    { new: true },
  );
  if (!booking) await explainTransitionFailure(bookingId, 'providerId', providerId, 'service_completed');
  notifyCustomerStatus(booking.customerId, booking);
  return stripProviderSensitiveFields(booking.toObject());
};

export const confirmCompletion = async (customerId, bookingId) => {
  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, customerId, status: 'service_completed' },
    { $set: { status: 'customer_confirmed', customerConfirmedAt: new Date() } },
    { new: true },
  );
  if (!booking) await explainTransitionFailure(bookingId, 'customerId', customerId, 'customer_confirmed');
  notifyProviderStatus(booking.providerId, booking);
  return booking.toObject(); // customer-facing — do NOT strip serviceOtp
};

/** Provider-initiated, customer-approved additional charge — only while the job is
 *  actually in progress. Admin approval is deliberately not required (per spec). */
export const addExtraCharge = async (providerId, bookingId, { description, amount } = {}) => {
  const booking = await loadOwnedBooking(providerId, bookingId);
  if (!['service_started', 'service_completed'].includes(booking.status)) {
    throw new ValidationError('Extra charges can only be added while the service is in progress');
  }

  const desc = String(description || '').trim();
  const amt = Number(amount);
  if (!desc) throw new ValidationError('Describe the extra work or charge');
  if (!Number.isFinite(amt) || amt <= 0) throw new ValidationError('Enter a valid amount');

  booking.extraCharges.push({ description: desc, amount: amt, status: 'pending', requestedAt: new Date() });
  await booking.save();
  notifyCustomerStatus(booking.customerId, booking);
  return stripProviderSensitiveFields(booking.toObject());
};

const recomputeFinalPayable = (booking) => {
  const approvedExtra = booking.extraCharges
    .filter((c) => c.status === 'approved')
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  booking.finalPayableAmount = Math.round((Number(booking.totalAmount) + approvedExtra) * 100) / 100;
};

export const respondToExtraCharge = async (customerId, bookingId, extraChargeId, approve) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new NotFoundError('Booking not found');
  if (String(booking.customerId) !== String(customerId)) {
    throw new ValidationError('You are not authorized for this booking');
  }
  const charge = booking.extraCharges.id(extraChargeId);
  if (!charge) throw new NotFoundError('Extra charge not found');
  if (charge.status !== 'pending') {
    throw new ValidationError('This extra charge has already been responded to');
  }
  charge.status = approve ? 'approved' : 'rejected';
  charge.respondedAt = new Date();
  recomputeFinalPayable(booking);
  await booking.save();
  notifyProviderStatus(booking.providerId, booking);
  return booking.toObject();
};

export const submitRating = async (customerId, bookingId, { stars, comment } = {}) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new NotFoundError('Booking not found');
  if (String(booking.customerId) !== String(customerId)) {
    throw new ValidationError('You are not authorized for this booking');
  }
  if (booking.status !== 'completed') {
    throw new ValidationError('You can rate this booking once it is completed');
  }
  if (booking.rating?.stars) {
    throw new ValidationError('You have already rated this booking');
  }
  const starsNum = Number(stars);
  if (!Number.isFinite(starsNum) || starsNum < 1 || starsNum > 5) {
    throw new ValidationError('Rating must be between 1 and 5');
  }

  booking.rating = { stars: starsNum, comment: String(comment || '').trim().slice(0, 1000), ratedAt: new Date() };
  await booking.save();

  const provider = await ServiceProviderProfile.findById(booking.providerId).select('rating totalRatings');
  if (provider) {
    const newTotal = (provider.totalRatings || 0) + 1;
    const newAvg = ((provider.rating || 0) * (provider.totalRatings || 0) + starsNum) / newTotal;
    provider.rating = Math.round(newAvg * 10) / 10;
    provider.totalRatings = newTotal;
    await provider.save();
  }

  return booking.toObject();
};

/** The provider's own rating of the customer — same shape and rules as submitRating,
 *  opposite direction. Not aggregated onto the customer's (shared, cross-module
 *  FoodUser) profile — this is per-booking feedback only, scoped to this module. */
export const submitCustomerRating = async (providerId, bookingId, { stars, comment } = {}) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new NotFoundError('Booking not found');
  if (String(booking.providerId) !== String(providerId)) {
    throw new ValidationError('You are not authorized for this booking');
  }
  if (booking.status !== 'completed') {
    throw new ValidationError('You can rate the customer once this booking is completed');
  }
  if (booking.customerRating?.stars) {
    throw new ValidationError('You have already rated this customer');
  }
  const starsNum = Number(stars);
  if (!Number.isFinite(starsNum) || starsNum < 1 || starsNum > 5) {
    throw new ValidationError('Rating must be between 1 and 5');
  }

  booking.customerRating = { stars: starsNum, comment: String(comment || '').trim().slice(0, 1000), ratedAt: new Date() };
  await booking.save();

  return stripProviderSensitiveFields(booking.toObject());
};
