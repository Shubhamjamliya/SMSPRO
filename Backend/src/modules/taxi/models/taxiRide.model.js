import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const placeSchema = new mongoose.Schema(
    {
        address: { type: String, default: '', trim: true },
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        placeId: { type: String, default: '', trim: true },
    },
    { _id: false },
);

const fareSchema = new mongoose.Schema(
    {
        base: { type: Number, default: 0, min: 0 },
        distance: { type: Number, default: 0, min: 0 },
        time: { type: Number, default: 0, min: 0 },
        waiting: { type: Number, default: 0, min: 0 },
        platformFee: { type: Number, default: 0, min: 0 },
        surgeMultiplier: { type: Number, default: 1, min: 0 },
        /** Flat ₹ time-slot surge locked at quote/book */
        timeSlotSurge: { type: Number, default: 0, min: 0 },
        surgeSlotId: { type: String, default: null, trim: true },
        surgeSlotName: { type: String, default: null, trim: true },
        /** Admin commission % of (total − platformFee), locked at quote/book */
        adminCommissionPercent: { type: Number, default: 0, min: 0, max: 100 },
        adminCommissionAmount: { type: Number, default: 0, min: 0 },
        driverShare: { type: Number, default: 0, min: 0 },
        subtotal: { type: Number, default: 0, min: 0 },
        total: { type: Number, default: 0, min: 0 },
        /** Pre-coupon fare total (locked at book) */
        originalTotal: { type: Number, default: 0, min: 0 },
        discount: { type: Number, default: 0, min: 0 },
        currency: { type: String, default: 'INR', trim: true },
        slab: {
            fromKm: { type: Number, default: null },
            toKm: { type: Number, default: null },
        },
    },
    { _id: false },
);

const couponSnapshotSchema = new mongoose.Schema(
    {
        couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiCoupon', default: null },
        code: { type: String, default: '', trim: true, uppercase: true },
        name: { type: String, default: '', trim: true },
        discountType: { type: String, enum: ['percentage', 'flat'], default: 'percentage' },
        discountValue: { type: Number, default: 0, min: 0 },
        discountAmount: { type: Number, default: 0, min: 0 },
        waivePlatformFee: { type: Boolean, default: false },
    },
    { _id: false },
);

const fareBreakdownSchema = new mongoose.Schema(
    {
        base: { type: Number, default: 0 },
        distance: { type: Number, default: 0 },
        time: { type: Number, default: 0 },
        waiting: { type: Number, default: 0 },
        platformFee: { type: Number, default: 0 },
        surgeMultiplier: { type: Number, default: 1 },
        timeSlotSurge: { type: Number, default: 0 },
        surgeSlotId: { type: String, default: null },
        surgeSlotName: { type: String, default: null },
        adminCommissionPercent: { type: Number, default: 0 },
        adminCommissionAmount: { type: Number, default: 0 },
        driverShare: { type: Number, default: 0 },
        subtotal: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        originalTotal: { type: Number, default: 0 },
        discount: { type: Number, default: 0 },
        couponCode: { type: String, default: null },
        couponName: { type: String, default: null },
        currency: { type: String, default: 'INR' },
        distanceKm: { type: Number, default: 0 },
        durationMin: { type: Number, default: 0 },
        waitingMin: { type: Number, default: 0 },
        freeWaitMinutes: { type: Number, default: 0 },
        billableWaitMin: { type: Number, default: 0 },
        perMinWaitRate: { type: Number, default: 0 },
        slabFromKm: { type: Number, default: null },
        slabToKm: { type: Number, default: null },
    },
    { _id: false },
);

const paymentSchema = new mongoose.Schema(
    {
        method: {
            type: String,
            enum: ['cash', 'wallet', 'razorpay', 'razorpay_qr', 'upi', 'card'],
            default: 'cash',
            trim: true,
        },
        status: {
            type: String,
            enum: ['pending', 'pending_qr', 'paid', 'failed', 'refunded'],
            default: 'pending',
        },
        paymentId: { type: String, default: null },
        razorpayOrderId: { type: String, default: null },
        razorpayPaymentId: { type: String, default: null },
        paymentLinkId: { type: String, default: null },
        shortUrl: { type: String, default: null },
        qr: {
            paymentLinkId: { type: String, default: null },
            shortUrl: { type: String, default: null },
            status: { type: String, default: null },
            amountPaise: { type: Number, default: null },
            createdAt: { type: Date, default: null },
        },
        paidAt: { type: Date, default: null },
        collectedBy: { type: String, default: null, trim: true },
    },
    { _id: false },
);

const offerEntrySchema = new mongoose.Schema(
    {
        partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
        at: { type: Date, default: Date.now },
        action: { type: String, default: 'offered', trim: true },
    },
    { _id: false },
);

export const TAXI_RIDE_STATUSES = [
    'requested',
    'searching',
    'assigned',
    'arriving',
    'arrived',
    'in_progress',
    'awaiting_payment',
    'completed',
    'cancelled_by_rider',
    'cancelled_by_driver',
    'cancelled_by_system',
    'no_show',
];

const taxiRideSchema = new mongoose.Schema(
    {
        rideNumber: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            required: true,
            index: true,
        },
        vehicleTypeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TaxiVehicleType',
            required: true,
            index: true,
        },
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TaxiZone',
            default: null,
            index: true,
        },
        pickup: { type: placeSchema, required: true },
        drop: { type: placeSchema, required: true },
        distanceKm: { type: Number, default: 0, min: 0 },
        durationMin: { type: Number, default: 0, min: 0 },
        waitingMin: { type: Number, default: 0, min: 0 },
        fare: { type: fareSchema, default: () => ({}) },
        fareBreakdown: { type: fareBreakdownSchema, default: null },
        fareEstimateTotal: { type: Number, default: 0, min: 0 },
        coupon: { type: couponSnapshotSchema, default: null },
        payment: { type: paymentSchema, default: () => ({}) },
        status: {
            type: String,
            enum: TAXI_RIDE_STATUSES,
            default: 'requested',
            index: true,
        },
        dispatch: {
            status: {
                type: String,
                enum: ['unassigned', 'assigned', 'accepted', 'cancelled'],
                default: 'unassigned',
            },
            deliveryPartnerId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Driver',
                default: null,
            },
            offeredTo: { type: [offerEntrySchema], default: [] },
            assignedAt: { type: Date, default: null },
            acceptedAt: { type: Date, default: null },
            currentAttempt: { type: Number, default: 0 },
            lastAttemptAt: { type: Date, default: null },
        },
        rideOtp: { type: String, default: null },
        assignedAt: { type: Date, default: null },
        arrivedAt: { type: Date, default: null },
        startedAt: { type: Date, default: null },
        reachedDropAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        cancelledAt: { type: Date, default: null },
        cancelReason: { type: String, default: '', trim: true },
        earningsCreditedAt: { type: Date, default: null },
        driverRating: { type: Number, default: null, min: 1, max: 5 },
        userRating: { type: Number, default: null, min: 1, max: 5 },
        lastDriverLocation: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
            at: { type: Date, default: null },
        },
        module: {
            type: String,
            default: 'taxi',
            index: true,
        },
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: actionPerformerSchema, default: null },
        createdBy: { type: actionPerformerSchema, default: null },
        updatedBy: { type: actionPerformerSchema, default: null },
    },
    {
        collection: 'taxi_rides',
        timestamps: true,
    },
);

taxiRideSchema.index({ status: 1, createdAt: -1 });
taxiRideSchema.index({ userId: 1, status: 1, createdAt: -1 });
taxiRideSchema.index({ userId: 1, 'coupon.code': 1, status: 1 });
taxiRideSchema.index({ 'dispatch.deliveryPartnerId': 1, status: 1 });
taxiRideSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });
taxiRideSchema.index({ 'payment.razorpayOrderId': 1 });
taxiRideSchema.index({ 'payment.paymentLinkId': 1 });
taxiRideSchema.index(
    { rideNumber: 1 },
    { unique: true, partialFilterExpression: { isDeleted: false } },
);

export const TaxiRide = mongoose.models.TaxiRide
    || mongoose.model('TaxiRide', taxiRideSchema, 'taxi_rides');
