import { ValidationError, NotFoundError } from '../../../core/auth/errors.js';
import { Booking } from '../models/booking.model.js';
import { deductWalletBalance, refundWalletBalance } from '../../food/user/services/userWallet.service.js';
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  getRazorpayKeyId,
  isRazorpayConfigured,
} from '../../food/orders/helpers/razorpay.helper.js';
import { notifyProviderStatus } from './notify.service.js';

const PAYMENT_METHODS = ['wallet', 'razorpay'];

/**
 * Payment happens once, near the end — only after the customer has confirmed the work
 * is actually done (booking.status === 'customer_confirmed'). This intentionally avoids
 * ever holding a customer's money against a request that might not get accepted, or a
 * job that might not get finished, and lets extraCharges accumulate into
 * finalPayableAmount before anything is actually charged.
 */
export const payForBooking = async (customerId, bookingId, paymentMethod) => {
  const booking = await Booking.findOne({ _id: bookingId, customerId });
  if (!booking) throw new NotFoundError('Booking not found');
  if (booking.status !== 'customer_confirmed') {
    if (booking.status === 'completed') {
      throw new ValidationError('This booking has already been paid');
    }
    throw new ValidationError('Payment is only available after you confirm the completed service');
  }
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    throw new ValidationError('Select a valid payment method');
  }
  if (paymentMethod === 'razorpay' && !isRazorpayConfigured()) {
    throw new ValidationError('Online payment is not available right now. Please pay with wallet.');
  }

  const amount = booking.finalPayableAmount;

  if (paymentMethod === 'wallet') {
    const bookingId2 = String(booking._id);
    try {
      await deductWalletBalance(customerId, amount, `Service booking ${bookingId2}`, {
        orderId: bookingId2, source: 'service_provider_payment',
      });
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(error?.message || 'Wallet payment failed');
    }

    booking.payment = { method: 'wallet', status: 'paid', razorpayOrderId: '', razorpayPaymentId: '', razorpaySignature: '' };
    booking.status = 'completed';
    booking.paymentCompletedAt = new Date();
    booking.completedAt = new Date();
    try {
      await booking.save();
    } catch (error) {
      await refundWalletBalance(customerId, amount, `Service booking ${bookingId2} rollback`, {
        orderId: bookingId2, refundTransactionId: `sp_payment_rollback_${bookingId2}`, source: 'service_provider_payment_rollback',
      }).catch(() => {});
      throw error;
    }
    notifyProviderStatus(booking.providerId, booking);
    return { booking: booking.toObject(), razorpay: null };
  }

  const receipt = `spp_${String(booking._id)}`.slice(0, 40);
  let rzOrder;
  try {
    rzOrder = await createRazorpayOrder(Math.round(amount * 100), 'INR', receipt, {
      bookingId: String(booking._id), type: 'service_provider_payment',
    });
  } catch (error) {
    throw new ValidationError(error?.message || 'Could not start payment. Please try again.');
  }

  booking.payment = { method: 'razorpay', status: 'awaiting_payment', razorpayOrderId: rzOrder.id, razorpayPaymentId: '', razorpaySignature: '' };
  await booking.save();
  return {
    booking: booking.toObject(),
    razorpay: { orderId: rzOrder.id, amount: rzOrder.amount, currency: rzOrder.currency || 'INR', key: getRazorpayKeyId() },
  };
};

export const verifyBookingPayment = async (customerId, bookingId, { razorpayOrderId, razorpayPaymentId, razorpaySignature } = {}) => {
  const booking = await Booking.findOne({ _id: bookingId, customerId });
  if (!booking) throw new NotFoundError('Booking not found');
  if (booking.payment?.method !== 'razorpay') {
    throw new ValidationError('This booking does not use online payment');
  }
  if (booking.payment.status === 'paid') {
    return booking.toObject(); // idempotent — already verified
  }
  if (booking.payment.status !== 'awaiting_payment') {
    throw new ValidationError('This booking is not awaiting payment');
  }
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new ValidationError('Payment details are incomplete');
  }
  if (String(booking.payment.razorpayOrderId) !== String(razorpayOrderId)) {
    throw new ValidationError('Payment order mismatch');
  }
  if (!verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    throw new ValidationError('Payment verification failed');
  }

  booking.payment.status = 'paid';
  booking.payment.razorpayPaymentId = razorpayPaymentId;
  booking.payment.razorpaySignature = razorpaySignature;
  booking.status = 'completed';
  booking.paymentCompletedAt = new Date();
  booking.completedAt = new Date();
  await booking.save();
  notifyProviderStatus(booking.providerId, booking);
  return booking.toObject();
};

/** Called when the customer's Razorpay checkout fails or is dismissed — booking simply
 *  stays at 'customer_confirmed' so they can retry with either payment method. */
export const markBookingPaymentFailed = async (customerId, bookingId) => {
  const booking = await Booking.findOne({ _id: bookingId, customerId });
  if (!booking) throw new NotFoundError('Booking not found');
  if (booking.payment?.method !== 'razorpay' || booking.payment.status !== 'awaiting_payment') {
    return booking.toObject();
  }
  booking.payment.status = 'failed';
  await booking.save();
  return booking.toObject();
};
