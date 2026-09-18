import { ValidationError, NotFoundError } from '../../../core/auth/errors.js';
import { Booking } from '../models/booking.model.js';
import { ServiceProviderProfile } from '../models/serviceProviderProfile.model.js';
import { getOperationalSettings } from './operationalSettings.service.js';
import { buildCandidateList } from './dispatch.service.js';
import { refundWalletBalance } from '../../food/user/services/userWallet.service.js';
import { initiateRazorpayRefund } from '../../food/orders/helpers/razorpay.helper.js';
import { notifyProviderStatus, notifyCustomerStatus, notifyProviderNewRequest } from './notify.service.js';
import { stripProviderSensitiveFields } from '../utils/bookingSerializers.util.js';

const isDup = (error) => error?.code === 11000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const NON_CANCELLABLE_STATUSES = [
  'service_started', 'service_completed', 'customer_confirmed', 'completed', 'cancelled',
];

/** Free before a provider has even accepted, and free up until the configured
 *  free-cancel window before the scheduled start — mirrors Bike Rent's
 *  freeCancelBeforePickupMinutes rule exactly, applied to this module's own settings. */
const computeCancellationCharge = (booking, settings) => {
  if (booking.status === 'requested') return { charge: 0, free: true };

  const [h, m] = String(booking.startTime).split(':').map(Number);
  const startAt = new Date(`${booking.date}T00:00:00`);
  startAt.setHours(h, m, 0, 0);
  const freeCancelUntil = new Date(startAt.getTime() - settings.freeCancelBeforeMinutes * 60 * 1000);
  if (Date.now() < freeCancelUntil.getTime()) return { charge: 0, free: true };

  const base = Number(booking.totalAmount) || 0;
  const charge = settings.cancellationChargeType === 'fixed'
    ? Math.min(settings.cancellationChargeValue, base)
    : round2((base * settings.cancellationChargeValue) / 100);
  return { charge, free: false };
};

export const previewCustomerCancellation = async (customerId, bookingId) => {
  const booking = await Booking.findOne({ _id: bookingId, customerId }).lean();
  if (!booking) throw new NotFoundError('Booking not found');
  const settings = await getOperationalSettings();
  const { charge, free } = computeCancellationCharge(booking, settings);
  return { charge, free, totalAmount: booking.totalAmount };
};

export const cancelByCustomer = async (customerId, bookingId, reason = '') => {
  const booking = await Booking.findOne({ _id: bookingId, customerId });
  if (!booking) throw new NotFoundError('Booking not found');
  if (NON_CANCELLABLE_STATUSES.includes(booking.status)) {
    throw new ValidationError(`This booking is already ${booking.status.replace(/_/g, ' ')} and cannot be cancelled`);
  }

  const settings = await getOperationalSettings();
  const { charge } = computeCancellationCharge(booking, settings);
  const wasPaid = booking.payment?.status === 'paid';
  const refundAmount = wasPaid ? round2(booking.finalPayableAmount - charge) : 0;

  booking.status = 'cancelled';
  booking.slotClaimed = false;
  booking.dispatch.status = 'exhausted';
  booking.cancelledAt = new Date();
  booking.cancelledBy = 'customer';
  booking.cancelReason = String(reason || '').trim().slice(0, 300);
  booking.cancellationCharge = charge;
  await booking.save();

  if (wasPaid && refundAmount > 0) {
    const bid = String(booking._id);
    if (booking.payment.method === 'wallet') {
      await refundWalletBalance(customerId, refundAmount, `Booking ${bid} cancelled`, {
        orderId: bid, refundTransactionId: `sp_cancel_${bid}`, source: 'service_provider_cancel',
      }).catch((err) => console.error(`Wallet refund failed for cancelled booking ${bid}:`, err?.message || err));
    } else if (booking.payment.method === 'razorpay' && booking.payment.razorpayPaymentId) {
      await initiateRazorpayRefund(booking.payment.razorpayPaymentId, refundAmount)
        .catch((err) => console.error(`Razorpay refund failed for cancelled booking ${bid}:`, err?.message || err));
    }
  }

  notifyProviderStatus(booking.providerId, booking);
  return booking.toObject();
};

/** Reassigns an already-accepted booking to a fresh eligible candidate (excluding the
 *  cancelling provider), restarting dispatch on the SAME document — preserves the
 *  booking's identity/history for the customer instead of silently vanishing it. */
const tryReassign = async (booking, excludeProviderIds = []) => {
  const candidates = await buildCandidateList({
    serviceId: booking.serviceId, zoneId: booking.zoneId, date: booking.date, startTime: booking.startTime,
  });
  const excluded = new Set(excludeProviderIds.map(String));
  const filtered = candidates.filter((c) => !excluded.has(String(c._id)));
  if (!filtered.length) return null;

  const settings = await getOperationalSettings();
  const candidateIds = filtered.map((c) => c._id);

  for (let i = 0; i < filtered.length; i += 1) {
    const candidate = filtered[i];
    const now = new Date();
    booking.providerId = candidate._id;
    booking.providerName = candidate.ownerName;
    booking.providerPrice = candidate.providerPrice;
    booking.status = 'requested';
    booking.serviceOtp = '';
    booking.onTheWayAt = null;
    booking.arrivedAt = null;
    booking.dispatch = {
      mode: 'auto',
      status: 'pending',
      candidateProviderIds: candidateIds,
      candidateIndex: i,
      offeredAt: now,
      respondBy: new Date(now.getTime() + settings.requestTimeoutSeconds * 1000),
      history: [...booking.dispatch.history, { providerId: candidate._id, offeredAt: now, action: 'offered' }],
    };
    booking.reassignmentCount = (booking.reassignmentCount || 0) + 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      await booking.save();
      notifyProviderNewRequest(candidate._id, booking);
      return booking;
    } catch (error) {
      if (isDup(error)) continue; // eslint-disable-line no-continue
      throw error;
    }
  }
  return null;
};

/** Provider cancelling an already-accepted booking (before service starts) — applies
 *  the cancellation-count penalty and tries to reassign to another eligible provider
 *  in the same zone before giving up and cancelling outright. */
export const cancelByProvider = async (providerId, bookingId, reason = '') => {
  const booking = await Booking.findOne({ _id: bookingId, providerId });
  if (!booking) throw new NotFoundError('Booking not found');
  if (!['assigned', 'provider_on_the_way', 'provider_arrived'].includes(booking.status)) {
    throw new ValidationError('This booking can no longer be cancelled by the provider');
  }

  const settings = await getOperationalSettings();
  const provider = await ServiceProviderProfile.findById(providerId);
  if (provider) {
    provider.cancelledBookingsCount = (provider.cancelledBookingsCount || 0) + 1;
    if (provider.cancelledBookingsCount >= settings.maxProviderCancellations) {
      provider.isActive = false;
    }
    await provider.save();
  }

  const reassigned = await tryReassign(booking, [String(providerId)]);
  if (reassigned) return stripProviderSensitiveFields(reassigned.toObject());

  booking.status = 'cancelled';
  booking.slotClaimed = false;
  booking.dispatch.status = 'exhausted';
  booking.cancelledAt = new Date();
  booking.cancelledBy = 'provider';
  booking.cancelReason = String(reason || '').trim().slice(0, 300) || 'Cancelled by provider';
  await booking.save();
  notifyCustomerStatus(booking.customerId, booking);
  return stripProviderSensitiveFields(booking.toObject());
};
