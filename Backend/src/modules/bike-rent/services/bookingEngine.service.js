import mongoose from 'mongoose';
import { BikeBooking } from '../models/bikeBooking.model.js';
import { BikeRentZone } from '../models/bikeRentZone.model.js';
import { BikeRentHub } from '../models/bikeRentHub.model.js';
import { BikeCategory } from '../models/bikeCategory.model.js';
import { BikeAuditLog } from '../models/bikeAuditLog.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import {
    createRazorpayOrder,
    verifyPaymentSignature,
    getRazorpayKeyId,
    isRazorpayConfigured,
} from '../../food/orders/helpers/razorpay.helper.js';
import {
    deductWalletBalance,
    refundWalletBalance,
} from '../../food/user/services/userWallet.service.js';
import {
    addWalletCredit,
    WALLET_SOURCES,
} from '../../../core/wallet/index.js';
import { creditVendorEarningForBooking } from './vendorWallet.service.js';
import { computeTax, recordTaxBreakdown } from './taxCalculation.service.js';
import { generateSettlement, getSettlementByBookingId, recordSettlementAdjustment } from './settlement.service.js';
import { recordTransaction } from './financeTransaction.service.js';
import { generateInvoice, generateExtensionInvoice } from './invoice.service.js';
import {
    calculateCancellationRefund,
} from './cancellation.service.js';
import {
    calculateNoShowRefund,
} from './noShowPolicy.service.js';
import {
    buildDepositRefundSchedule,
    processSecurityDepositRefund,
    listDueDepositRefundBookingIds,
    getRefundableDepositAmount,
} from './depositRefund.service.js';
import { quoteBike, calculateQuote } from './catalog.service.js';
import {
    consumeCouponForBooking,
    releaseCouponForBooking,
} from './coupon.service.js';
import { getSettings, getEffectiveSettings } from './settings.service.js';
import {
    holdDeposit,
    captureDeposit,
    refundDepositToWallet,
} from './deposit.service.js';
import * as inspectionService from './inspection.service.js';
import {
    calculateLateReturnCharges,
    buildLateReturnSnapshot,
} from './lateBilling.service.js';
import {
    DEPOSIT_STATUS,
    DEPOSIT_PAYMENT_METHOD,
    DEPOSIT_COLLECTION_METHODS,
    resolveDepositPaymentPlan,
    buildSecurityDepositPayment,
    markDepositPaid,
    appendDepositPaymentHistory,
    isDepositClearedForHandover,
    rentalPayableFromMoney,
} from '../utils/depositPayment.util.js';
import {
    BIKE_BOOKING_STATUS,
    assertTransition,
    buildTransitionGuard,
    isTerminalStatus,
} from '../state/bookingStateMachine.js';
import { mapBooking } from '../utils/mappers.util.js';
import {
    softHoldBike,
    releaseBike,
    markBikeRented,
    syncBikeInventoryWithBooking,
    syncBikeAvailabilityFromBookings,
    hasOverlappingBooking,
    isBikeBookable,
} from './inventory.service.js';
import {
    assertBikeReadyForBooking,
    validateExtensionWindow,
    validateRentalWindowWithSettings,
} from './bookingValidation.service.js';
import { assertWindowAvailable } from './availability.service.js';
import * as notify from './bookingNotifications.service.js';
import { FoodUser } from '../../../core/users/user.model.js';

const baseFilter = { isDeleted: { $ne: true } };

function normalizeDrivingLicense(value) {
    return String(value || '')
        .replace(/[\s-]/g, '')
        .trim()
        .toUpperCase();
}

function assertValidDrivingLicense(value) {
    const license = normalizeDrivingLicense(value);
    if (!license || license.length < 8 || license.length > 20 || !/^[A-Z0-9]+$/.test(license)) {
        throw new ValidationError(
            'A valid driving license number is required for bike rental',
            'DRIVING_LICENSE_REQUIRED',
        );
    }
    return license;
}

function genBookingNumber() {
    return `BR${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

function genPickupCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

const NO_PENDING_EXTENSION = Object.freeze({
    requestedEndAt: null,
    feeEstimate: 0,
    status: 'none',
    conflictBookingId: null,
    reason: '',
    requestedAt: null,
    resolvedAt: null,
    resolvedBy: null,
});

function buildReportSnapshot(booking, extras = {}) {
    const money = booking.money || {};
    const start = booking.actualStartAt || booking.startAt;
    const end = booking.actualEndAt || booking.endAt;
    const durationHours = Number(booking.rentalDurationHours)
        || Math.max(0, Math.ceil((new Date(end) - new Date(start)) / (60 * 60 * 1000)));
    return {
        revenue: Number(money.totalPaid || 0),
        rentalFee: Number(money.rentalFee || 0),
        taxAmount: Number(money.taxAmount || 0),
        securityDeposit: Number(money.securityDeposit || 0),
        depositHeld: Number(money.depositHeld || 0),
        depositCaptured: Number(money.depositCaptured || 0),
        depositRefunded: Number(money.depositRefunded || 0),
        lateFee: Number(money.lateFee || 0),
        damageFee: Number(money.damageFee || 0),
        cancelFee: Number(money.cancelFee || 0),
        extensionFee: Number(money.extensionFee || 0),
        rentalDurationHours: durationHours,
        zoneId: booking.zoneId || null,
        bikeId: booking.bikeId || null,
        userId: booking.userId || null,
        bookingSource: booking.bookingSource || 'app',
        settledAt: extras.settledAt || booking.reportSnapshot?.settledAt || null,
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
 * Atomically transition booking status + sync inventory + append history.
 */
export async function transitionBooking(bookingId, fromStatus, toStatus, {
    note = '',
    performer = null,
    extraSet = {},
    session = null,
    syncInventory = true,
} = {}) {
    const { noop } = assertTransition(fromStatus, toStatus);
    if (noop) {
        const doc = await BikeBooking.findById(bookingId).session(session || null);
        if (!doc) throw new NotFoundError('Booking not found');
        return doc;
    }

    const historyEntry = {
        status: toStatus,
        changedAt: new Date(),
        changedBy: performer,
        note,
    };

    const updated = await BikeBooking.findOneAndUpdate(
        {
            _id: bookingId,
            ...baseFilter,
            ...buildTransitionGuard(fromStatus),
        },
        {
            $set: {
                status: toStatus,
                updatedBy: performer,
                ...extraSet,
            },
            $push: { statusHistory: historyEntry },
        },
        { new: true, session: session || undefined },
    );

    if (!updated) {
        throw new ValidationError(
            `Booking status changed concurrently (expected '${fromStatus}')`,
            'STALE_STATUS',
        );
    }

    if (syncInventory) {
        await syncBikeInventoryWithBooking(updated, session);
    }
    return updated;
}

/**
 * Reuse an unpaid soft-hold for the same user + bike instead of creating duplicates.
 * Expired holds are released first so a fresh booking can be created.
 */
async function findReusablePendingBooking(userId, bikeId) {
    if (!userId || !mongoose.Types.ObjectId.isValid(String(bikeId))) return null;
    const pending = await BikeBooking.findOne({
        userId,
        bikeId,
        ...baseFilter,
        status: {
            $in: [
                BIKE_BOOKING_STATUS.PENDING_APPROVAL,
                BIKE_BOOKING_STATUS.PAYMENT_PENDING,
                BIKE_BOOKING_STATUS.REQUESTED,
            ],
        },
    })
        .sort({ createdAt: -1 });

    if (!pending) return null;

    if (pending.expiresAt && pending.expiresAt.getTime() <= Date.now()) {
        await expireBooking(pending._id, 'Payment window expired');
        return null;
    }

    return pending;
}

/**
 * Create booking in pending_approval with atomic soft-hold + overlap guard.
 * Server recalculates quote — never trusts client totals.
 * Reuses an existing open hold for the same user + bike when still within TTL.
 */
export async function createBooking(userId, body = {}, reqUser = null) {
    if (!userId) throw new ValidationError('Authentication required');

    const reusable = await findReusablePendingBooking(userId, body.bikeId);
    if (reusable) {
        return mapBooking(reusable.toObject ? reusable.toObject() : reusable);
    }

    const window = await validateRentalWindowWithSettings(body.startAt, body.endAt, { bikeId: body.bikeId });
    await assertBikeReadyForBooking({
        bikeId: body.bikeId,
        zoneId: body.zoneId || null,
        startAt: window.start,
        endAt: window.end,
    });

    const user = await FoodUser.findById(userId)
        .select('name phone email drivingLicenseNumber drivingLicenseFront drivingLicenseBack aadhaarFront aadhaarBack')
        .lean();
    if (!user) throw new ValidationError('User profile not found');

    const drivingLicenseNumber = assertValidDrivingLicense(
        body.drivingLicenseNumber || body.licenseNumber || user.drivingLicenseNumber,
    );

    const missingDocs = [
        ['drivingLicenseFront', 'Driving license (front)'],
        ['drivingLicenseBack', 'Driving license (back)'],
        ['aadhaarFront', 'Aadhaar card (front)'],
        ['aadhaarBack', 'Aadhaar card (back)'],
    ].filter(([key]) => !String(user[key] || '').trim());
    if (missingDocs.length) {
        throw new ValidationError(
            `Upload required documents before booking: ${missingDocs.map(([, label]) => label).join(', ')}`,
            'MISSING_IDENTITY_DOCUMENTS',
        );
    }

    // Persist on profile so the rider is not asked again next time
    if (normalizeDrivingLicense(user.drivingLicenseNumber) !== drivingLicenseNumber) {
        await FoodUser.updateOne(
            { _id: userId },
            { $set: { drivingLicenseNumber } },
        );
    }

    const quoted = await quoteBike({
        ...body,
        userId,
        startAt: window.start.toISOString(),
        endAt: window.end.toISOString(),
    });
    const { settings } = await getEffectiveSettings({ bikeId: body.bikeId });
    const ttlMin = Number(settings.unpaidBookingTtlMinutes || 15);
    // The pickup window (how long after startAt the rider can still be checked in) is a
    // dedicated admin setting — must not fall back to noShowGraceMinutes, which governs a
    // separate concern (no-show deposit-refund eligibility tiers).
    const pickupWindow = Math.max(0, Number(settings.pickupWindowMinutes ?? 30) || 0);
    const depositPlan = resolveDepositPaymentPlan({
        settingsMode: settings.securityDepositPaymentMode,
        userChoice: body.depositPaymentMethod || body.securityDepositPaymentMethod,
        depositAmount: quoted.quote.securityDeposit,
    });
    const rentalPayable = Number(
        quoted.quote.rentalPayable
            ?? rentalPayableFromMoney(quoted.quote),
    );
    const totalPayable = depositPlan.includeDepositInPayable
        ? rentalPayable + depositPlan.depositAmount
        : rentalPayable;
    const performer = reqUser ? await resolveActionPerformerSnapshot(reqUser) : {
        userId,
        role: 'USER',
        actionAt: new Date(),
    };
    const bookingSource = ['app', 'web', 'admin', 'api'].includes(String(body.bookingSource || '').toLowerCase())
        ? String(body.bookingSource).toLowerCase()
        : 'app';

    const riderSnapshot = {
        name: String(body.customer?.name || user.name || '').trim(),
        phone: String(body.customer?.phone || user.phone || '').trim(),
        email: String(body.customer?.email || user.email || '').trim().toLowerCase(),
        drivingLicenseNumber,
    };

    const buildDoc = (bike, zone, hub, category = null) => {
        const startAt = new Date(quoted.quote.startAt);
        const endAt = new Date(quoted.quote.endAt);
        const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000);
        const pickupWindowEndsAt = new Date(startAt.getTime() + pickupWindow * 60 * 1000);
        const rentalDurationHours = Number(quoted.quote.hours || window.durationHours || 0);
        const depositHistoryNote = depositPlan.status === DEPOSIT_STATUS.NOT_REQUIRED
            ? 'No security deposit required'
            : depositPlan.choice === DEPOSIT_PAYMENT_METHOD.ONLINE
                ? 'User chose to pay security deposit online after approval'
                : 'User chose to pay security deposit at pickup';
        const hubPayload = hub
            ? {
                name: hub.name || '',
                address: hub.address || '',
                landmark: hub.landmark || '',
                instructions: hub.instructions || '',
                lat: hub.lat == null ? null : Number(hub.lat),
                lng: hub.lng == null ? null : Number(hub.lng),
            }
            : {
                name: zone?.pickupHub?.name || '',
                address: zone?.pickupHub?.address || '',
                landmark: zone?.pickupHub?.landmark || '',
                instructions: zone?.pickupHub?.instructions || '',
                lat: zone?.pickupHub?.lat == null ? null : Number(zone.pickupHub.lat),
                lng: zone?.pickupHub?.lng == null ? null : Number(zone.pickupHub.lng),
            };
        return {
            bookingNumber: genBookingNumber(),
            userId,
            bikeId: bike._id,
            zoneId: bike.zoneId,
            categoryId: bike.categoryId,
            vendorId: bike.vendorId || null,
            ownerType: bike.ownerType || 'admin',
            status: BIKE_BOOKING_STATUS.PENDING_APPROVAL,
            startAt,
            endAt,
            expiresAt,
            pickupWindowEndsAt,
            pickupCode: genPickupCode(),
            couponCode: quoted.couponApplied?.couponCode
                || String(body.couponCode || '').trim().toUpperCase(),
            couponApplied: quoted.couponApplied
                ? {
                    couponId: quoted.couponApplied.couponId,
                    couponCode: quoted.couponApplied.couponCode,
                    name: quoted.couponApplied.name || '',
                    discountType: quoted.couponApplied.discountType || '',
                    discountValue: Number(quoted.couponApplied.discountValue || 0),
                    applicableOn: quoted.couponApplied.applicableOn || 'rental',
                    discountAmount: Number(quoted.couponApplied.discountAmount || 0),
                    rentalDiscount: Number(quoted.couponApplied.rentalDiscount || 0),
                    depositDiscount: Number(quoted.couponApplied.depositDiscount || 0),
                    finalRentalAmount: Number(quoted.couponApplied.finalRentalAmount || 0),
                    finalDepositAmount: Number(quoted.couponApplied.finalDepositAmount || 0),
                    consumed: false,
                    consumedAt: null,
                    releasedAt: null,
                    ownerType: quoted.couponApplied.ownerType || '',
                    vendorId: quoted.couponApplied.vendorId || null,
                }
                : undefined,
            bookingSource,
            rentalDurationHours,
            riderSnapshot,
            money: {
                rentalFee: quoted.quote.rentalFee,
                platformFee: quoted.quote.platformFee || 0,
                platformFeePayer: quoted.quote.platformFeePayer || '',
                taxAmount: quoted.quote.taxAmount,
                gstRate: quoted.quote.gstRate || 0,
                discountAmount: quoted.quote.discountAmount,
                securityDeposit: depositPlan.depositAmount,
                depositHeld: 0,
                totalPayable: Math.round(totalPayable * 100) / 100,
                totalPaid: 0,
            },
            securityDepositPayment: buildSecurityDepositPayment({
                depositAmount: depositPlan.depositAmount,
                status: depositPlan.status,
                depositPaymentMethod: depositPlan.choice || '',
                historyEntry: {
                    status: depositPlan.status,
                    method: depositPlan.choice || '',
                    note: depositHistoryNote,
                    at: new Date(),
                    performedBy: performer,
                },
            }),
            reportSnapshot: buildReportSnapshot({
                money: {
                    rentalFee: quoted.quote.rentalFee,
                    taxAmount: quoted.quote.taxAmount,
                    securityDeposit: depositPlan.depositAmount,
                    totalPaid: 0,
                },
                rentalDurationHours,
                zoneId: bike.zoneId,
                bikeId: bike._id,
                userId,
                bookingSource,
            }),
            quoteSnapshot: {
                ...quoted.quote,
                rentalPayable,
                totalPayable: Math.round(totalPayable * 100) / 100,
                depositPaymentMethod: depositPlan.choice || '',
                depositStatus: depositPlan.status,
            },
            bikeSnapshot: {
                name: bike.name,
                brand: bike.brand,
                model: bike.model,
                registrationNumber: bike.registrationNumber,
                hourlyPrice: bike.hourlyPrice,
                dailyPrice: bike.dailyPrice,
                weeklyPrice: bike.weeklyPrice,
                securityDeposit: bike.securityDeposit,
                vendorId: bike.vendorId || null,
                categoryId: bike.categoryId ? String(bike.categoryId) : null,
                categoryName: category?.name || '',
                zoneName: zone?.name || '',
                hubName: hub?.name || hubPayload.name || '',
            },
            zoneSnapshot: zone
                ? {
                    id: String(zone._id),
                    name: zone.name,
                    pickupHub: hubPayload,
                    hubId: hub ? String(hub._id) : null,
                    hubName: hub?.name || hubPayload.name || '',
                }
                : null,
            statusHistory: [
                {
                    status: BIKE_BOOKING_STATUS.PENDING_APPROVAL,
                    changedBy: performer,
                    note: 'Booking request submitted — awaiting admin approval',
                    changedAt: new Date(),
                },
            ],
            createdBy: performer,
            updatedBy: performer,
        };
    };

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // Re-check buffered overlap inside transaction, then soft-hold + sync
        const settings = await getSettings();
        await assertWindowAvailable({
            bikeId: quoted.bikeId,
            startAt: quoted.quote.startAt,
            endAt: quoted.quote.endAt,
            session,
            bufferMinutes: settings.turnaroundBufferMinutes,
            includeAlternates: true,
            throwOnConflict: true,
        });

        const bike = await softHoldBike(quoted.bikeId, session);
        const zone = await BikeRentZone.findById(bike.zoneId).session(session).lean();
        const hub = bike.hubId
            ? await BikeRentHub.findById(bike.hubId).session(session).lean()
            : null;
        const category = bike.categoryId
            ? await BikeCategory.findById(bike.categoryId).session(session).lean()
            : null;
        const [doc] = await BikeBooking.create([buildDoc(bike, zone, hub, category)], { session });
        await syncBikeAvailabilityFromBookings(doc.bikeId, session);
        await session.commitTransaction();

        await audit('booking.created', doc, null, { status: doc.status }, performer, {
            expiresAt: doc.expiresAt,
            totalPayable: doc.money?.totalPayable,
        });
        await notify.notifyBookingConfirmation(doc);
        try {
            await recordTaxBreakdown({ bookingId: doc._id, breakdown: quoted.quote.taxBreakdown });
        } catch {
            /* non-blocking */
        }
        return mapBooking(doc.toObject());
    } catch (err) {
        try { await session.abortTransaction(); } catch { /* ignore */ }
        const msg = String(err?.message || '');
        const txUnsupported = /transaction|replica set|mongos/i.test(msg);
        if (!txUnsupported) throw err;

        const settings = await getSettings();
        await assertWindowAvailable({
            bikeId: quoted.bikeId,
            startAt: quoted.quote.startAt,
            endAt: quoted.quote.endAt,
            bufferMinutes: settings.turnaroundBufferMinutes,
            includeAlternates: true,
            throwOnConflict: true,
        });
        const bike = await softHoldBike(quoted.bikeId, null);
        try {
            const zone = await BikeRentZone.findById(bike.zoneId).lean();
            const hub = bike.hubId
                ? await BikeRentHub.findById(bike.hubId).lean()
                : null;
            const category = bike.categoryId
                ? await BikeCategory.findById(bike.categoryId).lean()
                : null;
            const doc = await BikeBooking.create(buildDoc(bike, zone, hub, category));
            await syncBikeAvailabilityFromBookings(doc.bikeId);
            await audit('booking.created', doc, null, { status: doc.status }, performer);
            await notify.notifyBookingConfirmation(doc);
            try {
                await recordTaxBreakdown({ bookingId: doc._id, breakdown: quoted.quote.taxBreakdown });
            } catch {
                /* non-blocking */
            }
            return mapBooking(doc.toObject());
        } catch (createErr) {
            await releaseBike(bike._id);
            throw createErr;
        }
    } finally {
        session.endSession();
    }
}

async function loadOwnedBooking(userId, bookingId) {
    if (!mongoose.Types.ObjectId.isValid(String(bookingId))) {
        throw new ValidationError('Invalid booking id');
    }
    const doc = await BikeBooking.findOne({ _id: bookingId, userId, ...baseFilter });
    if (!doc) throw new NotFoundError('Booking not found');
    return doc;
}

export async function createRazorpayPaymentOrder(userId, bookingId) {
    const booking = await loadOwnedBooking(userId, bookingId);
    if (booking.status === BIKE_BOOKING_STATUS.PENDING_APPROVAL
        || booking.status === BIKE_BOOKING_STATUS.REQUESTED) {
        throw new ValidationError('Booking is awaiting admin approval before payment');
    }
    if (booking.status !== BIKE_BOOKING_STATUS.PAYMENT_PENDING) {
        throw new ValidationError('Booking is not awaiting payment');
    }
    if (booking.expiresAt && booking.expiresAt.getTime() < Date.now()) {
        await expireBooking(booking._id, 'Payment window expired');
        throw new ValidationError('Booking expired. Please create a new booking.');
    }
    if (!isRazorpayConfigured()) {
        throw new ValidationError('Razorpay is not configured');
    }

    const amountInr = Number(booking.money?.totalPayable || 0);
    const amountPaise = Math.round(amountInr * 100);
    if (amountPaise <= 0) {
        const settled = await finalizeZeroPayableBooking(userId, bookingId);
        return {
            booking: settled,
            razorpay: null,
            free: true,
        };
    }
    if (amountPaise < 100) throw new ValidationError('Invalid payable amount');

    const rpOrder = await createRazorpayOrder(
        amountPaise,
        'INR',
        booking.bookingNumber,
        {
            bookingId: String(booking._id),
            module: 'bike-rent',
            type: 'rental_payment',
        },
    );

    booking.payment = {
        ...((booking.payment && typeof booking.payment.toObject === 'function')
            ? booking.payment.toObject()
            : (booking.payment || {})),
        gateway: 'razorpay',
        method: 'razorpay',
        orderId: rpOrder.id,
        amountPaise,
        verified: false,
    };
    booking.paymentAttempts.push({
        method: 'razorpay',
        orderId: rpOrder.id,
        status: 'created',
        note: 'Razorpay order created',
    });
    await booking.save();

    const performer = { userId, role: 'USER', actionAt: new Date() };
    await audit('booking.payment_initiated', booking, null, {
        orderId: rpOrder.id,
        amountPaise,
        method: 'razorpay',
    }, performer);

    return {
        booking: mapBooking(booking.toObject()),
        razorpay: {
            key: getRazorpayKeyId(),
            orderId: rpOrder.id,
            amount: amountPaise,
            currency: 'INR',
            name: 'Bike Rent',
            description: `Booking ${booking.bookingNumber}`,
            notes: { bookingId: String(booking._id) },
        },
    };
}

/**
 * Splits a just-successful booking payment into its two finance-ledger rows (rental+fee+tax,
 * and the security deposit if one was bundled in). Non-blocking — `recordTransaction` already
 * self-swallows errors, this just derives the split amounts.
 */
async function recordBookingPaymentLedger(doc, { paymentMode, referenceId, performer }) {
    const totalPaid = Number(doc.money?.totalPaid || 0);
    const depositAmount = doc.securityDepositPayment?.depositStatus === DEPOSIT_STATUS.PAID
        ? Number(doc.securityDepositPayment.depositAmount || 0)
        : 0;
    const rentalPortion = Math.max(0, Math.round((totalPaid - depositAmount) * 100) / 100);
    if (rentalPortion > 0) {
        await recordTransaction({
            bookingId: doc._id,
            userId: doc.userId,
            vendorId: doc.vendorId,
            amount: rentalPortion,
            paymentMode,
            transactionType: 'booking_payment',
            referenceId,
            performedBy: performer,
        });
    }
    if (depositAmount > 0) {
        await recordTransaction({
            bookingId: doc._id,
            userId: doc.userId,
            vendorId: doc.vendorId,
            amount: depositAmount,
            paymentMode,
            transactionType: 'deposit_collection',
            referenceId,
            performedBy: performer,
        });
    }
}

/**
 * Idempotent Razorpay verify → reserved + deposit hold.
 * Duplicate callbacks with same paymentId cannot double-reserve.
 */
export async function verifyRazorpayPayment(userId, bookingId, payload = {}, { viaWebhook = false } = {}) {
    const booking = await loadOwnedBooking(userId, bookingId);
    if (booking.status === BIKE_BOOKING_STATUS.RESERVED && booking.payment?.verified) {
        return mapBooking(booking.toObject());
    }
    if (booking.status !== BIKE_BOOKING_STATUS.PAYMENT_PENDING) {
        throw new ValidationError('Booking is not awaiting payment');
    }

    const orderId = String(payload.razorpayOrderId || '').trim();
    const paymentId = String(payload.razorpayPaymentId || '').trim();
    const signature = String(payload.razorpaySignature || '').trim();
    if (!orderId || !paymentId || (!viaWebhook && !signature)) {
        throw new ValidationError('Razorpay payment fields are required');
    }
    if (booking.payment?.orderId && booking.payment.orderId !== orderId) {
        throw new ValidationError('Razorpay order mismatch');
    }

    // Global idempotency: paymentId already applied on any booking
    const priorPaid = await BikeBooking.findOne({
        'payment.paymentId': paymentId,
        'payment.verified': true,
        ...baseFilter,
    }).select('_id status').lean();
    if (priorPaid && String(priorPaid._id) !== String(booking._id)) {
        throw new ValidationError('Payment already used on another booking');
    }
    if (priorPaid && String(priorPaid._id) === String(booking._id)) {
        return mapBooking(booking.toObject());
    }

    // The webhook controller already verified this request came from Razorpay via the
    // webhook's own HMAC (RAZORPAY_WEBHOOK_SECRET) before ever calling in here — the
    // client-side order signature check below only applies to the browser-driven path.
    if (!viaWebhook && !verifyPaymentSignature(orderId, paymentId, signature)) {
        booking.payment.failedAt = new Date();
        booking.payment.failureReason = 'Invalid payment signature';
        booking.paymentAttempts.push({
            method: 'razorpay',
            orderId,
            paymentId,
            status: 'failed',
            note: 'Signature verification failed',
        });
        await booking.save();
        await audit('booking.payment_failed', booking, null, { reason: 'signature' }, {
            userId, role: 'USER', actionAt: new Date(),
        });
        throw new ValidationError('Payment verification failed');
    }

    if (booking.payment?.paymentId === paymentId && booking.payment?.verified) {
        return mapBooking(booking.toObject());
    }

    const performer = { userId, role: 'USER', actionAt: new Date() };
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        let doc = await BikeBooking.findOne({ _id: booking._id }).session(session);
        if (doc.status === BIKE_BOOKING_STATUS.RESERVED && doc.payment?.verified) {
            await session.commitTransaction();
            return mapBooking(doc.toObject());
        }

        doc.payment = {
            ...(doc.payment?.toObject?.() || doc.payment || {}),
            gateway: 'razorpay',
            method: 'razorpay',
            orderId,
            paymentId,
            signature: viaWebhook ? 'webhook_verified' : signature,
            paidAt: new Date(),
            verified: true,
            failedAt: null,
            failureReason: '',
        };
        doc.money.totalPaid = Number(doc.money.totalPayable || 0);
        doc.paymentAttempts.push({
            method: 'razorpay',
            orderId,
            paymentId,
            status: 'paid',
            note: 'Payment verified',
        });
        doc.expiresAt = null;

        if (String(doc.securityDepositPayment?.depositStatus || '') === DEPOSIT_STATUS.PENDING_ONLINE) {
            markDepositPaid(doc, {
                method: DEPOSIT_PAYMENT_METHOD.RAZORPAY,
                transactionId: paymentId,
                performedBy: performer,
                note: 'Security deposit paid online via Razorpay',
            });
            await holdDeposit(doc, {
                reference: `hold:${paymentId}`,
                performedBy: performer,
                session,
            });
        }

        doc.reportSnapshot = buildReportSnapshot(doc);
        await consumeCouponForBooking(doc, { session });
        await doc.save({ session });

        doc = await transitionBooking(
            doc._id,
            BIKE_BOOKING_STATUS.PAYMENT_PENDING,
            BIKE_BOOKING_STATUS.RESERVED,
            {
                note: 'Payment success — bike reserved',
                performer,
                session,
                extraSet: {
                    'payment.verified': true,
                    'payment.paidAt': new Date(),
                },
            },
        );

        await session.commitTransaction();
        await audit('booking.payment_verified', doc, { status: 'payment_pending' }, {
            status: 'reserved',
            paymentId,
            method: 'razorpay',
        }, performer);
        await notify.notifyPaymentSuccess(doc);
        try {
            await generateInvoice(doc);
        } catch {
            /* non-blocking */
        }
        await recordBookingPaymentLedger(doc, { paymentMode: 'razorpay', referenceId: paymentId, performer });
        return mapBooking((await BikeBooking.findById(doc._id).populate('bikeId').lean()));
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

/**
 * Server-initiated reconciliation entry point for the Razorpay webhook (`payment.captured`).
 * Covers the "payment succeeded at Razorpay but the client never called back" failure mode —
 * closed tab, crashed app, network drop right after checkout. The webhook controller has
 * already verified this request is genuinely from Razorpay (its own HMAC, a separate check
 * from the order-signature check below) before this is ever reached, so it delegates straight
 * into `verifyRazorpayPayment` with `viaWebhook: true` — the exact same guards (status check,
 * cross-booking payment-id dedupe, transactional re-check) apply either way. Safe to call
 * repeatedly for the same payment: a no-op once the booking is already reserved/verified.
 */
export async function reconcileRazorpayPaymentFromWebhook({ bookingId, orderId, paymentId } = {}) {
    if (!bookingId || !orderId || !paymentId) return null;
    if (!mongoose.Types.ObjectId.isValid(String(bookingId))) return null;
    const booking = await BikeBooking.findOne({ _id: bookingId, ...baseFilter })
        .select('_id userId status payment.orderId payment.verified')
        .lean();
    if (!booking) return null;
    if (booking.payment?.orderId && booking.payment.orderId !== orderId) return null;
    if (booking.status !== BIKE_BOOKING_STATUS.PAYMENT_PENDING) return null;
    return verifyRazorpayPayment(
        booking.userId,
        booking._id,
        { razorpayOrderId: orderId, razorpayPaymentId: paymentId },
        { viaWebhook: true },
    );
}

/**
 * When rental payable is ₹0 (e.g. full coupon + deposit at pickup), reserve without gateway.
 */
export async function finalizeZeroPayableBooking(userId, bookingId) {
    const booking = await loadOwnedBooking(userId, bookingId);
    if (booking.status === BIKE_BOOKING_STATUS.RESERVED) {
        return mapBooking(booking.toObject());
    }
    if (booking.status !== BIKE_BOOKING_STATUS.PAYMENT_PENDING) {
        throw new ValidationError('Booking is not awaiting payment');
    }
    const amount = Number(booking.money?.totalPayable || 0);
    if (amount > 0) {
        throw new ValidationError('Payment is required for this booking');
    }

    const performer = { userId, role: 'USER', actionAt: new Date() };
    booking.payment = {
        gateway: 'none',
        method: '',
        orderId: '',
        paymentId: `free:${booking._id}`,
        paidAt: new Date(),
        verified: true,
        amountPaise: 0,
    };
    booking.money.totalPaid = 0;
    booking.expiresAt = null;
    booking.paymentAttempts.push({
        method: 'none',
        status: 'paid',
        note: 'Zero payable — reserved without gateway charge',
    });
    booking.reportSnapshot = buildReportSnapshot(booking);
    await booking.save();

    const doc = await transitionBooking(
        booking._id,
        BIKE_BOOKING_STATUS.PAYMENT_PENDING,
        BIKE_BOOKING_STATUS.RESERVED,
        {
            note: 'Zero payable — bike reserved',
            performer,
        },
    );
    await audit('booking.payment_verified', doc, null, {
        status: 'reserved',
        method: 'none',
        free: true,
    }, performer);
    await notify.notifyPaymentSuccess(doc);
    try {
        await generateInvoice(doc);
    } catch {
        /* non-blocking */
    }
    return mapBooking((await BikeBooking.findById(doc._id).populate('bikeId').lean()));
}

export async function payWithWallet(userId, bookingId) {
    const booking = await loadOwnedBooking(userId, bookingId);
    if (booking.status === BIKE_BOOKING_STATUS.RESERVED && booking.payment?.method === 'wallet') {
        return mapBooking(booking.toObject());
    }
    if (booking.status === BIKE_BOOKING_STATUS.PENDING_APPROVAL
        || booking.status === BIKE_BOOKING_STATUS.REQUESTED) {
        throw new ValidationError('Booking is awaiting admin approval before payment');
    }
    if (booking.status !== BIKE_BOOKING_STATUS.PAYMENT_PENDING) {
        throw new ValidationError('Booking is not awaiting payment');
    }
    if (booking.expiresAt && booking.expiresAt.getTime() < Date.now()) {
        await expireBooking(booking._id, 'Payment window expired');
        throw new ValidationError('Booking expired. Please create a new booking.');
    }

    const amount = Number(booking.money?.totalPayable || 0);
    if (amount <= 0) {
        return finalizeZeroPayableBooking(userId, bookingId);
    }
    const attempt = Array.isArray(booking.paymentAttempts) ? booking.paymentAttempts.length : 0;
    const metaOrderId = `bike-rent:${booking._id}:a${attempt}`;

    const performer = { userId, role: 'USER', actionAt: new Date() };
    await audit('booking.payment_initiated', booking, null, {
        method: 'wallet',
        orderId: metaOrderId,
        amount,
    }, performer);

    const debit = await deductWalletBalance(
        userId,
        amount,
        `Bike Rent ${booking.bookingNumber}`,
        { orderId: metaOrderId, bookingId: String(booking._id), source: 'bike_rent' },
    );

    try {
        let doc = await BikeBooking.findOne({ _id: booking._id, ...baseFilter });
        if (!doc) throw new NotFoundError('Booking not found');
        if (doc.status === BIKE_BOOKING_STATUS.RESERVED) {
            return mapBooking(doc.toObject());
        }
        if (doc.status !== BIKE_BOOKING_STATUS.PAYMENT_PENDING) {
            throw new ValidationError('Booking is not awaiting payment');
        }

        doc.payment = {
            gateway: 'wallet',
            method: 'wallet',
            orderId: metaOrderId,
            paymentId: metaOrderId,
            paidAt: new Date(),
            verified: true,
            amountPaise: Math.round(amount * 100),
        };
        doc.money.totalPaid = amount;
        doc.paymentAttempts.push({
            method: 'wallet',
            orderId: metaOrderId,
            status: debit.alreadyProcessed ? 'idempotent' : 'paid',
            note: 'Wallet payment',
        });
        doc.expiresAt = null;

        if (String(doc.securityDepositPayment?.depositStatus || '') === DEPOSIT_STATUS.PENDING_ONLINE) {
            markDepositPaid(doc, {
                method: DEPOSIT_PAYMENT_METHOD.WALLET,
                transactionId: metaOrderId,
                performedBy: performer,
                note: 'Security deposit paid online via wallet',
            });
            await holdDeposit(doc, {
                reference: `hold:${metaOrderId}`,
                performedBy: performer,
            });
        }

        doc.reportSnapshot = buildReportSnapshot(doc);
        await consumeCouponForBooking(doc);
        await doc.save();

        doc = await transitionBooking(
            doc._id,
            BIKE_BOOKING_STATUS.PAYMENT_PENDING,
            BIKE_BOOKING_STATUS.RESERVED,
            {
                note: 'Wallet payment success — bike reserved',
                performer,
            },
        );

        await audit('booking.payment_verified', doc, null, {
            status: 'reserved',
            method: 'wallet',
            alreadyProcessed: Boolean(debit.alreadyProcessed),
        }, performer);
        await notify.notifyPaymentSuccess(doc);
        try {
            await generateInvoice(doc);
        } catch {
            /* non-blocking */
        }
        await recordBookingPaymentLedger(doc, { paymentMode: 'wallet', referenceId: metaOrderId, performer });
        return mapBooking((await BikeBooking.findById(doc._id).populate('bikeId').lean()));
    } catch (err) {
        try {
            const fresh = await BikeBooking.findById(booking._id).lean();
            if (fresh?.status === BIKE_BOOKING_STATUS.PAYMENT_PENDING) {
                await refundWalletBalance(
                    userId,
                    amount,
                    `Bike Rent payment rollback ${booking.bookingNumber}`,
                    {
                        bookingId: String(booking._id),
                        refundTransactionId: `bike-rent-rollback:${metaOrderId}`,
                        source: 'bike_rent_rollback',
                    },
                );
            }
        } catch { /* non-blocking */ }
        throw err;
    }
}

export async function recordPaymentFailure(userId, bookingId, reason = '') {
    const booking = await loadOwnedBooking(userId, bookingId);
    if (booking.status !== BIKE_BOOKING_STATUS.PAYMENT_PENDING) {
        return mapBooking(booking.toObject());
    }
    booking.payment = {
        ...(booking.payment?.toObject?.() || booking.payment || {}),
        failedAt: new Date(),
        failureReason: String(reason || 'Payment failed').slice(0, 500),
    };
    booking.paymentAttempts.push({
        method: booking.payment?.method || 'razorpay',
        orderId: booking.payment?.orderId || '',
        status: 'failed',
        note: booking.payment.failureReason,
    });
    await booking.save();
    await audit('booking.payment_failed', booking, null, {
        reason: booking.payment.failureReason,
    }, { userId, role: 'USER', actionAt: new Date() });
    return mapBooking(booking.toObject());
}

export async function confirmPickup(userId, bookingId, { pickupCode } = {}) {
    // Option A (hub model): riders show the code; only hub/admin can start the rental.
    void userId;
    void bookingId;
    void pickupCode;
    throw new ValidationError(
        'Pickup must be confirmed by hub staff. Please show your pickup code at the hub.',
        'HUB_HANDOVER_REQUIRED',
    );
}

/**
 * Hub/admin handover: pickup inspection + verify code + start rental.
 * Requires condition photos/videos (or an existing pickup inspection).
 */
export async function adminStartRide(bookingId, body = {}, reqUser = null) {
    const {
        pickupCode,
        collectDeposit,
        depositCollectionMethod,
        depositTransactionId,
    } = body;

    let booking = await BikeBooking.findOne({ _id: bookingId, ...baseFilter });
    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.status !== BIKE_BOOKING_STATUS.RESERVED) {
        throw new ValidationError('Booking is not awaiting hub handover');
    }
    // Hard server-side gate — the rider cannot collect the bike ahead of their booked window,
    // no matter what the client sends. Checked before the code match so an early attempt gets
    // the timing reason, not a misleading "code doesn't match".
    if (booking.startAt && Date.now() < new Date(booking.startAt).getTime()) {
        throw new ValidationError(
            'Bike pickup is not allowed before the scheduled pickup time.',
            'PICKUP_TOO_EARLY',
        );
    }
    // Self-heal instead of racing the maintenance sweep: if the pickup window has already
    // expired by the time hub staff act, mark the no-show now rather than surfacing a
    // confusing generic "not awaiting hub handover" a few seconds before the cron would.
    if (booking.pickupWindowEndsAt && Date.now() > new Date(booking.pickupWindowEndsAt).getTime()) {
        try {
            await markNoShow(booking._id, 'Pickup window expired', reqUser);
        } catch { /* best effort — fall through to the error below either way */ }
        throw new ValidationError(
            'Pickup window has expired. This booking has been marked as no-show — use "Override No-Show" to restore it if the rider is still here.',
            'PICKUP_WINDOW_EXPIRED',
        );
    }
    if (String(pickupCode || '').trim() !== String(booking.pickupCode || '').trim()) {
        throw new ValidationError('Pickup code does not match');
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);

    if (String(booking.securityDepositPayment?.depositStatus || '') === DEPOSIT_STATUS.PENDING_COLLECTION) {
        if (!collectDeposit) {
            throw new ValidationError(
                'Security deposit must be collected before starting the ride',
                'DEPOSIT_PENDING_COLLECTION',
            );
        }
        await adminCollectDeposit(bookingId, {
            method: depositCollectionMethod || DEPOSIT_PAYMENT_METHOD.CASH,
            transactionId: depositTransactionId || '',
            note: 'Collected at hub handover',
        }, reqUser);
        booking = await BikeBooking.findOne({ _id: bookingId, ...baseFilter });
    }

    if (!isDepositClearedForHandover(booking)) {
        throw new ValidationError(
            'Security deposit must be paid or collected before starting the ride',
            'DEPOSIT_REQUIRED',
        );
    }

    let pickupInspection = null;
    if (booking.pickupInspectionId) {
        pickupInspection = await inspectionService.getInspectionById(booking.pickupInspectionId);
    } else {
        const payload = inspectionService.validateInspectionPayload(body, { type: 'PICKUP' });
        const created = await inspectionService.createInspectionRecord({
            booking,
            inspectionType: 'PICKUP',
            payload,
            inspectedBy: performer,
            pickupCodeVerified: true,
        });
        pickupInspection = inspectionService.mapInspection(created.toObject());
        booking.pickupInspectionId = created._id;
        await booking.save();
        await audit(
            'booking.pickup_inspection_completed',
            booking,
            null,
            {
                inspectionId: String(created._id),
                imageCount: payload.images.length,
                videoCount: payload.videos.length,
                meterReading: payload.meterReading,
                fuelLevel: payload.fuelLevel,
            },
            performer,
        );
    }

    let doc = await transitionBooking(
        booking._id,
        BIKE_BOOKING_STATUS.RESERVED,
        BIKE_BOOKING_STATUS.PICKUP_COMPLETED,
        {
            note: 'Pickup inspection completed — bike handed over',
            performer,
            extraSet: {
                pickupCompletedAt: new Date(),
                actualStartAt: new Date(),
                pickupInspectionId: booking.pickupInspectionId,
            },
        },
    );
    doc = await transitionBooking(
        doc._id,
        BIKE_BOOKING_STATUS.PICKUP_COMPLETED,
        BIKE_BOOKING_STATUS.ACTIVE,
        { note: 'Rental started by hub staff', performer },
    );
    await markBikeRented(doc.bikeId);
    await audit(
        'booking.hub_handover_started',
        doc,
        { status: 'reserved' },
        { status: 'active', pickupInspectionId: String(booking.pickupInspectionId || '') },
        performer,
    );

    const mapped = mapBooking((await BikeBooking.findById(doc._id).populate('bikeId').lean()));
    mapped.pickupInspection = pickupInspection;
    return mapped;
}

/**
 * Admin/partner marks pay-at-pickup security deposit as collected.
 */
export async function adminCollectDeposit(bookingId, {
    method = DEPOSIT_PAYMENT_METHOD.CASH,
    transactionId = '',
    note = '',
} = {}, reqUser = null) {
    const booking = await BikeBooking.findOne({ _id: bookingId, ...baseFilter });
    if (!booking) throw new NotFoundError('Booking not found');

    const status = String(booking.securityDepositPayment?.depositStatus || '');
    if (status === DEPOSIT_STATUS.PAID) {
        return mapBooking(booking.toObject ? booking.toObject() : booking);
    }
    if (status !== DEPOSIT_STATUS.PENDING_COLLECTION) {
        throw new ValidationError('Booking does not have a security deposit pending collection');
    }
    if (booking.status !== BIKE_BOOKING_STATUS.RESERVED) {
        throw new ValidationError('Collect deposit after the booking is confirmed/reserved');
    }

    const collectionMethod = String(method || DEPOSIT_PAYMENT_METHOD.CASH).toLowerCase();
    if (!DEPOSIT_COLLECTION_METHODS.includes(collectionMethod)) {
        throw new ValidationError('Deposit collection method must be cash, upi, or cod');
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    const txn = String(transactionId || '').trim() || `pickup:${booking._id}:${Date.now()}`;

    markDepositPaid(booking, {
        method: collectionMethod,
        transactionId: txn,
        performedBy: performer,
        note: note || `Security deposit collected at pickup (${collectionMethod})`,
    });
    await holdDeposit(booking, {
        reference: `hold:pickup:${txn}`,
        performedBy: performer,
    });
    booking.reportSnapshot = buildReportSnapshot(booking);
    booking.updatedBy = performer;
    await booking.save();

    await audit(
        'booking.deposit_collected',
        booking,
        { depositStatus: DEPOSIT_STATUS.PENDING_COLLECTION },
        {
            depositStatus: DEPOSIT_STATUS.PAID,
            method: collectionMethod,
            transactionId: txn,
        },
        performer,
    );

    return mapBooking((await BikeBooking.findById(booking._id).populate('bikeId').lean()));
}

export async function requestReturn(userId, bookingId, body = {}) {
    const booking = await loadOwnedBooking(userId, bookingId);
    if (![BIKE_BOOKING_STATUS.ACTIVE, BIKE_BOOKING_STATUS.RENTAL_STARTED].includes(booking.status)) {
        throw new ValidationError('Booking is not active');
    }
    const from = booking.status;
    const performer = { userId, role: 'USER', actionAt: new Date() };
    const photos = Array.isArray(body.photos) ? body.photos.slice(0, 8) : [];
    const doc = await transitionBooking(booking._id, from, BIKE_BOOKING_STATUS.RETURN_REQUESTED, {
        note: body.notes || 'Return requested by user',
        performer,
        extraSet: {
            returnRequestedAt: new Date(),
            returnNotes: String(body.notes || '').trim().slice(0, 2000),
            returnPhotos: photos,
        },
    });
    await audit('booking.return_requested', doc, { status: from }, { status: 'return_requested' }, performer);
    await notify.notifyReturnRequested(doc);
    return mapBooking((await BikeBooking.findById(doc._id).populate('bikeId').lean()));
}

export async function quoteExtension(userId, bookingId, { newEndAt } = {}) {
    const booking = await loadOwnedBooking(userId, bookingId);
    if (booking.status !== BIKE_BOOKING_STATUS.ACTIVE) {
        throw new ValidationError('Only active rentals can be extended');
    }
    const { nextEnd } = validateExtensionWindow(booking.endAt, newEndAt);
    const { BikeUnit } = await import('../models/bikeUnit.model.js');
    const bike = await BikeUnit.findById(booking.bikeId).lean();
    if (!bike) throw new NotFoundError('Bike not found');

    const settings = await getSettings();
    await assertWindowAvailable({
        bikeId: booking.bikeId,
        startAt: booking.endAt,
        endAt: nextEnd,
        excludeBookingId: booking._id,
        bufferMinutes: settings.turnaroundBufferMinutes,
        includeAlternates: true,
        throwOnConflict: true,
    });

    const deltaQuote = calculateQuote(bike, booking.endAt, nextEnd, { allowPastStart: true });
    // The extension fee is additional rental — it goes through the same tax engine as the
    // original booking (not a separate, untaxed side-charge), so what's actually charged for
    // an extension is tax-inclusive from the quote stage onward.
    const extensionTax = await computeTax({ rentalAmount: deltaQuote.rentalFee });
    const extensionFee = Math.round((deltaQuote.rentalFee + extensionTax.gstAmount) * 100) / 100;
    return {
        bookingId: String(booking._id),
        previousEndAt: booking.endAt,
        newEndAt: nextEnd.toISOString(),
        extensionRentalFee: deltaQuote.rentalFee,
        extensionGstRate: extensionTax.gstRate,
        extensionTaxAmount: extensionTax.gstAmount,
        extensionTaxBreakdown: extensionTax.breakdown,
        extensionFee,
        quote: deltaQuote,
    };
}

export async function extendRental(userId, bookingId, body = {}) {
    const extensionQuote = await quoteExtension(userId, bookingId, body);
    const fee = Number(extensionQuote.extensionFee || 0);
    const method = String(body.paymentMethod || 'wallet').toLowerCase();
    const booking = await loadOwnedBooking(userId, bookingId);
    const performer = { userId, role: 'USER', actionAt: new Date() };

    if (fee > 0) {
        if (method === 'wallet') {
            await deductWalletBalance(
                userId,
                fee,
                `Bike Rent extension ${booking.bookingNumber}`,
                {
                    orderId: `bike-rent-ext:${booking._id}:${extensionQuote.newEndAt}`,
                    bookingId: String(booking._id),
                    source: 'bike_rent_extension',
                },
            );
        } else if (method === 'razorpay') {
            const orderId = String(body.razorpayOrderId || '').trim();
            const paymentId = String(body.razorpayPaymentId || '').trim();
            const signature = String(body.razorpaySignature || '').trim();
            if (!verifyPaymentSignature(orderId, paymentId, signature)) {
                throw new ValidationError('Extension payment verification failed');
            }
        } else {
            throw new ValidationError('Unsupported payment method for extension');
        }
    }

    const rentalFeeDelta = Number(extensionQuote.extensionRentalFee || 0);
    const taxDelta = Number(extensionQuote.extensionTaxAmount || 0);
    const extensionPaymentId = body.razorpayPaymentId || `wallet:${Date.now()}`;

    const previousEndAt = booking.endAt;
    booking.endAt = new Date(extensionQuote.newEndAt);
    booking.money.extensionFee = Number(booking.money.extensionFee || 0) + rentalFeeDelta;
    booking.money.rentalFee = Number(booking.money.rentalFee || 0) + rentalFeeDelta;
    booking.money.taxAmount = Number(booking.money.taxAmount || 0) + taxDelta;
    booking.money.totalPayable = Number(booking.money.totalPayable || 0) + fee;
    booking.money.totalPaid = Number(booking.money.totalPaid || 0) + fee;
    booking.rentalDurationHours = Math.ceil(
        (booking.endAt.getTime() - new Date(booking.startAt).getTime()) / (60 * 60 * 1000),
    );
    booking.extensionHistory.push({
        previousEndAt,
        newEndAt: booking.endAt,
        fee,
        paymentId: extensionPaymentId,
        at: new Date(),
    });
    booking.statusHistory.push({
        status: BIKE_BOOKING_STATUS.ACTIVE,
        changedBy: performer,
        note: `Extended until ${booking.endAt.toISOString()} (+₹${fee})`,
        changedAt: new Date(),
    });
    booking.reportSnapshot = buildReportSnapshot(booking);
    booking.updatedBy = performer;
    booking.pendingExtension = {
        ...NO_PENDING_EXTENSION,
        resolvedAt: new Date(),
        resolvedBy: performer,
    };
    booking.markModified('money');
    booking.markModified('pendingExtension');
    await booking.save();
    await syncBikeAvailabilityFromBookings(booking.bikeId);

    await audit('booking.rental_extended', booking, { previousEndAt }, {
        newEndAt: booking.endAt,
        fee,
        rentalFeeDelta,
        taxDelta,
        method,
    }, performer);
    await notify.notifyRentalExtended(booking);

    // Extension revenue gets its own audit trail + its own follow-up invoice — the original
    // invoice (frozen at first-payment-success) is never reopened or edited.
    if (fee > 0) {
        try {
            await recordTaxBreakdown({
                bookingId: booking._id,
                breakdown: extensionQuote.extensionTaxBreakdown || [],
            });
        } catch {
            /* non-blocking */
        }
        try {
            await generateExtensionInvoice(booking, {
                extensionPaymentId,
                rentalFeeDelta,
                gstRate: extensionQuote.extensionGstRate,
                taxDelta,
                totalFee: fee,
                previousEndAt,
                newEndAt: booking.endAt,
            });
        } catch {
            /* non-blocking */
        }
    }

    return mapBooking((await BikeBooking.findById(booking._id).populate('bikeId').lean()));
}

export async function createExtensionRazorpayOrder(userId, bookingId, { newEndAt } = {}) {
    const extensionQuote = await quoteExtension(userId, bookingId, { newEndAt });
    const amountPaise = Math.round(Number(extensionQuote.extensionFee || 0) * 100);
    if (amountPaise < 100) {
        return { ...extensionQuote, razorpay: null, free: true };
    }
    if (!isRazorpayConfigured()) throw new ValidationError('Razorpay is not configured');
    const rpOrder = await createRazorpayOrder(
        amountPaise,
        'INR',
        `EXT${bookingId}`.slice(0, 40),
        { bookingId: String(bookingId), type: 'bike_rent_extension' },
    );
    return {
        ...extensionQuote,
        razorpay: {
            key: getRazorpayKeyId(),
            orderId: rpOrder.id,
            amount: amountPaise,
            currency: 'INR',
        },
    };
}

/**
 * Request an extension. Returns an immediate quote when the window is free,
 * otherwise records a pendingExtension for admin review and returns conflict details.
 */
export async function requestExtension(userId, bookingId, { newEndAt } = {}) {
    const booking = await loadOwnedBooking(userId, bookingId);
    if (booking.status !== BIKE_BOOKING_STATUS.ACTIVE) {
        throw new ValidationError('Only active rentals can be extended');
    }
    if (String(booking.pendingExtension?.status || 'none') === 'requested') {
        throw new ValidationError(
            'An extension request is already pending admin review',
            'EXTENSION_ALREADY_PENDING',
        );
    }
    const { nextEnd } = validateExtensionWindow(booking.endAt, newEndAt);

    const settings = await getSettings();
    const availability = await assertWindowAvailable({
        bikeId: booking.bikeId,
        startAt: booking.endAt,
        endAt: nextEnd,
        excludeBookingId: booking._id,
        bufferMinutes: settings.turnaroundBufferMinutes,
        includeAlternates: true,
        throwOnConflict: false,
    });

    if (availability.available) {
        const quote = await quoteExtension(userId, bookingId, { newEndAt: nextEnd.toISOString() });
        return { canExtendImmediately: true, quote };
    }

    const { BikeUnit } = await import('../models/bikeUnit.model.js');
    const bike = await BikeUnit.findById(booking.bikeId).lean();
    const feeEstimate = bike
        ? Number(calculateQuote(bike, booking.endAt, nextEnd, { allowPastStart: true }).rentalFee || 0)
        : 0;

    const performer = { userId, role: 'USER', actionAt: new Date() };
    booking.pendingExtension = {
        requestedEndAt: nextEnd,
        feeEstimate,
        status: 'requested',
        conflictBookingId: availability.conflict?.bookingId || null,
        reason: '',
        requestedAt: new Date(),
        resolvedAt: null,
        resolvedBy: null,
    };
    booking.markModified('pendingExtension');
    booking.updatedBy = performer;
    await booking.save();

    await audit('booking.extension_requested', booking, null, {
        requestedEndAt: nextEnd,
        feeEstimate,
        conflictBookingId: availability.conflict?.bookingId || null,
    }, performer);
    await notify.notifyExtensionRequested(booking, { conflict: availability.conflict });

    return {
        canExtendImmediately: false,
        pendingExtension: booking.pendingExtension,
        conflict: availability.conflict,
        nextSlot: availability.nextSlot,
        alternateBikes: availability.alternateBikes,
    };
}

/**
 * Admin approves/rejects a pending extension request.
 * Approval requires the window to be free now (admin may have reassigned the
 * conflicting booking first). Zero-fee approvals are applied immediately.
 */
export async function adminResolveExtension(bookingId, { action, reason = '' } = {}, reqUser = null) {
    const booking = await BikeBooking.findOne({ _id: bookingId, ...baseFilter });
    if (!booking) throw new NotFoundError('Booking not found');
    if (String(booking.pendingExtension?.status || 'none') !== 'requested') {
        throw new ValidationError('No pending extension request on this booking');
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    const act = String(action || '').toLowerCase();
    const trimmedReason = String(reason || '').trim().slice(0, 500);

    if (act === 'reject') {
        booking.pendingExtension.status = 'rejected';
        booking.pendingExtension.reason = trimmedReason;
        booking.pendingExtension.resolvedAt = new Date();
        booking.pendingExtension.resolvedBy = performer;
        booking.markModified('pendingExtension');
        booking.updatedBy = performer;
        await booking.save();

        await audit('booking.extension_rejected', booking, null, { reason: trimmedReason }, performer);
        await notify.notifyExtensionRejected(booking, trimmedReason);
        return mapBooking((await BikeBooking.findById(booking._id).populate('bikeId').lean()));
    }

    if (act !== 'approve') {
        throw new ValidationError('action must be "approve" or "reject"');
    }

    const newEndAt = booking.pendingExtension.requestedEndAt;
    if (!newEndAt) {
        throw new ValidationError('Pending extension is missing a requested end time');
    }

    const settings = await getSettings();
    // Throws if still conflicting — admin must resolve the conflicting booking first
    // (e.g. via reassignBookingBike) before approving.
    await assertWindowAvailable({
        bikeId: booking.bikeId,
        startAt: booking.endAt,
        endAt: newEndAt,
        excludeBookingId: booking._id,
        bufferMinutes: settings.turnaroundBufferMinutes,
        includeAlternates: true,
        throwOnConflict: true,
    });

    const { BikeUnit } = await import('../models/bikeUnit.model.js');
    const bike = await BikeUnit.findById(booking.bikeId).lean();
    if (!bike) throw new NotFoundError('Bike not found');
    const deltaQuote = calculateQuote(bike, booking.endAt, newEndAt, { allowPastStart: true });
    const fee = Number(deltaQuote.rentalFee || 0);

    booking.pendingExtension.status = 'approved';
    booking.pendingExtension.feeEstimate = fee;
    booking.pendingExtension.reason = trimmedReason;
    booking.pendingExtension.resolvedAt = new Date();
    booking.pendingExtension.resolvedBy = performer;
    booking.markModified('pendingExtension');
    booking.updatedBy = performer;
    await booking.save();

    await audit('booking.extension_approved', booking, null, { newEndAt, fee }, performer);
    await notify.notifyExtensionApproved(booking);

    if (fee <= 0) {
        // Nothing payable — apply the new end time right away instead of waiting on the user.
        const previousEndAt = booking.endAt;
        booking.endAt = new Date(newEndAt);
        booking.rentalDurationHours = Math.ceil(
            (booking.endAt.getTime() - new Date(booking.startAt).getTime()) / (60 * 60 * 1000),
        );
        booking.extensionHistory.push({
            previousEndAt,
            newEndAt: booking.endAt,
            fee: 0,
            paymentId: `free:${Date.now()}`,
            at: new Date(),
        });
        booking.pendingExtension = { ...NO_PENDING_EXTENSION, resolvedAt: new Date(), resolvedBy: performer };
        booking.markModified('pendingExtension');
        booking.statusHistory.push({
            status: BIKE_BOOKING_STATUS.ACTIVE,
            changedBy: performer,
            note: `Extended until ${booking.endAt.toISOString()} (admin-approved, no fee)`,
            changedAt: new Date(),
        });
        booking.reportSnapshot = buildReportSnapshot(booking);
        await booking.save();
        await syncBikeAvailabilityFromBookings(booking.bikeId);
        await notify.notifyRentalExtended(booking);
    }

    return mapBooking((await BikeBooking.findById(booking._id).populate('bikeId').lean()));
}

/**
 * Admin swaps the bike assigned to a booking (e.g. to unblock an extension conflict,
 * or when the originally assigned bike breaks down). Requires same zone + free window.
 */
export async function reassignBookingBike(bookingId, { newBikeId, reason = '' } = {}, reqUser = null) {
    const booking = await BikeBooking.findOne({ _id: bookingId, ...baseFilter });
    if (!booking) throw new NotFoundError('Booking not found');
    if (isTerminalStatus(booking.status)) {
        throw new ValidationError('Booking is already completed or terminated');
    }
    if (!mongoose.Types.ObjectId.isValid(String(newBikeId))) {
        throw new ValidationError('Valid newBikeId is required');
    }
    if (String(newBikeId) === String(booking.bikeId)) {
        throw new ValidationError('Booking is already assigned to this bike');
    }

    const { BikeUnit } = await import('../models/bikeUnit.model.js');
    const newBike = await BikeUnit.findOne({ _id: newBikeId, isDeleted: { $ne: true } }).lean();
    if (!newBike) throw new NotFoundError('New bike not found');
    if (String(newBike.zoneId) !== String(booking.zoneId)) {
        throw new ValidationError('New bike must be in the same zone as the booking', 'ZONE_MISMATCH');
    }
    if (!isBikeBookable(newBike)) {
        throw new ValidationError('New bike is not available for booking', 'BIKE_NOT_AVAILABLE');
    }

    const settings = await getSettings();
    await assertWindowAvailable({
        bikeId: newBikeId,
        startAt: booking.startAt,
        endAt: booking.endAt,
        excludeBookingId: booking._id,
        bufferMinutes: settings.turnaroundBufferMinutes,
        includeAlternates: false,
        throwOnConflict: true,
    });

    const performer = await resolveActionPerformerSnapshot(reqUser);
    const trimmedReason = String(reason || '').trim().slice(0, 500);
    const oldBikeId = booking.bikeId;

    const [category, zone, hub] = await Promise.all([
        newBike.categoryId ? BikeCategory.findById(newBike.categoryId).lean() : null,
        BikeRentZone.findById(newBike.zoneId).lean(),
        newBike.hubId ? BikeRentHub.findById(newBike.hubId).lean() : null,
    ]);

    booking.reassignmentHistory.push({
        fromBikeId: oldBikeId,
        toBikeId: newBike._id,
        reason: trimmedReason,
        at: new Date(),
        by: performer,
    });
    booking.bikeId = newBike._id;
    booking.categoryId = newBike.categoryId || booking.categoryId;
    booking.bikeSnapshot = {
        ...(booking.bikeSnapshot || {}),
        name: newBike.name,
        brand: newBike.brand,
        model: newBike.model,
        registrationNumber: newBike.registrationNumber,
        hourlyPrice: newBike.hourlyPrice,
        dailyPrice: newBike.dailyPrice,
        weeklyPrice: newBike.weeklyPrice,
        securityDeposit: newBike.securityDeposit,
        vendorId: newBike.vendorId || null,
        categoryId: newBike.categoryId ? String(newBike.categoryId) : null,
        categoryName: category?.name || '',
        zoneName: zone?.name || '',
        hubName: hub?.name || '',
    };
    booking.markModified('bikeSnapshot');
    booking.markModified('reassignmentHistory');
    booking.statusHistory.push({
        status: booking.status,
        changedBy: performer,
        note: trimmedReason ? `Bike reassigned: ${trimmedReason}` : 'Bike reassigned by admin',
        changedAt: new Date(),
    });
    booking.updatedBy = performer;
    await booking.save();

    await syncBikeAvailabilityFromBookings(oldBikeId);
    await syncBikeAvailabilityFromBookings(newBike._id);

    await audit('booking.bike_reassigned', booking, { bikeId: oldBikeId }, {
        bikeId: newBike._id,
        reason: trimmedReason,
    }, performer);
    await notify.notifyBikeReassigned(booking, {
        fromBikeId: oldBikeId,
        toBikeId: newBike._id,
        reason: trimmedReason,
    });

    return mapBooking((await BikeBooking.findById(booking._id).populate('bikeId').lean()));
}

export async function previewCancellation(userId, bookingId, { actor = 'user' } = {}) {
    const isAdmin = actor === 'admin';
    const booking = isAdmin
        ? await BikeBooking.findOne({ _id: bookingId, ...baseFilter })
        : await loadOwnedBooking(userId, bookingId);
    if (!booking) throw new NotFoundError('Booking not found');

    const cancellable = [
        BIKE_BOOKING_STATUS.REQUESTED,
        BIKE_BOOKING_STATUS.PENDING_APPROVAL,
        BIKE_BOOKING_STATUS.PAYMENT_PENDING,
        BIKE_BOOKING_STATUS.RESERVED,
    ];
    if (!cancellable.includes(booking.status)) {
        throw new ValidationError('Booking cannot be cancelled in current status');
    }

    const { settings } = await getEffectiveSettings({ bikeId: booking.bikeId, vendorId: booking.vendorId });
    const calc = calculateCancellationRefund({
        bookingId: booking._id,
        serviceType: 'BIKE_RENTAL',
        cancellationTime: new Date(),
        pickupTime: booking.startAt,
        bookingStatus: booking.status,
        rentalFee: booking.money?.rentalFee,
        totalPaid: booking.money?.totalPaid,
        depositHeld: booking.money?.depositHeld,
        securityDeposit: booking.money?.securityDeposit
            || booking.securityDepositPayment?.depositAmount,
        freeCancelBeforePickupMinutes: settings.freeCancelBeforePickupMinutes,
        cancellationChargeType: settings.cancellationChargeType,
        cancellationChargePercent: settings.cancellationChargePercent
            ?? settings.cancelFeePercentAfterReserve,
        cancellationChargeFixed: settings.cancellationChargeFixed,
    });

    return {
        bookingId: String(booking._id),
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        pickupTime: booking.startAt,
        ...calc,
    };
}

/**
 * User-facing return settlement preview (estimate before hub inspection,
 * or confirmed values after lateReturn / depositRefund are written).
 */
export async function previewMyReturnSettlement(userId, bookingId) {
    const booking = await loadOwnedBooking(userId, bookingId);
    if (!booking) throw new NotFoundError('Booking not found');

    const allowed = [
        BIKE_BOOKING_STATUS.RESERVED,
        BIKE_BOOKING_STATUS.PICKUP_COMPLETED,
        BIKE_BOOKING_STATUS.RENTAL_STARTED,
        BIKE_BOOKING_STATUS.ACTIVE,
        BIKE_BOOKING_STATUS.RETURN_REQUESTED,
        BIKE_BOOKING_STATUS.INSPECTION,
        BIKE_BOOKING_STATUS.COMPLETED,
        BIKE_BOOKING_STATUS.REFUND_PROCESSING,
        BIKE_BOOKING_STATUS.DEPOSIT_REFUNDED,
    ];
    if (!allowed.includes(booking.status)) {
        throw new ValidationError('Return settlement is not available for this booking status');
    }

    const { settings } = await getEffectiveSettings({ bikeId: booking.bikeId, vendorId: booking.vendorId });
    const money = booking.money || {};
    const depositPay = booking.securityDepositPayment || {};
    const depositAmount = Number(
        depositPay.depositAmount
            ?? money.depositHeld
            ?? money.securityDeposit
            ?? 0,
    );

    const startAt = booking.startAt ? new Date(booking.startAt) : null;
    const endAt = booking.endAt ? new Date(booking.endAt) : null;
    const durationHours = Number(booking.rentalDurationHours || 0)
        || (startAt && endAt && !Number.isNaN(startAt.getTime()) && !Number.isNaN(endAt.getTime())
            ? Math.max(0, Math.round(((endAt.getTime() - startAt.getTime()) / 3600000) * 100) / 100)
            : 0);

    const lateExisting = booking.lateReturn;
    const hasSettledLate = Boolean(
        lateExisting
        && (lateExisting.isLate
            || Number(lateExisting.chargeAmount || lateExisting.totalLateCharge || 0) > 0
            || Number(lateExisting.damageFee || 0) > 0
            || Number(lateExisting.deductedFromDeposit || 0) > 0
            || lateExisting.actualReturnAt),
    );

    let lateCalc;
    let confirmed = false;
    if (hasSettledLate) {
        confirmed = true;
        const charge = Number(lateExisting.chargeAmount ?? lateExisting.totalLateCharge ?? 0);
        const damage = Number(lateExisting.damageFee || 0);
        const deducted = Number(lateExisting.deductedFromDeposit ?? lateExisting.depositDeduction ?? 0);
        const refundable = Number(
            lateExisting.refundableAmount
                ?? Math.max(0, depositAmount - deducted),
        );
        lateCalc = {
            isLate: Boolean(lateExisting.isLate),
            scheduledReturnAt: lateExisting.scheduledReturnAt || booking.endAt,
            actualReturnAt: lateExisting.actualReturnAt || booking.actualEndAt || new Date(),
            lateDurationLabel: lateExisting.lateDurationLabel || '',
            billableDurationLabel: lateExisting.billableDurationLabel || '',
            graceMinutesApplied: Number(lateExisting.graceMinutesApplied || 0),
            extraHours: Number(lateExisting.extraHours || 0),
            chargePerHour: Number(lateExisting.chargePerHour || settings.lateFeePerHour || 0),
            totalLateCharge: charge,
            damageFee: damage,
            totalCharges: Number(lateExisting.totalCharges ?? (charge + damage)),
            securityDeposit: depositAmount,
            depositDeduction: deducted,
            remainingPayable: Number(lateExisting.remainingAmount ?? lateExisting.remainingPayable ?? 0),
            refundableAmount: refundable,
            paymentStatus: lateExisting.paymentStatus || 'settled',
        };
    } else {
        lateCalc = await previewLateReturnCharges(bookingId, {
            actualReturnAt: new Date().toISOString(),
            damageFee: 0,
        });
    }

    const deductions = [];
    if (Number(lateCalc.totalLateCharge || 0) > 0) {
        deductions.push({
            key: 'late',
            label: 'Extra hours charges',
            reason: lateCalc.extraHours
                ? `${lateCalc.extraHours} billable hour${lateCalc.extraHours === 1 ? '' : 's'} after grace`
                : (lateCalc.lateDurationLabel || 'Late return'),
            amount: Number(lateCalc.totalLateCharge || 0),
        });
    }
    if (Number(lateCalc.damageFee || 0) > 0) {
        deductions.push({
            key: 'damage',
            label: 'Damage / repair charges',
            reason: 'Recorded at return inspection',
            amount: Number(lateCalc.damageFee || 0),
        });
    }

    const totalDeducted = Number(
        lateCalc.depositDeduction
            ?? deductions.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    );
    const finalRefundable = Number(lateCalc.refundableAmount ?? Math.max(0, depositAmount - totalDeducted));
    const remainingPayable = Number(lateCalc.remainingPayable || 0);

    const depositRefund = booking.depositRefund || {};
    const depStatus = String(depositRefund.status || '').toLowerCase();
    const hoursHint = Number(settings.depositRefundHours ?? 24);
    let refundStatus = 'Pending';
    if (depStatus === 'completed' || booking.status === BIKE_BOOKING_STATUS.DEPOSIT_REFUNDED) {
        refundStatus = 'Completed';
    } else if (depStatus === 'processing' || booking.status === BIKE_BOOKING_STATUS.REFUND_PROCESSING) {
        refundStatus = 'Processing';
    } else if (remainingPayable > 0) {
        refundStatus = 'On hold';
    } else if (confirmed && finalRefundable <= 0) {
        refundStatus = 'Not applicable';
    } else if (!confirmed) {
        refundStatus = 'Estimate';
    }

    const timeline = refundStatus === 'Completed'
        ? 'Credited to wallet'
        : refundStatus === 'On hold'
            ? 'After remaining balance is paid'
            : hoursHint <= 0
                ? 'After return inspection'
                : hoursHint < 24
                    ? `Within ${hoursHint} hour${hoursHint === 1 ? '' : 's'} after inspection`
                    : hoursHint === 24
                        ? 'Within 24 hours after inspection'
                        : `Within ${Math.round(hoursHint / 24)} day(s) after inspection`;

    return {
        bookingId: String(booking._id),
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        confirmed,
        estimateNote: confirmed
            ? 'Settlement confirmed after hub inspection.'
            : 'Estimate based on current time. Final amounts are confirmed after hub inspection (damage fees may apply).',
        rental: {
            rentalFee: Number(money.rentalFee || 0),
            taxAmount: Number(money.taxAmount || 0),
            discountAmount: Number(money.discountAmount || 0),
            extensionFee: Number(money.extensionFee || 0),
            totalPaid: Number(money.totalPaid || 0),
            totalPayable: Number(money.totalPayable || 0),
            durationHours,
            startAt: booking.startAt,
            endAt: booking.endAt,
        },
        securityDeposit: depositAmount,
        late: {
            isLate: Boolean(lateCalc.isLate),
            scheduledReturnAt: lateCalc.scheduledReturnAt,
            actualReturnAt: lateCalc.actualReturnAt,
            lateDurationLabel: lateCalc.lateDurationLabel || '',
            billableDurationLabel: lateCalc.billableDurationLabel || '',
            graceMinutesApplied: Number(lateCalc.graceMinutesApplied || 0),
            extraHours: Number(lateCalc.extraHours || 0),
            chargePerHour: Number(lateCalc.chargePerHour || 0),
            totalLateCharge: Number(lateCalc.totalLateCharge || 0),
            damageFee: Number(lateCalc.damageFee || 0),
            totalCharges: Number(lateCalc.totalCharges || 0),
            depositDeduction: totalDeducted,
            remainingPayable,
            refundableAmount: finalRefundable,
        },
        deductions,
        totalDeducted,
        finalRefundable,
        remainingPayable,
        refund: {
            amount: Number(depositRefund.amount ?? finalRefundable),
            status: refundStatus,
            method: 'Wallet',
            timeline,
            initiatedAt: depositRefund.scheduledAt || depositRefund.eligibleAt || null,
            creditedAt: depositRefund.processedAt || null,
            eligibleAt: depositRefund.eligibleAt || null,
            hoursHint,
        },
    };
}

export async function cancelBooking(userId, bookingId, { reason = '', actor = 'user' } = {}, reqUser = null) {
    const isAdmin = actor === 'admin';
    const trimmedReason = String(reason || '').trim().slice(0, 500);
    if (isAdmin && !trimmedReason) {
        throw new ValidationError('Cancellation reason is required');
    }

    const booking = isAdmin
        ? await BikeBooking.findOne({ _id: bookingId, ...baseFilter })
        : await loadOwnedBooking(userId, bookingId);
    if (!booking) throw new NotFoundError('Booking not found');

    const cancellable = [
        BIKE_BOOKING_STATUS.REQUESTED,
        BIKE_BOOKING_STATUS.PENDING_APPROVAL,
        BIKE_BOOKING_STATUS.PAYMENT_PENDING,
        BIKE_BOOKING_STATUS.RESERVED,
    ];
    if (!cancellable.includes(booking.status)) {
        throw new ValidationError('Booking cannot be cancelled in current status');
    }

    const { settings } = await getEffectiveSettings({ bikeId: booking.bikeId, vendorId: booking.vendorId });
    const performer = reqUser
        ? await resolveActionPerformerSnapshot(reqUser)
        : { userId, role: isAdmin ? 'ADMIN' : 'USER', actionAt: new Date() };
    const cancelledBy = isAdmin ? 'admin' : (actor === 'system' ? 'system' : 'user');
    const reasonForLedger = trimmedReason || (isAdmin ? '' : 'Cancelled by user');

    const calc = calculateCancellationRefund({
        bookingId: booking._id,
        serviceType: 'BIKE_RENTAL',
        cancellationTime: new Date(),
        pickupTime: booking.startAt,
        bookingStatus: booking.status,
        rentalFee: booking.money?.rentalFee,
        totalPaid: booking.money?.totalPaid,
        depositHeld: booking.money?.depositHeld,
        securityDeposit: booking.money?.securityDeposit
            || booking.securityDepositPayment?.depositAmount,
        freeCancelBeforePickupMinutes: settings.freeCancelBeforePickupMinutes,
        cancellationChargeType: settings.cancellationChargeType,
        cancellationChargePercent: settings.cancellationChargePercent
            ?? settings.cancelFeePercentAfterReserve,
        cancellationChargeFixed: settings.cancellationChargeFixed,
    });

    const cancelFee = calc.cancellationCharge;
    const from = booking.status;
    const depositHeld = Number(booking.money.depositHeld || 0);

    // Credit rental refund (net of cancel fee) to the central wallet.
    if (calc.rentalRefund > 0) {
        await addWalletCredit({
            userId: booking.userId,
            amount: calc.rentalRefund,
            source: WALLET_SOURCES.BIKE_RENTAL,
            reason: `Bike Rental Cancellation Refund · ${booking.bookingNumber}`,
            referenceId: String(booking._id),
            idempotencyKey: `cancel-rental:${booking._id}`,
            metadata: {
                bookingId: String(booking._id),
                bookingNumber: booking.bookingNumber,
                refundTransactionId: `cancel-rental:${booking._id}`,
                kind: 'cancellation_refund',
            },
        });
        await recordTransaction({
            bookingId: booking._id,
            userId: booking.userId,
            vendorId: booking.vendorId,
            amount: calc.rentalRefund,
            paymentMode: 'wallet',
            transactionType: 'refund',
            referenceId: `cancel-rental:${booking._id}`,
            performedBy: performer,
            meta: { reason: 'cancellation_refund' },
        });
    }

    // Security deposit → central wallet (idempotent via deposit service reference).
    if (depositHeld > 0 && calc.securityDepositRefund > 0) {
        await refundDepositToWallet(booking, {
            amount: calc.securityDepositRefund,
            reason: 'Bike Rental Security Deposit Refund',
            reference: `cancel-deposit:${booking._id}`,
            performedBy: performer,
        });
        await recordTransaction({
            bookingId: booking._id,
            userId: booking.userId,
            vendorId: booking.vendorId,
            amount: calc.securityDepositRefund,
            paymentMode: 'wallet',
            transactionType: 'refund',
            referenceId: `cancel-deposit:${booking._id}`,
            performedBy: performer,
            meta: { reason: 'cancellation_deposit_refund' },
        });
        if (booking.securityDepositPayment) {
            booking.securityDepositPayment.depositStatus = DEPOSIT_STATUS.REFUNDED;
            booking.securityDepositPayment.refundableAmount = 0;
            booking.securityDepositPayment.deductedAmount = Number(
                booking.securityDepositPayment.deductedAmount || 0,
            );
            appendDepositPaymentHistory(booking, {
                status: DEPOSIT_STATUS.REFUNDED,
                method: booking.securityDepositPayment.depositPaymentMethod || '',
                transactionId: `cancel-deposit:${booking._id}`,
                note: `Deposit refunded ₹${calc.securityDepositRefund} on cancellation`,
                performedBy: performer,
            });
        }
    }

    booking.money.cancelFee = cancelFee;
    booking.cancellation = {
        freeCancelUntil: new Date(calc.freeCancelUntil),
        withinFreeWindow: Boolean(calc.withinFreeWindow),
        cancellationChargeType: calc.cancellationChargeType,
        cancellationCharge: cancelFee,
        rentalRefund: calc.rentalRefund,
        securityDepositRefund: calc.securityDepositRefund,
        walletCreditAmount: calc.walletCreditAmount,
        finalRefundAmount: calc.finalRefundAmount,
        calculatedAt: new Date(),
    };
    booking.markModified('cancellation');
    booking.markModified('securityDepositPayment');
    booking.reportSnapshot = buildReportSnapshot(booking);
    await releaseCouponForBooking(booking);
    await booking.save();

    const doc = await transitionBooking(booking._id, from, BIKE_BOOKING_STATUS.CANCELLED, {
        note: reasonForLedger || 'Cancelled',
        performer,
        extraSet: {
            cancelledAt: new Date(),
            cancellationReason: reasonForLedger,
            cancelledBy,
            'money.cancelFee': cancelFee,
            'money.depositRefunded': Number(booking.money.depositRefunded || 0),
            cancellation: booking.cancellation,
            reportSnapshot: buildReportSnapshot(booking),
        },
    });
    await releaseBike(doc.bikeId);
    await audit('booking.cancelled', doc, { status: from }, {
        status: 'cancelled',
        cancelFee,
        walletCreditAmount: calc.walletCreditAmount,
        withinFreeWindow: calc.withinFreeWindow,
        cancelledBy,
    }, performer, { reason: reasonForLedger });
    await notify.notifyBookingCancelled(doc, reasonForLedger);

    const mapped = mapBooking((await BikeBooking.findById(doc._id).populate('bikeId').lean()));
    mapped.cancellationPreview = calc;
    return mapped;
}

export async function inspectAndSettle(bookingId, body = {}, reqUser = null) {
    const booking = await BikeBooking.findOne({ _id: bookingId, ...baseFilter });
    if (!booking) throw new NotFoundError('Booking not found');

    const startableFrom = [
        BIKE_BOOKING_STATUS.ACTIVE,
        BIKE_BOOKING_STATUS.RENTAL_STARTED,
        BIKE_BOOKING_STATUS.PICKUP_COMPLETED,
        BIKE_BOOKING_STATUS.RETURN_REQUESTED,
        BIKE_BOOKING_STATUS.INSPECTION,
    ];
    if (!startableFrom.includes(booking.status)) {
        throw new ValidationError('Booking is not ready for end-ride inspection');
    }

    const { settings } = await getEffectiveSettings({ bikeId: booking.bikeId, vendorId: booking.vendorId });
    const performer = await resolveActionPerformerSnapshot(reqUser);
    const now = new Date();

    // Persist return inspection proof (required for dispute protection).
    const returnPayload = inspectionService.validateInspectionPayload(
        {
            ...body,
            returnCondition: body.returnCondition
                || (Number(body.damageFee) > 0 || (Array.isArray(body.damages) && body.damages.length)
                    ? 'damage_found'
                    : 'same_condition'),
            repairCharges: body.repairCharges ?? body.damageFee,
            conditionNotes: body.conditionNotes || body.inspectionNotes || body.returnNotes || '',
        },
        { type: 'RETURN' },
    );

    const pickupInspection = booking.pickupInspectionId
        ? await inspectionService.getInspectionById(booking.pickupInspectionId).catch(() => null)
        : await inspectionService.getPickupInspectionForBooking(booking._id);

    const returnInspectionDoc = await inspectionService.createInspectionRecord({
        booking,
        inspectionType: 'RETURN',
        payload: returnPayload,
        inspectedBy: performer,
        comparedWithInspectionId: pickupInspection?.id || booking.pickupInspectionId || null,
    });

    let damageFee = Math.max(
        0,
        Number(body.damageFee ?? returnPayload.repairCharges) || 0,
    );
    if (
        returnPayload.returnCondition === 'damage_found'
        && damageFee <= 0
        && Array.isArray(returnPayload.damages)
    ) {
        damageFee = returnPayload.damages.reduce(
            (sum, row) => sum + Number(row.estimatedCost || 0),
            0,
        );
    }

    const actualReturnAt = body.actualReturnAt
        ? new Date(body.actualReturnAt)
        : now;
    if (Number.isNaN(actualReturnAt.getTime())) {
        throw new ValidationError('Invalid actual return time');
    }

    const depositForBilling = Number(
        booking.money?.depositHeld
            || booking.securityDepositPayment?.depositAmount
            || booking.money?.securityDeposit
            || 0,
    );

    let lateCalc = calculateLateReturnCharges({
        scheduledReturnTime: booking.endAt,
        actualReturnTime: actualReturnAt,
        securityDeposit: depositForBilling,
        hourlyCharge: settings.lateFeePerHour,
        gracePeriodMinutes: settings.lateReturnGraceMinutes,
        maxLateCharge: settings.lateReturnMaxCharge,
        damageFee,
    });

    // Admin override of late fee amount (duration metadata kept; deposit math recomputed).
    const lateFeeOverrideRaw = body.lateFee;
    const hasLateFeeOverride = lateFeeOverrideRaw !== undefined
        && lateFeeOverrideRaw !== null
        && lateFeeOverrideRaw !== ''
        && Number.isFinite(Number(lateFeeOverrideRaw));
    if (hasLateFeeOverride) {
        const overrideLate = Math.max(0, Number(lateFeeOverrideRaw));
        const forcedTotal = Math.round((overrideLate + damageFee) * 100) / 100;
        const depositDeduction = Math.min(depositForBilling, forcedTotal);
        lateCalc = {
            ...lateCalc,
            totalLateCharge: overrideLate,
            damageFee,
            totalCharges: forcedTotal,
            depositDeduction,
            remainingPayable: Math.max(0, Math.round((forcedTotal - depositDeduction) * 100) / 100),
            refundableAmount: Math.max(0, Math.round((depositForBilling - depositDeduction) * 100) / 100),
            paymentStatus: forcedTotal - depositDeduction > 0 ? 'pending' : 'settled',
        };
    }

    const lateFee = lateCalc.totalLateCharge;

    let from = booking.status;
    let doc = booking;
    doc.returnInspectionId = returnInspectionDoc._id;
    doc.returnPhotos = [
        ...returnPayload.images.map((item) => ({ url: item.url, publicId: item.publicId || '' })),
        ...returnPayload.videos.map((item) => ({ url: item.url, publicId: item.publicId || '' })),
    ].slice(0, 30);
    doc.lateReturn = buildLateReturnSnapshot(lateCalc, {
        note: hasLateFeeOverride
            ? 'Late charges with admin override'
            : 'Late charges calculated from settings',
        performedBy: performer,
        previous: booking.lateReturn,
    });
    await doc.save();

    await audit(
        'booking.return_inspection_completed',
        doc,
        null,
        {
            inspectionId: String(returnInspectionDoc._id),
            returnCondition: returnPayload.returnCondition,
            imageCount: returnPayload.images.length,
            videoCount: returnPayload.videos.length,
            repairCharges: damageFee,
            lateReturn: {
                extraHours: lateCalc.extraHours,
                totalLateCharge: lateCalc.totalLateCharge,
                depositDeduction: lateCalc.depositDeduction,
                remainingPayable: lateCalc.remainingPayable,
                refundableAmount: lateCalc.refundableAmount,
            },
        },
        performer,
    );

    // Hub can end an active ride without waiting for user return request.
    if (
        from === BIKE_BOOKING_STATUS.ACTIVE
        || from === BIKE_BOOKING_STATUS.RENTAL_STARTED
        || from === BIKE_BOOKING_STATUS.PICKUP_COMPLETED
    ) {
        if (from === BIKE_BOOKING_STATUS.PICKUP_COMPLETED) {
            doc = await transitionBooking(
                doc._id,
                BIKE_BOOKING_STATUS.PICKUP_COMPLETED,
                BIKE_BOOKING_STATUS.ACTIVE,
                { note: 'Normalized before end ride', performer },
            );
            from = BIKE_BOOKING_STATUS.ACTIVE;
        }
        doc = await transitionBooking(doc._id, from, BIKE_BOOKING_STATUS.RETURN_REQUESTED, {
            note: body.returnNotes || 'Return received at hub',
            performer,
            extraSet: {
                returnRequestedAt: now,
                returnNotes: String(body.returnNotes || body.inspectionNotes || returnPayload.conditionNotes || 'Ended by hub staff')
                    .trim()
                    .slice(0, 2000),
                returnInspectionId: returnInspectionDoc._id,
            },
        });
        from = BIKE_BOOKING_STATUS.RETURN_REQUESTED;
    }

    if (from === BIKE_BOOKING_STATUS.RETURN_REQUESTED) {
        doc = await transitionBooking(doc._id, from, BIKE_BOOKING_STATUS.INSPECTION, {
            note: body.inspectionNotes || returnPayload.conditionNotes || 'Return inspection started',
            performer,
            extraSet: {
                inspectionNotes: String(
                    body.inspectionNotes || returnPayload.conditionNotes || '',
                ).trim().slice(0, 2000),
                'money.lateFee': lateFee,
                'money.damageFee': damageFee,
                returnInspectionId: returnInspectionDoc._id,
            },
        });
        from = BIKE_BOOKING_STATUS.INSPECTION;
    } else {
        doc.money.lateFee = lateFee;
        doc.money.damageFee = damageFee;
        doc.inspectionNotes = String(
            body.inspectionNotes || returnPayload.conditionNotes || doc.inspectionNotes || '',
        ).trim();
        doc.returnInspectionId = returnInspectionDoc._id;
        await doc.save();
    }

    // Recompute tax now that late/damage charges are known, so money.taxAmount and the invoice
    // reflect them. Recorded for reporting/invoicing — not threaded into lateCalc's
    // deposit-deduction/remaining-payable collection math above, which is unchanged.
    if (lateFee > 0 || damageFee > 0) {
        const netRentalAmount = Math.max(
            0,
            Number(doc.money.rentalFee || 0) - Number(doc.money.discountAmount || 0),
        );
        const customerFacingPlatformFee = doc.money.platformFeePayer === 'customer'
            ? Number(doc.money.platformFee || 0)
            : 0;
        const taxResult = await computeTax({
            rentalAmount: netRentalAmount,
            platformFee: customerFacingPlatformFee,
            lateCharges: lateFee,
            damageCharges: damageFee,
        });
        doc.money.taxAmount = taxResult.gstAmount;
        doc.money.gstRate = taxResult.gstRate;
        doc.markModified('money');
        await doc.save();
        try {
            await recordTaxBreakdown({ bookingId: doc._id, breakdown: taxResult.breakdown });
        } catch {
            /* non-blocking */
        }
    }

    const toCapture = lateCalc.depositDeduction;
    await captureDeposit(doc, {
        amount: toCapture,
        reason: `Late ₹${lateFee} + damage ₹${damageFee}`,
        reference: `inspect-capture:${doc._id}`,
        performedBy: performer,
    });
    if (toCapture > 0) {
        const chargeTotal = Number(lateFee || 0) + Number(damageFee || 0);
        const lateShare = chargeTotal > 0
            ? Math.round(toCapture * (Number(lateFee || 0) / chargeTotal) * 100) / 100
            : 0;
        const damageShare = Math.round((toCapture - lateShare) * 100) / 100;
        if (lateShare > 0) {
            await recordTransaction({
                bookingId: doc._id,
                userId: doc.userId,
                vendorId: doc.vendorId,
                amount: lateShare,
                paymentMode: 'system',
                transactionType: 'late_charge',
                referenceId: `inspect-capture:${doc._id}`,
                performedBy: performer,
                meta: { source: 'deposit_capture' },
            });
        }
        if (damageShare > 0) {
            await recordTransaction({
                bookingId: doc._id,
                userId: doc.userId,
                vendorId: doc.vendorId,
                amount: damageShare,
                paymentMode: 'system',
                transactionType: 'damage_deduction',
                referenceId: `inspect-capture:${doc._id}`,
                performedBy: performer,
                meta: { source: 'deposit_capture' },
            });
        }
    }
    if (toCapture > 0 || lateCalc.totalCharges > 0) {
        await audit('booking.late_charges_applied', doc, null, {
            lateFee,
            damageFee,
            totalCharges: lateCalc.totalCharges,
            captured: toCapture,
            remainingPayable: lateCalc.remainingPayable,
            refundableAmount: lateCalc.refundableAmount,
        }, performer);
    }

    // Persist deposit adjustment snapshot on securityDepositPayment
    if (doc.securityDepositPayment) {
        const original = Number(
            doc.securityDepositPayment.depositAmount
                || doc.money?.securityDeposit
                || depositForBilling
                || 0,
        );
        doc.securityDepositPayment.originalAmount = original;
        doc.securityDepositPayment.deductedAmount = toCapture;
        doc.securityDepositPayment.refundableAmount = lateCalc.refundableAmount;
        appendDepositPaymentHistory(doc, {
            status: doc.securityDepositPayment.depositStatus || DEPOSIT_STATUS.PAID,
            method: doc.securityDepositPayment.depositPaymentMethod || '',
            note: `Deposit adjusted for late/damage: deducted ₹${toCapture}, refundable ₹${lateCalc.refundableAmount}`,
            performedBy: performer,
        });
    }

    doc.actualEndAt = actualReturnAt;
    doc.rentalDurationHours = Math.ceil(
        (actualReturnAt.getTime() - new Date(doc.actualStartAt || doc.startAt).getTime()) / (60 * 60 * 1000),
    );
    doc.reportSnapshot = buildReportSnapshot(doc, { settledAt: actualReturnAt });
    await doc.save();

    doc = await transitionBooking(doc._id, BIKE_BOOKING_STATUS.INSPECTION, BIKE_BOOKING_STATUS.COMPLETED, {
        note: lateCalc.remainingPayable > 0
            ? `Inspection completed — ₹${lateCalc.remainingPayable} remaining payable`
            : 'Inspection completed',
        performer,
        extraSet: { actualEndAt: actualReturnAt },
    });
    await releaseBike(doc.bikeId);
    await audit('booking.inspection_completed', doc, null, {
        lateFee,
        damageFee,
        remainingPayable: lateCalc.remainingPayable,
    }, performer);
    await notify.notifyInspectionCompleted(doc, { lateFee, damageFee });

    // Credit the vendor's wallet for their share of a completed booking (non-blocking).
    try {
        await creditVendorEarningForBooking(doc);
    } catch {
        /* non-blocking */
    }
    // Persist the auditable settlement ledger record for this booking (non-blocking).
    try {
        await generateSettlement(doc);
    } catch {
        /* non-blocking */
    }

    // Schedule deposit refund to central wallet (within configured hours).
    // Do not credit immediately — cron / admin release handles the wallet credit.
    if (lateCalc.remainingPayable <= 0) {
        const refundable = getRefundableDepositAmount(doc);
        const schedule = buildDepositRefundSchedule(doc, {
            amount: refundable,
            settings,
            now: actualReturnAt,
        });
        doc.depositRefund = schedule;
        doc.markModified('depositRefund');
        if (doc.lateReturn) {
            doc.lateReturn.paymentStatus = 'settled';
            doc.lateReturn.remainingAmount = 0;
        }
        doc.reportSnapshot = buildReportSnapshot(doc, { settledAt: actualReturnAt });
        await doc.save();

        if (refundable > 0) {
            doc = await transitionBooking(
                doc._id,
                BIKE_BOOKING_STATUS.COMPLETED,
                BIKE_BOOKING_STATUS.REFUND_PROCESSING,
                {
                    note: schedule.note,
                    performer,
                    extraSet: {
                        depositRefund: schedule,
                        reportSnapshot: buildReportSnapshot(doc, { settledAt: actualReturnAt }),
                    },
                },
            );
            await audit('booking.deposit_refund_scheduled', doc, null, {
                amount: schedule.amount,
                eligibleAt: schedule.eligibleAt,
            }, performer);

            // Immediate release when delay is 0 hours.
            if (new Date(schedule.eligibleAt).getTime() <= Date.now()) {
                doc = await releaseScheduledDepositRefund(doc._id, {
                    force: true,
                    note: 'Immediate deposit refund (0h delay)',
                    reqUser,
                });
            }
        } else {
            doc = await transitionBooking(
                doc._id,
                BIKE_BOOKING_STATUS.COMPLETED,
                BIKE_BOOKING_STATUS.DEPOSIT_REFUNDED,
                {
                    note: 'Inspection completed — no refundable deposit',
                    performer,
                    extraSet: {
                        depositRefund: schedule,
                        reportSnapshot: buildReportSnapshot(doc, { settledAt: actualReturnAt }),
                    },
                },
            );
        }
    } else {
        // Hold remaining refundable deposit until remaining charges are paid
        const refundableHeld = getRefundableDepositAmount(doc);
        doc.depositRefund = {
            status: 'processing',
            amount: refundableHeld,
            scheduledAt: actualReturnAt,
            eligibleAt: null,
            processedAt: null,
            walletReference: '',
            releasedBy: null,
            note: 'Refund held until remaining late/damage balance is paid',
        };
        doc.markModified('depositRefund');
        doc.reportSnapshot = buildReportSnapshot(doc, { settledAt: actualReturnAt });
        await doc.save();
        await audit('booking.late_balance_pending', doc, null, {
            remainingPayable: lateCalc.remainingPayable,
            refundableHeld,
        }, performer);
    }

    const mapped = mapBooking((await BikeBooking.findById(doc._id).populate('bikeId').lean()));
    mapped.returnInspection = inspectionService.mapInspection(returnInspectionDoc.toObject());
    mapped.pickupInspection = pickupInspection;
    mapped.lateBilling = lateCalc;
    return mapped;
}

/**
 * Release a scheduled security deposit refund to the central wallet.
 */
export async function releaseScheduledDepositRefund(bookingId, {
    force = false,
    note = '',
    finalRefundAmount = null,
    reqUser = null,
} = {}) {
    const result = await processSecurityDepositRefund({
        bookingId,
        finalRefundAmount,
        force: Boolean(force),
        note,
        reqUser,
    });

    let doc = result.booking;
    if (doc.status === BIKE_BOOKING_STATUS.DEPOSIT_REFUNDED) {
        return mapBooking((await BikeBooking.findById(doc._id).populate('bikeId').lean()));
    }

    if ([BIKE_BOOKING_STATUS.COMPLETED, BIKE_BOOKING_STATUS.REFUND_PROCESSING].includes(doc.status)) {
        doc = await transitionBooking(
            doc._id,
            doc.status,
            BIKE_BOOKING_STATUS.DEPOSIT_REFUNDED,
            {
                note: note || `Deposit refunded ₹${result.refunded}`,
                performer: result.performer,
            },
        );
        if (!result.alreadyProcessed && Number(result.refunded) > 0) {
            await notify.notifyDepositRefunded(doc, result.refunded);
        }
    }

    return mapBooking((await BikeBooking.findById(doc._id).populate('bikeId').lean()));
}

/**
 * Preview late return charges without mutating the booking (admin UI).
 */
export async function previewLateReturnCharges(bookingId, {
    actualReturnAt = null,
    damageFee = 0,
    lateFeeOverride = null,
} = {}) {
    const booking = await BikeBooking.findOne({ _id: bookingId, ...baseFilter });
    if (!booking) throw new NotFoundError('Booking not found');
    const { settings } = await getEffectiveSettings({ bikeId: booking.bikeId, vendorId: booking.vendorId });
    const actual = actualReturnAt ? new Date(actualReturnAt) : new Date();
    if (Number.isNaN(actual.getTime())) throw new ValidationError('Invalid actual return time');

    const depositForBilling = Number(
        booking.money?.depositHeld
            || booking.securityDepositPayment?.depositAmount
            || booking.money?.securityDeposit
            || 0,
    );

    let calc = calculateLateReturnCharges({
        scheduledReturnTime: booking.endAt,
        actualReturnTime: actual,
        securityDeposit: depositForBilling,
        hourlyCharge: settings.lateFeePerHour,
        gracePeriodMinutes: settings.lateReturnGraceMinutes,
        maxLateCharge: settings.lateReturnMaxCharge,
        damageFee: Math.max(0, Number(damageFee) || 0),
    });

    const hasOverride = lateFeeOverride !== undefined
        && lateFeeOverride !== null
        && lateFeeOverride !== ''
        && Number.isFinite(Number(lateFeeOverride));
    if (hasOverride) {
        const overrideLate = Math.max(0, Number(lateFeeOverride));
        const damage = Math.max(0, Number(damageFee) || 0);
        const forcedTotal = Math.round((overrideLate + damage) * 100) / 100;
        const depositDeduction = Math.min(depositForBilling, forcedTotal);
        calc = {
            ...calc,
            totalLateCharge: overrideLate,
            damageFee: damage,
            totalCharges: forcedTotal,
            depositDeduction,
            remainingPayable: Math.max(0, Math.round((forcedTotal - depositDeduction) * 100) / 100),
            refundableAmount: Math.max(0, Math.round((depositForBilling - depositDeduction) * 100) / 100),
            paymentStatus: forcedTotal - depositDeduction > 0 ? 'pending' : 'settled',
        };
    }

    return {
        bookingId: String(booking._id),
        bookingNumber: booking.bookingNumber,
        settings: {
            hourlyCharge: settings.lateFeePerHour,
            gracePeriodMinutes: settings.lateReturnGraceMinutes,
            maxLateCharge: settings.lateReturnMaxCharge,
        },
        ...calc,
    };
}

/**
 * Admin collects remaining late/damage balance (cash/upi/wallet already paid offline).
 * Then refunds any held refundable deposit and marks deposit_refunded.
 */
export async function collectRemainingLateBalance(bookingId, {
    method = 'cash',
    transactionId = '',
    note = '',
} = {}, reqUser = null) {
    const booking = await BikeBooking.findOne({ _id: bookingId, ...baseFilter });
    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.status !== BIKE_BOOKING_STATUS.COMPLETED) {
        throw new ValidationError('Remaining balance can only be collected on completed returns');
    }
    const remaining = Number(booking.lateReturn?.remainingAmount || 0);
    if (remaining <= 0 || booking.lateReturn?.paymentStatus === 'paid') {
        return mapBooking(booking.toObject ? booking.toObject() : booking);
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    const payMethod = String(method || 'cash').toLowerCase();
    const txn = String(transactionId || '').trim() || `late-balance:${booking._id}:${Date.now()}`;

    booking.lateReturn.remainingAmount = 0;
    booking.lateReturn.paymentStatus = 'paid';
    booking.lateReturn.remainingPaidAt = new Date();
    booking.lateReturn.remainingPaymentMethod = payMethod;
    booking.lateReturn.remainingTransactionId = txn;
    booking.lateReturn.billingHistory = booking.lateReturn.billingHistory || [];
    booking.lateReturn.billingHistory.push({
        at: new Date(),
        note: note || `Remaining late balance collected (${payMethod})`,
        totalLateCharge: booking.lateReturn.chargeAmount,
        damageFee: booking.lateReturn.damageFee,
        depositDeduction: booking.lateReturn.deductedFromDeposit,
        remainingPayable: 0,
        refundableAmount: booking.lateReturn.refundableAmount,
        performedBy: performer,
    });
    booking.money.totalPaid = Number(booking.money.totalPaid || 0) + remaining;
    booking.markModified('lateReturn');
    booking.markModified('money');
    await booking.save();

    await audit('booking.late_balance_collected', booking, null, {
        amount: remaining,
        method: payMethod,
        transactionId: txn,
    }, performer);

    {
        const ledgerMode = ['cash', 'upi', 'card', 'wallet', 'razorpay'].includes(payMethod) ? payMethod : 'system';
        const chargeTotal = Number(booking.lateReturn?.chargeAmount || 0) + Number(booking.lateReturn?.damageFee || 0);
        const lateShare = chargeTotal > 0
            ? Math.round(remaining * (Number(booking.lateReturn?.chargeAmount || 0) / chargeTotal) * 100) / 100
            : remaining;
        const damageShare = Math.round((remaining - lateShare) * 100) / 100;
        if (lateShare > 0) {
            await recordTransaction({
                bookingId: booking._id,
                userId: booking.userId,
                vendorId: booking.vendorId,
                amount: lateShare,
                paymentMode: ledgerMode,
                transactionType: 'late_charge',
                referenceId: txn,
                performedBy: performer,
                meta: { source: 'remaining_balance_collection' },
            });
        }
        if (damageShare > 0) {
            await recordTransaction({
                bookingId: booking._id,
                userId: booking.userId,
                vendorId: booking.vendorId,
                amount: damageShare,
                paymentMode: ledgerMode,
                transactionType: 'damage_deduction',
                referenceId: txn,
                performedBy: performer,
                meta: { source: 'remaining_balance_collection' },
            });
        }
    }

    // The settlement for this booking (if any) was generated at COMPLETED time, before this
    // late balance existed — never edit that original record, record the delta instead. Same
    // commission rate already locked on the settlement applies to this late revenue too.
    try {
        const settlement = await getSettlementByBookingId(booking._id);
        if (settlement) {
            const commissionRate = Number(settlement.commissionRate || 0);
            const vendorShare = Math.round(remaining * (1 - commissionRate / 100) * 100) / 100;
            await recordSettlementAdjustment(settlement.id, {
                amount: vendorShare,
                type: 'late_charge',
                reason: `Late balance of ₹${remaining} collected after settlement (${payMethod}) — vendor share after ${commissionRate}% commission`,
            }, reqUser);
        }
    } catch {
        /* non-blocking — the payment itself already succeeded above */
    }

    const { settings } = await getEffectiveSettings({ bikeId: booking.bikeId, vendorId: booking.vendorId });
    const refundable = getRefundableDepositAmount(booking);
    const existingEligible = booking.depositRefund?.eligibleAt
        ? new Date(booking.depositRefund.eligibleAt)
        : null;
    const baseTime = booking.actualEndAt || booking.depositRefund?.scheduledAt || new Date();
    const schedule = buildDepositRefundSchedule(booking, {
        amount: refundable,
        settings,
        now: baseTime,
    });
    // Keep original eligible window from inspection when present.
    if (existingEligible && !Number.isNaN(existingEligible.getTime())) {
        schedule.eligibleAt = existingEligible;
        schedule.scheduledAt = booking.depositRefund?.scheduledAt || schedule.scheduledAt;
    }
    booking.depositRefund = schedule;
    booking.markModified('depositRefund');
    await booking.save();

    let doc = booking;
    if (refundable > 0) {
        doc = await transitionBooking(
            booking._id,
            BIKE_BOOKING_STATUS.COMPLETED,
            BIKE_BOOKING_STATUS.REFUND_PROCESSING,
            {
                note: 'Late balance paid — deposit refund scheduled',
                performer,
                extraSet: { depositRefund: schedule },
            },
        );
        if (!schedule.eligibleAt || new Date(schedule.eligibleAt).getTime() <= Date.now()) {
            return releaseScheduledDepositRefund(doc._id, {
                force: true,
                note: 'Deposit refund after late balance settled',
                reqUser,
            });
        }
    } else {
        doc = await transitionBooking(
            booking._id,
            BIKE_BOOKING_STATUS.COMPLETED,
            BIKE_BOOKING_STATUS.DEPOSIT_REFUNDED,
            {
                note: 'Late balance paid — no refundable deposit',
                performer,
                extraSet: { depositRefund: schedule },
            },
        );
    }

    return mapBooking((await BikeBooking.findById(doc._id).populate('bikeId').lean()));
}

/**
 * User pays remaining late balance from wallet, then deposit refund proceeds.
 */
export async function payRemainingLateBalanceWithWallet(userId, bookingId) {
    const booking = await loadOwnedBooking(userId, bookingId);
    if (booking.status !== BIKE_BOOKING_STATUS.COMPLETED) {
        throw new ValidationError('No remaining late balance due on this booking');
    }
    const remaining = Number(booking.lateReturn?.remainingAmount || 0);
    if (remaining <= 0) {
        return mapBooking(booking.toObject());
    }

    const metaOrderId = `bike-rent-late:${booking._id}`;
    await deductWalletBalance(
        userId,
        remaining,
        `Bike Rent late charges ${booking.bookingNumber}`,
        { orderId: metaOrderId, bookingId: String(booking._id), source: 'bike_rent_late' },
    );

    return collectRemainingLateBalance(bookingId, {
        method: 'wallet',
        transactionId: metaOrderId,
        note: 'Remaining late balance paid via wallet',
    }, { userId, role: 'USER' });
}

/**
 * Create Razorpay order for remaining late balance.
 */
export async function createRemainingLateRazorpayOrder(userId, bookingId) {
    const booking = await loadOwnedBooking(userId, bookingId);
    if (booking.status !== BIKE_BOOKING_STATUS.COMPLETED) {
        throw new ValidationError('No remaining late balance due on this booking');
    }
    const remaining = Number(booking.lateReturn?.remainingAmount || 0);
    if (remaining <= 0) throw new ValidationError('No remaining amount to pay');
    if (!isRazorpayConfigured()) throw new ValidationError('Razorpay is not configured');

    const amountPaise = Math.round(remaining * 100);
    if (amountPaise < 100) throw new ValidationError('Invalid payable amount');

    const rpOrder = await createRazorpayOrder(
        amountPaise,
        'INR',
        `LATE${booking.bookingNumber}`.slice(0, 40),
        { bookingId: String(booking._id), type: 'bike_rent_late_balance' },
    );

    return {
        booking: mapBooking(booking.toObject()),
        amount: remaining,
        razorpay: {
            key: getRazorpayKeyId(),
            orderId: rpOrder.id,
            amount: amountPaise,
            currency: 'INR',
            name: 'Bike Rent',
            description: `Late charges ${booking.bookingNumber}`,
        },
    };
}

export async function verifyRemainingLateRazorpayPayment(userId, bookingId, payload = {}) {
    const booking = await loadOwnedBooking(userId, bookingId);
    const remaining = Number(booking.lateReturn?.remainingAmount || 0);
    if (remaining <= 0) return mapBooking(booking.toObject());

    const orderId = String(payload.razorpayOrderId || '').trim();
    const paymentId = String(payload.razorpayPaymentId || '').trim();
    const signature = String(payload.razorpaySignature || '').trim();
    if (!orderId || !paymentId || !signature) {
        throw new ValidationError('Razorpay payment fields are required');
    }
    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
        throw new ValidationError('Payment verification failed');
    }

    return collectRemainingLateBalance(bookingId, {
        method: 'razorpay',
        transactionId: paymentId,
        note: 'Remaining late balance paid via Razorpay',
    }, { userId, role: 'USER' });
}

/**
 * Expire unpaid / unapproved booking: release inventory, clear hold, audit, notify.
 */
export async function expireBooking(bookingId, note = 'Unpaid booking expired') {
    const booking = await BikeBooking.findOne({ _id: bookingId, ...baseFilter });
    if (!booking) return null;
    if (![
        BIKE_BOOKING_STATUS.REQUESTED,
        BIKE_BOOKING_STATUS.PENDING_APPROVAL,
        BIKE_BOOKING_STATUS.PAYMENT_PENDING,
    ].includes(booking.status)) {
        return mapBooking(booking.toObject());
    }
    const from = booking.status;
    const performer = { role: 'SYSTEM', actionAt: new Date() };
    const doc = await transitionBooking(booking._id, from, BIKE_BOOKING_STATUS.EXPIRED, {
        note,
        performer,
        extraSet: {
            expiresAt: booking.expiresAt || new Date(),
            reportSnapshot: buildReportSnapshot(booking),
        },
    });
    await releaseBike(doc.bikeId);
    await syncBikeInventoryWithBooking(doc);
    await audit('booking.expired', doc, { status: from }, {
        status: 'expired',
        bikeReleased: true,
    }, performer, { note });
    await notify.notifyBookingExpired(doc);
    return mapBooking(doc.toObject());
}

/**
 * Admin approves a booking request → user can pay (payment_pending).
 */
export async function adminApproveBooking(bookingId, reqUser = null, { note = '' } = {}) {
    const booking = await BikeBooking.findOne({ _id: bookingId, ...baseFilter });
    if (!booking) throw new NotFoundError('Booking not found');
    if (![
        BIKE_BOOKING_STATUS.PENDING_APPROVAL,
        BIKE_BOOKING_STATUS.REQUESTED,
    ].includes(booking.status)) {
        throw new ValidationError('Only pending booking requests can be approved');
    }

    const settings = await getSettings();
    const ttlMin = Number(settings.unpaidBookingTtlMinutes || 15);
    const performer = await resolveActionPerformerSnapshot(reqUser);
    const from = booking.status;
    const paymentExpiresAt = new Date(Date.now() + ttlMin * 60 * 1000);

    const doc = await transitionBooking(
        booking._id,
        from,
        BIKE_BOOKING_STATUS.PAYMENT_PENDING,
        {
            note: note || 'Approved by admin — awaiting payment',
            performer,
            extraSet: {
                approvedAt: new Date(),
                expiresAt: paymentExpiresAt,
            },
        },
    );
    await audit(
        'booking.approved',
        doc,
        { status: from },
        { status: 'payment_pending' },
        performer,
    );
    await notify.notifyBookingApproved(doc);
    return mapBooking((await BikeBooking.findById(doc._id).populate('bikeId').lean()));
}

/**
 * Admin rejects a booking request and releases the soft-hold.
 */
export async function adminRejectBooking(bookingId, reqUser = null, { reason = '' } = {}) {
    const booking = await BikeBooking.findOne({ _id: bookingId, ...baseFilter });
    if (!booking) throw new NotFoundError('Booking not found');
    if (![
        BIKE_BOOKING_STATUS.PENDING_APPROVAL,
        BIKE_BOOKING_STATUS.REQUESTED,
    ].includes(booking.status)) {
        throw new ValidationError('Only pending booking requests can be rejected');
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    const from = booking.status;
    const rejectionReason = String(reason || 'Rejected by admin').trim().slice(0, 500);

    const doc = await transitionBooking(
        booking._id,
        from,
        BIKE_BOOKING_STATUS.REJECTED,
        {
            note: rejectionReason,
            performer,
            extraSet: {
                rejectedAt: new Date(),
                rejectionReason,
                reportSnapshot: buildReportSnapshot(booking),
            },
        },
    );
    await releaseBike(doc.bikeId);
    await audit(
        'booking.rejected',
        doc,
        { status: from },
        { status: 'rejected', reason: rejectionReason },
        performer,
    );
    await notify.notifyBookingRejected(doc, rejectionReason);
    return mapBooking((await BikeBooking.findById(doc._id).populate('bikeId').lean()));
}

export async function markNoShow(bookingId, note = 'Pickup window missed', reqUser = null) {
    const booking = await BikeBooking.findOne({ _id: bookingId, ...baseFilter });
    if (!booking) return null;

    // Idempotent: already processed
    if (booking.status === BIKE_BOOKING_STATUS.NO_SHOW) {
        return mapBooking(booking.toObject ? booking.toObject() : booking);
    }
    if (booking.status !== BIKE_BOOKING_STATUS.RESERVED) {
        throw new ValidationError('Only reserved bookings can be marked as no-show');
    }
    if (booking.noShow?.refundProcessed) {
        return mapBooking(booking.toObject ? booking.toObject() : booking);
    }

    const { settings } = await getEffectiveSettings({ bikeId: booking.bikeId, vendorId: booking.vendorId });
    if (settings.noShowPolicyEnabled === false && !reqUser) {
        // Auto-sweep respects this booking's effective (bike > vendor > platform) policy;
        // admin manual mark still allowed when reqUser present regardless of the toggle.
        return mapBooking(booking.toObject ? booking.toObject() : booking);
    }

    const performer = reqUser
        ? await resolveActionPerformerSnapshot(reqUser)
        : { role: 'SYSTEM', actionAt: new Date() };

    const calc = calculateNoShowRefund({
        bookingId: booking._id,
        serviceType: 'BIKE_RENTAL',
        now: new Date(),
        pickupTime: booking.startAt,
        graceMinutes: settings.noShowGraceMinutes ?? settings.pickupWindowMinutes,
        policyEnabled: settings.noShowPolicyEnabled !== false,
        refundRule: settings.noShowRefundRule,
        refundMode: settings.noShowRefundMode,
        refundPercent: settings.noShowRefundPercent,
        refundFixed: settings.noShowRefundFixed,
        penaltyAmount: settings.noShowPenaltyAmount,
        securityDeposit: Number(
            booking.securityDepositPayment?.depositAmount
                || booking.money?.securityDeposit
                || 0,
        ),
        depositHeld: booking.money?.depositHeld || 0,
        rentalFee: booking.money?.rentalFee,
        totalPaid: booking.money?.totalPaid,
    });

    // Manual admin mark can force no-show even if grace not elapsed; auto job only calls when eligible.
    const walletRef = `no-show-refund:${booking._id}`;
    const captureRef = `no-show-capture:${booking._id}`;

    if (calc.depositCaptured > 0) {
        await captureDeposit(booking, {
            amount: calc.depositCaptured,
            reason: `No-show deduction / non-refundable deposit (${calc.refundRule})`,
            reference: captureRef,
            performedBy: performer,
        });
        await recordTransaction({
            bookingId: booking._id,
            userId: booking.userId,
            vendorId: booking.vendorId,
            amount: calc.depositCaptured,
            paymentMode: 'system',
            transactionType: 'damage_deduction',
            referenceId: captureRef,
            performedBy: performer,
            meta: { reason: 'no_show_deposit_forfeited', refundRule: calc.refundRule },
        });
    }

    let walletCredit = 0;
    if (calc.depositRefund > 0 && Number(booking.money?.depositHeld || 0) > 0) {
        const refundResult = await refundDepositToWallet(booking, {
            amount: calc.depositRefund,
            reason: 'No Show Refund',
            reference: walletRef,
            performedBy: performer,
        });
        walletCredit = Number(refundResult?.refunded || calc.depositRefund);
    } else if (calc.depositRefund > 0 && Number(booking.money?.depositHeld || 0) <= 0) {
        // Edge: deposit recorded but not held — credit wallet directly (idempotent).
        await addWalletCredit({
            userId: booking.userId,
            amount: calc.depositRefund,
            source: WALLET_SOURCES.BIKE_RENTAL,
            reason: 'No Show Refund',
            referenceId: String(booking._id),
            idempotencyKey: walletRef,
            metadata: {
                bookingId: String(booking._id),
                bookingNumber: booking.bookingNumber,
                kind: 'no_show_deposit_refund',
            },
        });
        walletCredit = calc.depositRefund;
    }
    if (walletCredit > 0) {
        await recordTransaction({
            bookingId: booking._id,
            userId: booking.userId,
            vendorId: booking.vendorId,
            amount: walletCredit,
            paymentMode: 'wallet',
            transactionType: 'refund',
            referenceId: walletRef,
            performedBy: performer,
            meta: { reason: 'no_show_deposit_refund' },
        });
    }

    if (booking.securityDepositPayment && Number(booking.securityDepositPayment.depositAmount || 0) > 0) {
        booking.securityDepositPayment.originalAmount = Number(
            booking.securityDepositPayment.depositAmount || calc.securityDeposit,
        );
        booking.securityDepositPayment.deductedAmount = calc.depositCaptured;
        booking.securityDepositPayment.refundableAmount = 0;
        if (walletCredit > 0 || calc.depositCaptured > 0) {
            booking.securityDepositPayment.depositStatus = walletCredit > 0
                ? DEPOSIT_STATUS.REFUNDED
                : (booking.securityDepositPayment.depositStatus || DEPOSIT_STATUS.PAID);
            appendDepositPaymentHistory(booking, {
                status: booking.securityDepositPayment.depositStatus,
                method: booking.securityDepositPayment.depositPaymentMethod || '',
                transactionId: walletRef,
                note: `No-show settlement: refunded ₹${walletCredit}, retained ₹${calc.depositCaptured}`,
                performedBy: performer,
            });
        }
    }

    booking.noShow = {
        policyEnabled: calc.policyEnabled,
        graceMinutes: calc.graceMinutes,
        graceEndsAt: new Date(calc.graceEndsAt),
        refundRule: calc.refundRule,
        refundMode: calc.refundMode,
        penaltyAmount: calc.penaltyAmount,
        deductionAmount: calc.deductionAmount,
        depositAmount: calc.securityDeposit,
        depositRefund: walletCredit,
        depositCaptured: calc.depositCaptured,
        walletCreditAmount: walletCredit,
        walletReference: walletRef,
        processedAt: new Date(),
        refundProcessed: true,
    };
    booking.markModified('noShow');
    booking.markModified('securityDepositPayment');
    booking.reportSnapshot = buildReportSnapshot(booking);
    await booking.save();

    const doc = await transitionBooking(
        booking._id,
        BIKE_BOOKING_STATUS.RESERVED,
        BIKE_BOOKING_STATUS.NO_SHOW,
        {
            note: note || 'Pickup window missed',
            performer,
            extraSet: {
                noShow: booking.noShow,
                reportSnapshot: buildReportSnapshot(booking),
            },
        },
    );
    await releaseBike(doc.bikeId);
    await audit('booking.no_show', doc, { status: 'reserved' }, {
        status: 'no_show',
        depositRefund: walletCredit,
        depositCaptured: calc.depositCaptured,
        refundRule: calc.refundRule,
        walletReference: walletRef,
    }, performer);
    await notify.notifyNoShow(doc);

    const mapped = mapBooking((await BikeBooking.findById(doc._id).populate('bikeId').lean()));
    mapped.noShowPreview = calc;
    return mapped;
}

/**
 * Admin/vendor restores a no-show booking back to awaiting-pickup ("Override No-Show").
 * Requires a reason, re-checks the bike hasn't since been rebooked for the same window,
 * grants a fresh pickup window from now, and re-arms deposit collection if the deposit had
 * already been refunded during the no-show settlement (that wallet credit is left untouched —
 * hub staff simply collect the deposit again at handover, same as any pending-collection flow).
 */
export async function overrideNoShow(bookingId, { reason = '' } = {}, reqUser = null) {
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) {
        throw new ValidationError('A reason is required to override a no-show booking');
    }

    const booking = await BikeBooking.findOne({ _id: bookingId, ...baseFilter });
    if (!booking) throw new NotFoundError('Booking not found');
    if (booking.status !== BIKE_BOOKING_STATUS.NO_SHOW) {
        throw new ValidationError('Only no-show bookings can be overridden');
    }

    // The bike may have been rebooked by someone else for this exact window since it went
    // no-show and was released back into inventory — never silently create a double-booking.
    const conflict = await assertWindowAvailable({
        bikeId: booking.bikeId,
        startAt: booking.startAt,
        endAt: booking.endAt,
        excludeBookingId: booking._id,
        includeAlternates: false,
        throwOnConflict: false,
    });
    if (!conflict.available) {
        throw new ValidationError(
            'This bike has since been rebooked for an overlapping time and cannot be restored. Reassign the booking to a different bike instead.',
            'BIKE_REBOOKED',
        );
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    const { settings } = await getEffectiveSettings({ bikeId: booking.bikeId, vendorId: booking.vendorId });
    const freshWindowMinutes = Math.max(5, Number(settings.pickupWindowMinutes ?? 30) || 30);
    const newPickupWindowEndsAt = new Date(Date.now() + freshWindowMinutes * 60 * 1000);

    booking.noShow = {
        ...(booking.noShow?.toObject?.() || booking.noShow || {}),
        overridden: true,
        overriddenAt: new Date(),
        overriddenBy: performer,
        overrideReason: trimmedReason,
    };
    booking.markModified('noShow');

    // Deposit money already refunded to the rider's wallet during no-show settlement can't be
    // silently re-deducted — re-arm collection so hub staff take it again at handover instead.
    if (booking.securityDepositPayment?.depositStatus === DEPOSIT_STATUS.REFUNDED) {
        booking.securityDepositPayment.depositStatus = DEPOSIT_STATUS.PENDING_COLLECTION;
        booking.securityDepositPayment.refundableAmount = 0;
        appendDepositPaymentHistory(booking, {
            status: DEPOSIT_STATUS.PENDING_COLLECTION,
            method: booking.securityDepositPayment.depositPaymentMethod || '',
            note: `No-show overridden — deposit must be recollected at handover (${trimmedReason})`,
            performedBy: performer,
        });
        booking.markModified('securityDepositPayment');
    }

    await booking.save();

    const doc = await transitionBooking(
        booking._id,
        BIKE_BOOKING_STATUS.NO_SHOW,
        BIKE_BOOKING_STATUS.RESERVED,
        {
            note: `No-show overridden: ${trimmedReason}`,
            performer,
            extraSet: {
                pickupWindowEndsAt: newPickupWindowEndsAt,
                noShow: booking.noShow,
                securityDepositPayment: booking.securityDepositPayment,
            },
        },
    );
    await audit('booking.no_show_overridden', doc, { status: 'no_show' }, {
        status: 'reserved',
        reason: trimmedReason,
        newPickupWindowEndsAt,
    }, performer);
    await notify.notifyNoShowOverridden(doc, trimmedReason);

    return mapBooking((await BikeBooking.findById(doc._id).populate('bikeId').lean()));
}

/** Sweep unpaid expiries, no-shows, and emit reminder hooks near windows. */
export async function runBookingMaintenanceSweep() {
    const now = new Date();
    const unpaid = await BikeBooking.find({
        ...baseFilter,
        status: {
            $in: [
                BIKE_BOOKING_STATUS.PAYMENT_PENDING,
                BIKE_BOOKING_STATUS.PENDING_APPROVAL,
                BIKE_BOOKING_STATUS.REQUESTED,
            ],
        },
        expiresAt: { $lte: now },
    }).select('_id').limit(100).lean();

    for (const row of unpaid) {
        try { await expireBooking(row._id); } catch { /* continue */ }
    }

    // Don't gate the sweep on the platform-wide default alone — a vendor may have opted
    // into no-show automation even while the platform default is off. `markNoShow` still
    // self-gates per booking using that booking's own effective (bike > vendor > platform)
    // settings, so it's safe (and necessary for the hierarchy) to always attempt the sweep.
    let noShowCount = 0;
    {
        const noShows = await BikeBooking.find({
            ...baseFilter,
            status: BIKE_BOOKING_STATUS.RESERVED,
            pickupWindowEndsAt: { $lte: now },
            'noShow.refundProcessed': { $ne: true },
        }).select('_id').limit(100).lean();

        for (const row of noShows) {
            try {
                await markNoShow(row._id);
                noShowCount += 1;
            } catch { /* continue */ }
        }
    }

    let depositRefunds = 0;
    try {
        const due = await listDueDepositRefundBookingIds({ limit: 50 });
        for (const row of due) {
            try {
                await releaseScheduledDepositRefund(row._id, {
                    force: true,
                    note: 'Automatic deposit refund (scheduled)',
                });
                depositRefunds += 1;
            } catch { /* continue */ }
        }
    } catch { /* continue */ }

    // Reminder hooks (idempotent-ish: fire when within 30 minutes of window)
    const pickupSoon = await BikeBooking.find({
        ...baseFilter,
        status: BIKE_BOOKING_STATUS.RESERVED,
        startAt: {
            $gte: now,
            $lte: new Date(now.getTime() + 30 * 60 * 1000),
        },
    }).limit(50).lean();
    for (const row of pickupSoon) {
        try { await notify.notifyPickupReminder(row); } catch { /* ignore */ }
    }

    const returnSoon = await BikeBooking.find({
        ...baseFilter,
        status: { $in: [BIKE_BOOKING_STATUS.ACTIVE, BIKE_BOOKING_STATUS.RENTAL_STARTED] },
        endAt: {
            $gte: now,
            $lte: new Date(now.getTime() + 30 * 60 * 1000),
        },
    }).limit(50).lean();
    for (const row of returnSoon) {
        try { await notify.notifyReturnReminder(row); } catch { /* ignore */ }
    }

    return {
        expired: unpaid.length,
        noShows: noShowCount,
        depositRefunds,
        pickupReminders: pickupSoon.length,
        returnReminders: returnSoon.length,
    };
}
