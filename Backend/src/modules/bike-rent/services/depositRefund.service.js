/**
 * Security deposit refund helpers for bike rentals.
 * Credits the shared central wallet once via deposit.service ledger.
 */
import { BikeBooking } from '../models/bikeBooking.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import { BikeAuditLog } from '../models/bikeAuditLog.model.js';
import { getSettings } from './settings.service.js';
import { refundDepositToWallet } from './deposit.service.js';
import { recordTransaction } from './financeTransaction.service.js';
import {
    DEPOSIT_STATUS,
    appendDepositPaymentHistory,
} from '../utils/depositPayment.util.js';
import { BIKE_BOOKING_STATUS } from '../state/bookingStateMachine.js';

const baseFilter = { isDeleted: { $ne: true } };

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

export function resolveDepositRefundDelayMs(settings = {}) {
    const hours = Number(settings.depositRefundHours);
    if (Number.isFinite(hours) && hours >= 0) {
        return hours * 60 * 60 * 1000;
    }
    const days = Number(settings.depositRefundDays);
    if (Number.isFinite(days) && days >= 0) {
        return days * 24 * 60 * 60 * 1000;
    }
    return 24 * 60 * 60 * 1000;
}

export function getRefundableDepositAmount(booking) {
    const held = Number(booking?.money?.depositHeld || 0);
    const captured = Number(booking?.money?.depositCaptured || 0);
    const alreadyRefunded = Number(booking?.money?.depositRefunded || 0);
    return roundMoney(Math.max(0, held - captured - alreadyRefunded));
}

export function buildDepositRefundSchedule(booking, {
    amount = null,
    settings = {},
    now = new Date(),
} = {}) {
    const refundable = amount == null
        ? getRefundableDepositAmount(booking)
        : roundMoney(Math.max(0, Number(amount) || 0));
    const delayMs = resolveDepositRefundDelayMs(settings);
    const hours = Math.max(0, Math.round(delayMs / 3600000));
    const eligibleAt = new Date(now.getTime() + delayMs);

    return {
        status: refundable > 0 ? 'processing' : 'not_applicable',
        amount: refundable,
        scheduledAt: now,
        eligibleAt: refundable > 0 ? eligibleAt : null,
        processedAt: null,
        walletReference: '',
        releasedBy: null,
        note: refundable > 0
            ? `Refund scheduled — expected within ${hours || 24} hours`
            : 'No refundable deposit',
    };
}

async function audit(action, booking, before, after, performer, meta = null) {
    try {
        await BikeAuditLog.create({
            entityType: 'booking',
            entityId: booking?._id || null,
            action,
            before,
            after,
            performedBy: performer,
            meta,
        });
    } catch {
        /* non-blocking */
    }
}

/**
 * Credit refundable security deposit to the central wallet (idempotent).
 * Caller is responsible for status transitions via bookingEngine.transitionBooking.
 */
export async function processSecurityDepositRefund({
    bookingId,
    userId = null,
    finalRefundAmount = null,
    force = false,
    note = '',
    reqUser = null,
} = {}) {
    const booking = await BikeBooking.findOne({ _id: bookingId, ...baseFilter });
    if (!booking) throw new NotFoundError('Booking not found');

    if (userId && String(booking.userId) !== String(userId)) {
        throw new ValidationError('Booking does not belong to user');
    }

    if (booking.depositRefund?.status === 'completed' || booking.depositRefund?.processedAt) {
        return {
            booking,
            refunded: Number(booking.depositRefund?.amount || booking.money?.depositRefunded || 0),
            alreadyProcessed: true,
            walletReference: booking.depositRefund?.walletReference || '',
        };
    }

    const allowedStatuses = new Set([
        BIKE_BOOKING_STATUS.COMPLETED,
        BIKE_BOOKING_STATUS.REFUND_PROCESSING,
    ]);
    if (!allowedStatuses.has(booking.status)) {
        throw new ValidationError('Deposit refund can only be released after return inspection');
    }

    const remainingLate = Number(booking.lateReturn?.remainingAmount || 0);
    if (remainingLate > 0 && booking.lateReturn?.paymentStatus === 'pending') {
        throw new ValidationError('Settle remaining late/damage balance before deposit refund');
    }

    const now = new Date();
    const eligibleAt = booking.depositRefund?.eligibleAt
        ? new Date(booking.depositRefund.eligibleAt)
        : null;
    if (!force && eligibleAt && eligibleAt.getTime() > now.getTime()) {
        throw new ValidationError(
            `Refund is scheduled for ${eligibleAt.toLocaleString()}. Release early from admin if needed.`,
        );
    }

    const performer = reqUser
        ? await resolveActionPerformerSnapshot(reqUser)
        : { role: 'SYSTEM', actionAt: now };

    const maxRefundable = getRefundableDepositAmount(booking);
    const requested = finalRefundAmount == null
        ? maxRefundable
        : roundMoney(Math.max(0, Number(finalRefundAmount) || 0));
    const toRefund = Math.min(maxRefundable, requested);
    const walletRef = `deposit-refund:${booking._id}`;

    let refunded = 0;
    let alreadyProcessed = false;

    if (toRefund > 0) {
        const refundResult = await refundDepositToWallet(booking, {
            amount: toRefund,
            reason: 'Security Deposit Refund',
            reference: walletRef,
            performedBy: performer,
        });
        refunded = Number(refundResult.refunded || 0);
        alreadyProcessed = Boolean(refundResult.alreadyProcessed);
        if (alreadyProcessed && refunded <= 0) {
            refunded = toRefund;
        }
        if (refunded > 0 && !alreadyProcessed) {
            await recordTransaction({
                bookingId: booking._id,
                userId: booking.userId,
                vendorId: booking.vendorId,
                amount: refunded,
                paymentMode: 'wallet',
                transactionType: 'refund',
                referenceId: walletRef,
                performedBy: performer,
                meta: { reason: 'security_deposit_refund' },
            });
        }
    }

    if (booking.securityDepositPayment && (refunded > 0 || toRefund <= 0)) {
        if (refunded > 0) {
            booking.securityDepositPayment.depositStatus = DEPOSIT_STATUS.REFUNDED;
            booking.securityDepositPayment.refundableAmount = 0;
            appendDepositPaymentHistory(booking, {
                status: DEPOSIT_STATUS.REFUNDED,
                method: booking.securityDepositPayment.depositPaymentMethod || '',
                transactionId: walletRef,
                note: note || `Security deposit refunded ₹${refunded} to wallet`,
                performedBy: performer,
            });
        }
    }

    if (booking.lateReturn
        && Number(booking.lateReturn.remainingAmount || 0) <= 0
        && booking.lateReturn.paymentStatus === 'pending') {
        booking.lateReturn.paymentStatus = 'settled';
    }

    booking.depositRefund = {
        ...(booking.depositRefund?.toObject?.() || booking.depositRefund || {}),
        status: refunded > 0 || toRefund <= 0 ? (refunded > 0 ? 'completed' : 'not_applicable') : 'processing',
        amount: roundMoney(refunded || (toRefund <= 0 ? 0 : booking.depositRefund?.amount || 0)),
        scheduledAt: booking.depositRefund?.scheduledAt || now,
        eligibleAt: booking.depositRefund?.eligibleAt || now,
        processedAt: now,
        walletReference: refunded > 0 ? walletRef : '',
        releasedBy: performer,
        note: note || (force ? 'Refund released manually' : 'Automatic deposit refund'),
    };
    if (refunded > 0 || toRefund <= 0) {
        booking.depositRefund.status = refunded > 0 ? 'completed' : 'not_applicable';
        booking.depositRefund.processedAt = now;
    }
    booking.markModified('depositRefund');
    booking.markModified('securityDepositPayment');
    booking.markModified('lateReturn');
    booking.markModified('money');
    await booking.save();

    await audit(
        'booking.deposit_refund_processed',
        booking,
        null,
        {
            refunded,
            walletReference: walletRef,
            force: Boolean(force),
            alreadyProcessed,
        },
        performer,
        { note },
    );

    return {
        booking,
        refunded,
        alreadyProcessed,
        walletReference: walletRef,
        performer,
    };
}

export async function listDueDepositRefundBookingIds({ limit = 50 } = {}) {
    const now = new Date();
    return BikeBooking.find({
        ...baseFilter,
        status: {
            $in: [BIKE_BOOKING_STATUS.REFUND_PROCESSING, BIKE_BOOKING_STATUS.COMPLETED],
        },
        'depositRefund.status': 'processing',
        'depositRefund.eligibleAt': { $lte: now },
        $or: [
            { 'depositRefund.processedAt': null },
            { 'depositRefund.processedAt': { $exists: false } },
        ],
    }).select('_id').limit(limit).lean();
}

export async function getDepositRefundSettings() {
    return getSettings();
}

export default {
    processSecurityDepositRefund,
    buildDepositRefundSchedule,
    getRefundableDepositAmount,
    resolveDepositRefundDelayMs,
    listDueDepositRefundBookingIds,
};
