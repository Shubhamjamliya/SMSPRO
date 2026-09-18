import mongoose from 'mongoose';

/**
 * Full request → execution → completion lifecycle. A booking starts as a dispatch
 * REQUEST (no provider has committed yet) and only becomes a real appointment once a
 * provider ACCEPTS. Payment happens once, near the end (after the customer confirms the
 * work is done), matching the "pay after service" model this flow is designed around —
 * not at request time, since a request might never be accepted by anyone.
 */
const BOOKING_STATUSES = [
  'requested', // dispatch in progress — currently offered to dispatch.candidateProviderIds[candidateIndex]
  'assigned', // a provider accepted; this is now a real scheduled appointment
  'provider_on_the_way',
  'provider_arrived',
  'service_started', // OTP-gated
  'service_completed', // provider marked done + uploaded after photos
  'customer_confirmed', // customer confirmed the completed work
  'completed', // terminal success state — payment happens as part of this transition, no separate intermediate status
  'cancelled', // terminal failure/cancel state (see cancelledBy for who/why, including 'system' for no-provider-available)
];

const CANCELLED_BY = ['customer', 'provider', 'admin', 'system', null];

const PAYMENT_METHODS = ['wallet', 'razorpay'];
// not_due: nothing to pay yet (before customer_confirmed). paid/failed are terminal for a
// given attempt; a failed razorpay attempt can be retried, moving back to awaiting_payment.
const PAYMENT_STATUSES = ['not_due', 'awaiting_payment', 'paid', 'failed'];

const DISPATCH_MODES = ['specific', 'auto'];
// 'advancing' is a short-lived transient lock: whichever of {explicit reject, timeout
// sweep, a racing duplicate call} wins the atomic claim to move past the current offer
// holds this state exclusively while it works out the next candidate (or exhausts).
const DISPATCH_STATUSES = ['pending', 'advancing', 'accepted', 'exhausted'];
const EXTRA_CHARGE_STATUSES = ['pending', 'approved', 'rejected'];

const paymentSchema = new mongoose.Schema(
  {
    method: { type: String, enum: [...PAYMENT_METHODS, ''], default: '' },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'not_due' },
    razorpayOrderId: { type: String, default: '' },
    razorpayPaymentId: { type: String, default: '' },
    razorpaySignature: { type: String, default: '' },
  },
  { _id: false },
);

/** Append-only log of every provider a request was offered to, and how they responded. */
const dispatchOfferSchema = new mongoose.Schema(
  {
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceProviderProfile', required: true },
    offeredAt: { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null },
    action: {
      type: String,
      enum: ['offered', 'accepted', 'rejected', 'timed_out', 'conflict'],
      default: 'offered',
    },
  },
  { _id: false },
);

/**
 * Sequential dispatch state. candidateProviderIds is the pre-sorted eligibility list
 * computed once at request time (single provider for 'specific' mode, ranked list for
 * 'auto'). candidateIndex points at whoever currently holds the offer — advancing it is
 * what "try the next provider" means. dispatch.status flips to 'accepted' the moment
 * someone accepts (booking.providerId is then locked) or 'exhausted' once every
 * candidate has rejected/timed out/conflicted.
 */
const dispatchSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: DISPATCH_MODES, required: true },
    status: { type: String, enum: DISPATCH_STATUSES, default: 'pending' },
    candidateProviderIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ServiceProviderProfile' }],
      default: [],
    },
    candidateIndex: { type: Number, default: 0 },
    offeredAt: { type: Date, default: null },
    respondBy: { type: Date, default: null },
    history: { type: [dispatchOfferSchema], default: [] },
  },
  { _id: false },
);

/** Provider-initiated, customer-approved additional work found on site (e.g. extra parts). */
const extraChargeSchema = new mongoose.Schema(
  {
    description: { type: String, trim: true, required: true, maxlength: 300 },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: EXTRA_CHARGE_STATUSES, default: 'pending' },
    requestedAt: { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: false },
);

const mediaItemSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: '' },
  },
  { _id: false },
);

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const ratingSchema = new mongoose.Schema(
  {
    stars: { type: Number, min: 1, max: 5, default: null },
    comment: { type: String, trim: true, default: '', maxlength: 1000 },
    ratedAt: { type: Date, default: null },
  },
  { _id: false },
);

/**
 * One customer service request/appointment, start to finish. Service name/prices/
 * zone/location are snapshotted at request time — a later admin price edit or provider
 * profile change must never retroactively alter a historical booking.
 *
 * Double-booking protection: `slotClaimed` is true for every status except 'cancelled'
 * (see ACTIVE_BOOKING_STATUSES) and is enforced by the partial unique index below on
 * (providerId, date, startTime). Because `providerId` here means "whoever currently
 * holds the claim" (the offered/accepted candidate — updated in place as dispatch
 * advances), MongoDB re-validates the constraint on every such update, which is exactly
 * what makes "try the next candidate" and "two requests independently landing on the
 * same candidate for the same slot" both safe without a multi-document transaction.
 */
const bookingSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceProviderProfile',
      required: true,
      index: true,
    },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true, index: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCategory', default: null },
    zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceZone', required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', required: true, index: true },

    /** Where the work happens — resolved server-side into zoneId, never trusted from the client. */
    serviceLocation: { type: locationSchema, required: true },

    // Snapshots — never re-read from the live Service/ServiceProviderProfile/fee
    // settings after creation.
    serviceName: { type: String, required: true, trim: true },
    categoryName: { type: String, trim: true, default: '' },
    providerName: { type: String, trim: true, default: '' },
    durationMinutes: { type: Number, required: true, min: 1 },
    adminPrice: { type: Number, required: true, min: 0 },
    providerPrice: { type: Number, required: true, min: 0 },
    platformFee: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    /** totalAmount + sum(approved extraCharges) — the real amount collected at payment time. */
    finalPayableAmount: { type: Number, required: true, min: 0 },
    extraCharges: { type: [extraChargeSchema], default: [] },

    customerName: { type: String, trim: true, default: '' },
    customerPhone: { type: String, trim: true, default: '' },
    payment: { type: paymentSchema, default: () => ({}) },

    /** 'YYYY-MM-DD' in the app's configured timezone (IST). */
    date: { type: String, required: true, index: true },
    startTime: { type: String, required: true }, // 'HH:mm'
    endTime: { type: String, required: true },

    status: { type: String, enum: BOOKING_STATUSES, default: 'requested', index: true },
    /** See class doc — kept false only once status is 'cancelled'. */
    slotClaimed: { type: Boolean, default: true },
    dispatch: { type: dispatchSchema, required: true },

    /** Generated when a provider accepts; shown to the customer, entered by the
     *  provider to gate service_started. */
    serviceOtp: { type: String, default: '' },

    onTheWayAt: { type: Date, default: null },
    arrivedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    serviceCompletedAt: { type: Date, default: null },
    customerConfirmedAt: { type: Date, default: null },
    paymentCompletedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    beforePhotos: { type: [mediaItemSchema], default: [] },
    afterPhotos: { type: [mediaItemSchema], default: [] },
    completionNotes: { type: String, trim: true, default: '', maxlength: 1000 },

    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: String, enum: CANCELLED_BY, default: null },
    cancelReason: { type: String, trim: true, default: '', maxlength: 300 },
    cancellationCharge: { type: Number, default: 0, min: 0 },

    /** Provider cancelling an accepted booking is reassigned automatically where
     *  possible — this counts how many times THIS booking has been reassigned, purely
     *  for support/audit visibility (not a hard cap). */
    reassignmentCount: { type: Number, default: 0 },

    /** Customer's rating of the provider. */
    rating: { type: ratingSchema, default: () => ({}) },
    /** Provider's rating of the customer — same shape, opposite direction. */
    customerRating: { type: ratingSchema, default: () => ({}) },
  },
  {
    collection: 'service_provider_bookings',
    timestamps: true,
  },
);

// The atomic double-booking guard: at most one *claimed* booking may occupy a given
// (provider, date, startTime) slot. A plain boolean keeps the partial filter to a
// simple equality check (the only expression class partialFilterExpression reliably
// supports across MongoDB versions — $in/$ne are not guaranteed there).
bookingSchema.index(
  { providerId: 1, date: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { slotClaimed: true } },
);
bookingSchema.index({ providerId: 1, date: 1, status: 1 });
bookingSchema.index({ customerId: 1, status: 1, createdAt: -1 });
// Sweep query: "requested bookings whose current offer has gone stale."
bookingSchema.index({ status: 1, 'dispatch.respondBy': 1 });

export const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema, 'service_provider_bookings');
export {
  BOOKING_STATUSES,
  CANCELLED_BY,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  DISPATCH_MODES,
  DISPATCH_STATUSES,
  EXTRA_CHARGE_STATUSES,
};

/** Statuses where the booking still occupies its (providerId, date, startTime) slot. */
export const ACTIVE_BOOKING_STATUSES = BOOKING_STATUSES.filter((s) => s !== 'cancelled');
