import { ValidationError, NotFoundError } from '../../../core/auth/errors.js';
import { Booking } from '../models/booking.model.js';
import { sweepStalledRequests } from './dispatch.service.js';
import { stripProviderSensitiveFields } from '../utils/bookingSerializers.util.js';

export const listMyBookings = async (customerId) => {
  await sweepStalledRequests({ customerId });
  return Booking.find({ customerId }).sort({ createdAt: -1 }).lean();
};

export const listProviderBookings = async (providerId) => {
  await sweepStalledRequests({ providerId });
  const bookings = await Booking.find({ providerId }).sort({ createdAt: -1 }).lean();
  return bookings.map(stripProviderSensitiveFields);
};

export const getBookingDetail = async (requester, bookingId) => {
  const booking = await Booking.findById(bookingId).lean();
  if (!booking) throw new NotFoundError('Booking not found');

  const isOwnerCustomer = requester.role === 'USER' && String(booking.customerId) === String(requester.userId);
  const isOwnerProvider = requester.role === 'SERVICE_PROVIDER' && String(booking.providerId) === String(requester.userId);
  const isStaff = requester.role === 'ADMIN' || requester.role === 'EMPLOYEE';
  if (!isOwnerCustomer && !isOwnerProvider && !isStaff) {
    throw new ValidationError('You are not authorized to view this booking');
  }
  if (isOwnerProvider || isStaff) {
    stripProviderSensitiveFields(booking);
  }
  return booking;
};
