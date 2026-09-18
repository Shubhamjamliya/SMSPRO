import mongoose from 'mongoose';
import { BikeBooking } from '../models/bikeBooking.model.js';
import { BikeReview } from '../models/bikeReview.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import {
    parseListQuery,
    toBikeRentPagination,
    escapeRegex,
} from '../utils/pagination.util.js';
import { mapBooking } from '../utils/mappers.util.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import { getSettings, getEffectiveSettings } from './settings.service.js';
import { buildNoShowPolicyMessage } from './noShowPolicy.service.js';
import { BIKE_DOCUMENT_TYPES } from '../utils/documentTypes.util.js';

const baseFilter = { isDeleted: { $ne: true } };

const ACTIVE_STATUSES = [
    'requested',
    'pending_approval',
    'payment_pending',
    'reserved',
    'pickup_completed',
    'rental_started',
    'active',
    'return_requested',
    'inspection',
];

export async function listMyBookings(userId, query = {}) {
    if (!userId) throw new ValidationError('Authentication required');
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const filter = { ...baseFilter, userId };

    if (query.scope === 'active') {
        filter.status = { $in: ACTIVE_STATUSES };
    } else if (query.scope === 'history') {
        filter.status = {
            $in: ['completed', 'refund_processing', 'deposit_refunded', 'cancelled', 'rejected', 'expired', 'no_show'],
        };
    } else if (parsed.status) {
        filter.status = parsed.status;
    }

    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        filter.bookingNumber = { $regex: term, $options: 'i' };
    }

    const [docs, total] = await Promise.all([
        BikeBooking.find(filter)
            .populate('bikeId')
            .sort({ createdAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikeBooking.countDocuments(filter),
    ]);

    return toBikeRentPagination({
        docs: docs.map(mapBooking),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

export async function getMyBookingById(userId, id) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid booking id');
    }
    const doc = await BikeBooking.findOne({
        _id: id,
        userId,
        ...baseFilter,
    })
        .populate('bikeId')
        .lean();
    if (!doc) throw new NotFoundError('Booking not found');
    const booking = mapBooking(doc);
    try {
        const compare = await (await import('./inspection.service.js')).getInspectionCompare(id);
        booking.pickupInspection = compare.pickup
            ? {
                id: compare.pickup.id,
                inspectedAt: compare.pickup.inspectedAt,
                fuelLevel: compare.pickup.fuelLevel,
                meterReading: compare.pickup.meterReading,
                conditionNotes: compare.pickup.conditionNotes,
                imageCount: compare.pickup.images?.length || 0,
                videoCount: compare.pickup.videos?.length || 0,
                images: compare.pickup.images || [],
            }
            : null;
        booking.returnInspection = compare.return
            ? {
                id: compare.return.id,
                inspectedAt: compare.return.inspectedAt,
                returnCondition: compare.return.returnCondition,
                fuelLevel: compare.return.fuelLevel,
                meterReading: compare.return.meterReading,
                conditionNotes: compare.return.conditionNotes,
                imageCount: compare.return.images?.length || 0,
                repairCharges: compare.return.repairCharges,
            }
            : null;
    } catch {
        booking.pickupInspection = null;
        booking.returnInspection = null;
    }
    try {
        const bikeIdForSettings = doc.bikeId?._id || doc.bikeId || null;
        const { settings } = await getEffectiveSettings({
            bikeId: bikeIdForSettings,
            vendorId: doc.vendorId || null,
        });
        booking.depositRefundHours = Number(settings.depositRefundHours ?? 24);
    } catch {
        booking.depositRefundHours = 24;
    }
    return booking;
}

/** @deprecated Use bookingEngine.createBooking — kept as thin alias for older imports. */
export async function createDraftBooking(userId, body = {}, reqUser = null) {
    const { createBooking } = await import('./bookingEngine.service.js');
    return createBooking(userId, body, reqUser);
}

export async function submitReview(userId, bookingId, body = {}) {
    const booking = await BikeBooking.findOne({
        _id: bookingId,
        userId,
        ...baseFilter,
        status: { $in: ['completed', 'refund_processing', 'deposit_refunded'] },
    });
    if (!booking) throw new NotFoundError('Completed booking not found');

    const rating = Number(body.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        throw new ValidationError('Rating must be between 1 and 5');
    }

    const existing = await BikeReview.findOne({ bookingId: booking._id });
    if (existing) throw new ValidationError('Review already submitted');

    const review = await BikeReview.create({
        bookingId: booking._id,
        userId,
        bikeId: booking.bikeId,
        rating,
        comment: String(body.comment || '').trim().slice(0, 2000),
    });

    booking.rating = {
        stars: rating,
        comment: review.comment,
        ratedAt: new Date(),
    };
    await booking.save();

    return {
        id: String(review._id),
        bookingId: String(booking._id),
        rating: review.rating,
        comment: review.comment,
    };
}

export async function getPublicModuleSettings({ bikeId = null } = {}) {
    const { settings, sources } = bikeId
        ? await getEffectiveSettings({ bikeId })
        : { settings: await getSettings(), sources: {} };
    return {
        settingsSource: sources,
        outOfServiceMessage: settings.outOfServiceMessage,
        allowWeeklyPricing: settings.allowWeeklyPricing,
        supportPhone: settings.supportPhone,
        supportEmail: settings.supportEmail,
        unpaidBookingTtlMinutes: settings.unpaidBookingTtlMinutes,
        pickupWindowMinutes: settings.pickupWindowMinutes,
        lateFeePerHour: settings.lateFeePerHour,
        lateReturnGraceMinutes: settings.lateReturnGraceMinutes,
        lateReturnMaxCharge: settings.lateReturnMaxCharge,
        cancelFeePercentAfterReserve: settings.cancelFeePercentAfterReserve,
        freeCancelBeforePickupMinutes: settings.freeCancelBeforePickupMinutes,
        cancellationChargeType: settings.cancellationChargeType,
        cancellationChargePercent: settings.cancellationChargePercent,
        cancellationChargeFixed: settings.cancellationChargeFixed,
        minBookingDurationHours: settings.minBookingDurationHours,
        maxBookingDurationHours: settings.maxBookingDurationHours,
        turnaroundBufferMinutes: settings.turnaroundBufferMinutes,
        securityDepositPaymentMode: settings.securityDepositPaymentMode,
        depositRefundDays: settings.depositRefundDays,
        depositRefundHours: settings.depositRefundHours,
        noShowPolicyEnabled: settings.noShowPolicyEnabled,
        noShowGraceMinutes: settings.noShowGraceMinutes,
        noShowRefundRule: settings.noShowRefundRule,
        noShowRefundMode: settings.noShowRefundMode,
        noShowRefundPercent: settings.noShowRefundPercent,
        noShowRefundFixed: settings.noShowRefundFixed,
        noShowPenaltyAmount: settings.noShowPenaltyAmount,
        noShowPolicyMessage: buildNoShowPolicyMessage({
            graceMinutes: settings.noShowGraceMinutes,
            refundRule: settings.noShowRefundRule,
            refundPercent: settings.noShowRefundPercent,
            refundFixed: settings.noShowRefundFixed,
            refundMode: settings.noShowRefundMode,
            policyEnabled: settings.noShowPolicyEnabled,
        }),
        documentTypes: BIKE_DOCUMENT_TYPES,
    };
}
