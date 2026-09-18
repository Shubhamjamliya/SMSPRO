import { BikeDepositLedger } from '../models/bikeDepositLedger.model.js';
import { BikeBooking } from '../models/bikeBooking.model.js';
import { ValidationError } from '../../../core/auth/errors.js';
import { refundWalletBalance } from '../../food/user/services/userWallet.service.js';

/**
 * Append a deposit ledger row. Idempotent when `reference` matches an existing row.
 */
export async function appendDepositLedger({
    bookingId,
    userId,
    type,
    amount,
    reason = '',
    reference = '',
    meta = null,
    performedBy = null,
    session = null,
}) {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) {
        throw new ValidationError('Invalid deposit ledger amount');
    }
    if (amt === 0 && type !== 'adjust') {
        return null;
    }

    if (reference) {
        const existing = await BikeDepositLedger.findOne({ bookingId, type, reference })
            .session(session || null)
            .lean();
        if (existing) return existing;
    }

    const [row] = await BikeDepositLedger.create([{
        bookingId,
        userId,
        type,
        amount: amt,
        reason,
        reference,
        meta,
        performedBy,
    }], session ? { session } : undefined);

    return row;
}

export async function holdDeposit(booking, { reference = '', performedBy = null, session = null } = {}) {
    const amount = Number(booking.money?.securityDeposit || 0);
    if (amount <= 0) return booking;

    await appendDepositLedger({
        bookingId: booking._id,
        userId: booking.userId,
        type: 'hold',
        amount,
        reason: 'Security deposit hold after payment',
        reference: reference || `hold:${booking._id}`,
        performedBy,
        session,
    });

    booking.money = booking.money || {};
    booking.money.depositHeld = amount;
    if (typeof booking.markModified === 'function') booking.markModified('money');
    return booking;
}

/**
 * Capture damage/late from held deposit. Returns remaining refundable deposit.
 */
export async function captureDeposit(booking, {
    amount,
    reason = '',
    reference = '',
    performedBy = null,
    session = null,
} = {}) {
    const capture = Math.max(0, Number(amount) || 0);
    const held = Number(booking.money?.depositHeld || 0);
    const alreadyCaptured = Number(booking.money?.depositCaptured || 0);
    const remainingHold = Math.max(0, held - alreadyCaptured);
    const toCapture = Math.min(capture, remainingHold);

    if (toCapture > 0) {
        await appendDepositLedger({
            bookingId: booking._id,
            userId: booking.userId,
            type: 'capture',
            amount: toCapture,
            reason: reason || 'Deposit capture',
            reference: reference || `capture:${booking._id}:${Date.now()}`,
            performedBy,
            session,
        });
        booking.money.depositCaptured = alreadyCaptured + toCapture;
        if (typeof booking.markModified === 'function') booking.markModified('money');
    }

    return {
        captured: toCapture,
        refundable: Math.max(0, held - Number(booking.money.depositCaptured || 0) - Number(booking.money.depositRefunded || 0)),
    };
}

/**
 * Refund remaining deposit to user wallet (preferred settlement rail).
 * Idempotent by ledger reference — deposit cannot be refunded more than once per reference.
 */
export async function refundDepositToWallet(booking, {
    amount,
    reason = '',
    reference = '',
    performedBy = null,
    session = null,
} = {}) {
    const held = Number(booking.money?.depositHeld || 0);
    const captured = Number(booking.money?.depositCaptured || 0);
    const alreadyRefunded = Number(booking.money?.depositRefunded || 0);
    const maxRefundable = Math.max(0, held - captured - alreadyRefunded);
    const refundAmt = Math.min(maxRefundable, Math.max(0, Number(amount ?? maxRefundable)));
    const ref = reference || `refund:${booking._id}`;

    if (refundAmt <= 0) {
        return { refunded: 0, alreadyProcessed: alreadyRefunded > 0 || Boolean(await BikeDepositLedger.findOne({
            bookingId: booking._id, type: 'refund', reference: ref,
        }).session(session || null).lean()) };
    }

    const prior = await BikeDepositLedger.findOne({
        bookingId: booking._id,
        type: 'refund',
        reference: ref,
    }).session(session || null).lean();

    if (prior) {
        if (alreadyRefunded < Number(prior.amount || 0)) {
            booking.money.depositRefunded = alreadyRefunded + Number(prior.amount || 0);
            if (typeof booking.markModified === 'function') booking.markModified('money');
        }
        return { refunded: 0, alreadyProcessed: true };
    }

    await appendDepositLedger({
        bookingId: booking._id,
        userId: booking.userId,
        type: 'refund',
        amount: refundAmt,
        reason: reason || 'Security deposit refund',
        reference: ref,
        performedBy,
        session,
    });

    const walletResult = await refundWalletBalance(
        booking.userId,
        refundAmt,
        reason || `Bike Rental Security Deposit Refund · ${booking.bookingNumber}`,
        {
            bookingId: String(booking._id),
            bookingNumber: booking.bookingNumber || '',
            referenceId: booking.bookingNumber || String(booking._id),
            refundTransactionId: ref,
            source: 'BIKE_RENTAL',
            kind: 'security_deposit_refund',
        },
    );

    booking.money.depositRefunded = alreadyRefunded + refundAmt;
    if (typeof booking.markModified === 'function') booking.markModified('money');
    return {
        refunded: refundAmt,
        alreadyProcessed: Boolean(walletResult?.alreadyProcessed),
    };
}

export async function getDepositLedger(bookingId) {
    return BikeDepositLedger.find({ bookingId }).sort({ createdAt: 1 }).lean();
}
