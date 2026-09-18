import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

export const BIKE_BOOKING_STATUSES = [
    'requested',
    'pending_approval',
    'payment_pending',
    'reserved',
    'pickup_completed',
    'rental_started',
    'active',
    'return_requested',
    'inspection',
    'completed',
    'refund_processing',
    'deposit_refunded',
    'cancelled',
    'rejected',
    'expired',
    'no_show',
];

const moneySnapshotSchema = new mongoose.Schema(
    {
        currency: { type: String, default: 'INR' },
        rentalFee: { type: Number, default: 0, min: 0 },
        /** Platform's own service/convenience fee — separate from vendor commission (see commissionAmount below). */
        platformFee: { type: Number, default: 0, min: 0 },
        platformFeePayer: { type: String, enum: ['customer', 'vendor', ''], default: '' },
        taxAmount: { type: Number, default: 0, min: 0 },
        gstRate: { type: Number, default: 0, min: 0, max: 100 },
        discountAmount: { type: Number, default: 0, min: 0 },
        lateFee: { type: Number, default: 0, min: 0 },
        damageFee: { type: Number, default: 0, min: 0 },
        extensionFee: { type: Number, default: 0, min: 0 },
        cancelFee: { type: Number, default: 0, min: 0 },
        securityDeposit: { type: Number, default: 0, min: 0 },
        depositHeld: { type: Number, default: 0, min: 0 },
        depositCaptured: { type: Number, default: 0, min: 0 },
        depositRefunded: { type: Number, default: 0, min: 0 },
        totalPayable: { type: Number, default: 0, min: 0 },
        totalPaid: { type: Number, default: 0, min: 0 },
        /** Snapshotted at booking creation so later commission-rate edits don't retroactively change past bookings */
        commissionRate: { type: Number, default: 0, min: 0, max: 100 },
        commissionAmount: { type: Number, default: 0, min: 0 },
        /** Amount credited to the vendor's wallet on completion (totalPaid - commissionAmount); 0 for admin-owned bookings */
        vendorEarning: { type: Number, default: 0, min: 0 },
        /** Discount cost absorbed by the vendor when a vendor-authored coupon was used on this booking */
        couponCostBorneByVendor: { type: Number, default: 0, min: 0 },
    },
    { _id: false },
);

const bikeBookingSchema = new mongoose.Schema(
    {
        bookingNumber: {
            type: String,
            required: true,
            trim: true,
            unique: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        bikeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeUnit',
            required: true,
            index: true,
        },
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeRentZone',
            required: true,
            index: true,
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeCategory',
            default: null,
        },
        status: {
            type: String,
            enum: BIKE_BOOKING_STATUSES,
            default: 'requested',
            index: true,
        },
        startAt: { type: Date, required: true },
        endAt: { type: Date, required: true },
        actualStartAt: { type: Date, default: null },
        actualEndAt: { type: Date, default: null },
        pickupCode: { type: String, default: '', trim: true },
        pickupCompletedAt: { type: Date, default: null },
        returnRequestedAt: { type: Date, default: null },
        inspectionNotes: { type: String, default: '', trim: true },
        cancellationReason: { type: String, default: '', trim: true },
        cancelledAt: { type: Date, default: null },
        /** Who cancelled: admin | user | system */
        cancelledBy: {
            type: String,
            enum: ['admin', 'user', 'system', ''],
            default: '',
            trim: true,
        },
        cancellation: {
            freeCancelUntil: { type: Date, default: null },
            withinFreeWindow: { type: Boolean, default: false },
            cancellationChargeType: {
                type: String,
                enum: ['percent', 'fixed', ''],
                default: '',
            },
            cancellationCharge: { type: Number, default: 0, min: 0 },
            rentalRefund: { type: Number, default: 0, min: 0 },
            securityDepositRefund: { type: Number, default: 0, min: 0 },
            walletCreditAmount: { type: Number, default: 0, min: 0 },
            finalRefundAmount: { type: Number, default: 0, min: 0 },
            calculatedAt: { type: Date, default: null },
        },
        noShow: {
            policyEnabled: { type: Boolean, default: true },
            graceMinutes: { type: Number, default: 0, min: 0 },
            graceEndsAt: { type: Date, default: null },
            refundRule: {
                type: String,
                enum: ['full', 'partial', 'none', ''],
                default: '',
            },
            refundMode: {
                type: String,
                enum: ['percent', 'fixed', ''],
                default: '',
            },
            penaltyAmount: { type: Number, default: 0, min: 0 },
            deductionAmount: { type: Number, default: 0, min: 0 },
            depositAmount: { type: Number, default: 0, min: 0 },
            depositRefund: { type: Number, default: 0, min: 0 },
            depositCaptured: { type: Number, default: 0, min: 0 },
            walletCreditAmount: { type: Number, default: 0, min: 0 },
            walletReference: { type: String, default: '', trim: true },
            processedAt: { type: Date, default: null },
            refundProcessed: { type: Boolean, default: false },
            /** Admin/vendor manually restored a no-show booking back to awaiting-pickup. */
            overridden: { type: Boolean, default: false },
            overriddenAt: { type: Date, default: null },
            overriddenBy: { type: actionPerformerSchema, default: null },
            overrideReason: { type: String, default: '', trim: true },
        },
        /** Post-return security deposit refund schedule / result */
        depositRefund: {
            status: {
                type: String,
                enum: ['not_applicable', 'processing', 'completed', 'failed', ''],
                default: '',
            },
            amount: { type: Number, default: 0, min: 0 },
            scheduledAt: { type: Date, default: null },
            eligibleAt: { type: Date, default: null },
            processedAt: { type: Date, default: null },
            walletReference: { type: String, default: '', trim: true },
            releasedBy: { type: actionPerformerSchema, default: null },
            note: { type: String, default: '', trim: true },
        },
        rejectionReason: { type: String, default: '', trim: true },
        rejectedAt: { type: Date, default: null },
        approvedAt: { type: Date, default: null },
        expiresAt: { type: Date, default: null, index: true },
        couponCode: { type: String, default: '', trim: true },
        /** Applied Bike Rental coupon snapshot (module-scoped) */
        couponApplied: {
            couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'BikeCoupon', default: null },
            couponCode: { type: String, default: '', trim: true, uppercase: true },
            name: { type: String, default: '', trim: true },
            discountType: {
                type: String,
                enum: ['percentage', 'fixed', ''],
                default: '',
            },
            discountValue: { type: Number, default: 0, min: 0 },
            applicableOn: {
                type: String,
                enum: ['rental', 'deposit', 'both', ''],
                default: '',
            },
            discountAmount: { type: Number, default: 0, min: 0 },
            rentalDiscount: { type: Number, default: 0, min: 0 },
            depositDiscount: { type: Number, default: 0, min: 0 },
            finalRentalAmount: { type: Number, default: 0, min: 0 },
            finalDepositAmount: { type: Number, default: 0, min: 0 },
            consumed: { type: Boolean, default: false },
            consumedAt: { type: Date, default: null },
            releasedAt: { type: Date, default: null },
            /** Set when the coupon was authored by a vendor (not the platform) — used to bill the discount to that vendor's wallet. */
            ownerType: { type: String, enum: ['admin', 'vendor', ''], default: '' },
            vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'BikeVendor', default: null },
        },
        /** Reporting / analytics fields */
        bookingSource: {
            type: String,
            enum: ['app', 'web', 'admin', 'api', 'unknown'],
            default: 'app',
            index: true,
        },
        rentalDurationHours: { type: Number, default: 0, min: 0 },
        reportSnapshot: {
            type: {
                revenue: { type: Number, default: 0 },
                rentalFee: { type: Number, default: 0 },
                taxAmount: { type: Number, default: 0 },
                securityDeposit: { type: Number, default: 0 },
                depositHeld: { type: Number, default: 0 },
                depositCaptured: { type: Number, default: 0 },
                depositRefunded: { type: Number, default: 0 },
                lateFee: { type: Number, default: 0 },
                damageFee: { type: Number, default: 0 },
                cancelFee: { type: Number, default: 0 },
                extensionFee: { type: Number, default: 0 },
                rentalDurationHours: { type: Number, default: 0 },
                zoneId: { type: mongoose.Schema.Types.ObjectId, default: null },
                bikeId: { type: mongoose.Schema.Types.ObjectId, default: null },
                userId: { type: mongoose.Schema.Types.ObjectId, default: null },
                bookingSource: { type: String, default: 'app' },
                settledAt: { type: Date, default: null },
            },
            default: () => ({}),
        },
        money: { type: moneySnapshotSchema, default: () => ({}) },
        /**
         * Security deposit payment tracking (online vs pay-at-pickup).
         * Amount also mirrored on money.securityDeposit for pricing/refunds.
         */
        securityDepositPayment: {
            depositAmount: { type: Number, default: 0, min: 0 },
            depositStatus: {
                type: String,
                enum: [
                    'not_required',
                    'pending_online',
                    'pending_collection',
                    'paid',
                    'refunded',
                ],
                default: 'not_required',
                index: true,
            },
            depositPaymentMethod: {
                type: String,
                enum: ['', 'online', 'pay_at_pickup', 'razorpay', 'wallet', 'cash', 'upi', 'cod'],
                default: '',
            },
            transactionId: { type: String, default: '', trim: true },
            paidAt: { type: Date, default: null },
            collectedBy: { type: actionPerformerSchema, default: null },
            history: {
                type: [{
                    status: { type: String, default: '' },
                    method: { type: String, default: '' },
                    transactionId: { type: String, default: '' },
                    note: { type: String, default: '' },
                    at: { type: Date, default: Date.now },
                    performedBy: { type: actionPerformerSchema, default: null },
                }],
                default: [],
            },
            /** Snapshot amounts after late/damage settlement */
            originalAmount: { type: Number, default: 0, min: 0 },
            deductedAmount: { type: Number, default: 0, min: 0 },
            refundableAmount: { type: Number, default: 0, min: 0 },
        },
        lateReturn: {
            isLate: { type: Boolean, default: false },
            scheduledReturnAt: { type: Date, default: null },
            actualReturnAt: { type: Date, default: null },
            lateDurationMs: { type: Number, default: 0, min: 0 },
            lateDurationLabel: { type: String, default: '' },
            graceMinutesApplied: { type: Number, default: 0, min: 0 },
            billableDurationMs: { type: Number, default: 0, min: 0 },
            billableDurationLabel: { type: String, default: '' },
            extraHours: { type: Number, default: 0, min: 0 },
            chargePerHour: { type: Number, default: 0, min: 0 },
            chargeAmount: { type: Number, default: 0, min: 0 },
            damageFee: { type: Number, default: 0, min: 0 },
            totalCharges: { type: Number, default: 0, min: 0 },
            deductedFromDeposit: { type: Number, default: 0, min: 0 },
            remainingAmount: { type: Number, default: 0, min: 0 },
            refundableAmount: { type: Number, default: 0, min: 0 },
            paymentStatus: {
                type: String,
                enum: ['not_applicable', 'settled', 'pending', 'paid', 'waived'],
                default: 'not_applicable',
            },
            remainingPaidAt: { type: Date, default: null },
            remainingPaymentMethod: { type: String, default: '', trim: true },
            remainingTransactionId: { type: String, default: '', trim: true },
            calculatedAt: { type: Date, default: null },
            billingHistory: {
                type: [{
                    at: { type: Date, default: Date.now },
                    note: { type: String, default: '' },
                    totalLateCharge: { type: Number, default: 0 },
                    damageFee: { type: Number, default: 0 },
                    depositDeduction: { type: Number, default: 0 },
                    remainingPayable: { type: Number, default: 0 },
                    refundableAmount: { type: Number, default: 0 },
                    performedBy: { type: actionPerformerSchema, default: null },
                }],
                default: [],
            },
        },
        payment: {
            gateway: { type: String, default: '', trim: true },
            // Indexes declared once below via schema.index (sparse) — do not set index:true here
            orderId: { type: String, default: '', trim: true },
            paymentId: { type: String, default: '', trim: true },
            method: {
                type: String,
                enum: ['', 'razorpay', 'wallet'],
                default: '',
            },
            signature: { type: String, default: '', trim: true },
            amountPaise: { type: Number, default: 0, min: 0 },
            paidAt: { type: Date, default: null },
            failedAt: { type: Date, default: null },
            failureReason: { type: String, default: '', trim: true },
            verified: { type: Boolean, default: false },
        },
        paymentAttempts: {
            type: [{
                method: { type: String, default: '' },
                orderId: { type: String, default: '' },
                paymentId: { type: String, default: '' },
                status: { type: String, default: '' },
                at: { type: Date, default: Date.now },
                note: { type: String, default: '' },
            }],
            default: [],
        },
        extensionHistory: {
            type: [{
                previousEndAt: { type: Date },
                newEndAt: { type: Date },
                fee: { type: Number, default: 0 },
                paymentId: { type: String, default: '' },
                at: { type: Date, default: Date.now },
            }],
            default: [],
        },
        /** Extension request awaiting admin resolution when it conflicts with another booking. */
        pendingExtension: {
            requestedEndAt: { type: Date, default: null },
            feeEstimate: { type: Number, default: 0, min: 0 },
            status: {
                type: String,
                enum: ['none', 'requested', 'approved', 'rejected'],
                default: 'none',
            },
            conflictBookingId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'BikeBooking',
                default: null,
            },
            reason: { type: String, default: '', trim: true },
            requestedAt: { type: Date, default: null },
            resolvedAt: { type: Date, default: null },
            resolvedBy: { type: mongoose.Schema.Types.Mixed, default: null },
        },
        /** Audit trail of admin bike swaps for this booking. */
        reassignmentHistory: {
            type: [{
                fromBikeId: { type: mongoose.Schema.Types.ObjectId, ref: 'BikeUnit', default: null },
                toBikeId: { type: mongoose.Schema.Types.ObjectId, ref: 'BikeUnit', default: null },
                reason: { type: String, default: '', trim: true },
                at: { type: Date, default: Date.now },
                by: { type: actionPerformerSchema, default: null },
            }],
            default: [],
        },
        // Vendor-ready without multi-vendor in v1
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            index: true,
        },
        ownerType: {
            type: String,
            enum: ['admin', 'vendor'],
            default: 'admin',
        },
        bikeSnapshot: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        zoneSnapshot: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        quoteSnapshot: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        riderSnapshot: {
            name: { type: String, default: '', trim: true },
            phone: { type: String, default: '', trim: true },
            email: { type: String, default: '', trim: true },
            drivingLicenseNumber: { type: String, default: '', trim: true, uppercase: true },
        },
        returnPhotos: {
            type: [{ url: String, publicId: String }],
            default: [],
        },
        returnNotes: { type: String, default: '', trim: true },
        pickupInspectionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeInspection',
            default: null,
        },
        returnInspectionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeInspection',
            default: null,
        },
        pickupWindowEndsAt: { type: Date, default: null, index: true },
        statusHistory: {
            type: [{
                status: { type: String, enum: BIKE_BOOKING_STATUSES },
                changedAt: { type: Date, default: Date.now },
                changedBy: { type: actionPerformerSchema, default: null },
                note: { type: String, default: '' },
            }],
            default: [],
        },
        rating: {
            stars: { type: Number, min: 1, max: 5, default: null },
            comment: { type: String, default: '', trim: true },
            ratedAt: { type: Date, default: null },
        },
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deletedAt: { type: Date, default: null },
        createdBy: { type: actionPerformerSchema, default: null },
        updatedBy: { type: actionPerformerSchema, default: null },
    },
    {
        collection: 'bike_bookings',
        timestamps: true,
    },
);

bikeBookingSchema.index({ userId: 1, status: 1, createdAt: -1 });
bikeBookingSchema.index({ bikeId: 1, status: 1 });
bikeBookingSchema.index({ bikeId: 1, startAt: 1, endAt: 1, status: 1 });
bikeBookingSchema.index({ zoneId: 1, status: 1, createdAt: -1 });
bikeBookingSchema.index({ status: 1, expiresAt: 1 });
bikeBookingSchema.index({ status: 1, pickupWindowEndsAt: 1 });
bikeBookingSchema.index({ bookingSource: 1, createdAt: -1 });
// Single definitions only (no field-level index:true on these paths)
bikeBookingSchema.index({ 'payment.orderId': 1 }, { sparse: true });
bikeBookingSchema.index({ 'payment.paymentId': 1 }, { sparse: true });

export const BikeBooking = mongoose.models.BikeBooking
    || mongoose.model('BikeBooking', bikeBookingSchema, 'bike_bookings');
