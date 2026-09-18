import { getIO, rooms } from '../../../config/socket.js';

/**
 * Best-effort real-time push, mirroring Taxi/Porter's rooms.delivery(...)/rooms.user(...)
 * emit pattern (see rideDispatch.service.js) — reuses the SAME Socket.IO server/room
 * infrastructure (config/socket.js), just a new `provider` room family for
 * ServiceProviderProfile actors (see socket.js's roomNames).
 *
 * Deliberately swallows every failure: the database write that triggered a notification
 * has already committed by the time these are called (always invoked AFTER a successful
 * save), so a missing/dropped socket connection must never affect booking correctness —
 * the client-side poll (already in place on both IncomingRequests.jsx and
 * RequestStatus.jsx) is the source-of-truth fallback if the push never arrives.
 */
const safeEmit = (room, event, payload) => {
  try {
    const io = getIO();
    if (!io) return;
    io.to(room).emit(event, payload);
  } catch {
    // real-time delivery is never allowed to affect booking correctness
  }
};

const summarize = (booking) => ({
  bookingId: String(booking._id),
  status: booking.status,
  serviceName: booking.serviceName,
  categoryName: booking.categoryName,
  date: booking.date,
  startTime: booking.startTime,
  endTime: booking.endTime,
  providerName: booking.providerName,
  customerName: booking.customerName,
  finalPayableAmount: booking.finalPayableAmount,
});

/** New request offered to a candidate provider — the "ring" event, paired with a
 *  dedicated sound-trigger event (same split Food's order-dispatch service uses). */
export const notifyProviderNewRequest = (providerId, booking) => {
  const payload = {
    ...summarize(booking),
    providerPrice: booking.providerPrice,
    serviceLocation: booking.serviceLocation,
    mode: booking.dispatch?.mode,
    // Lets the client mirror the server's own offer-timeout locally, so a ringing
    // popup never outlives what the backend will already have moved past.
    respondBy: booking.dispatch?.respondBy,
  };
  safeEmit(rooms.provider(providerId), 'new_service_booking_available', payload);
  safeEmit(rooms.provider(providerId), 'play_notification_sound', { bookingId: String(booking._id) });
};

export const notifyCustomerStatus = (customerId, booking) => {
  safeEmit(rooms.user(customerId), 'booking_status_update', summarize(booking));
};

export const notifyProviderStatus = (providerId, booking) => {
  safeEmit(rooms.provider(providerId), 'booking_status_update', summarize(booking));
};
