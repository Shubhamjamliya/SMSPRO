import { BikeVendorWallet } from '../models/bikeVendorWallet.model.js';
import { BikeVendorWithdrawal } from '../models/bikeVendorWithdrawal.model.js';
import { BikeVendor } from '../models/bikeVendor.model.js';
import { BikeBooking } from '../models/bikeBooking.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { getSettings } from './settings.service.js';
import { recordTransaction } from './financeTransaction.service.js';
import { parseListQuery, toBikeRentPagination, buildDateRangeFilter } from '../utils/pagination.util.js';

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

async function getOrCreateWallet(vendorId) {
    let wallet = await BikeVendorWallet.findOne({ vendorId });
    if (!wallet) {
        wallet = await BikeVendorWallet.create({ vendorId });
    }
    return wallet;
}

export async function getVendorWalletSummary(vendorId) {
    const wallet = await getOrCreateWallet(vendorId);
    return {
        balance: roundMoney(wallet.balance),
        lockedAmount: roundMoney(wallet.lockedAmount),
        availableBalance: roundMoney(Math.max(0, wallet.balance - wallet.lockedAmount)),
        totalEarnings: roundMoney(wallet.totalEarnings),
        totalWithdrawn: roundMoney(wallet.totalWithdrawn),
        updatedAt: wallet.updatedAt,
    };
}

/**
 * Credits a vendor's wallet for a completed booking. Idempotent — a booking that
 * already has money.vendorEarning recorded will not be credited a second time,
 * so this is safe to call from any completion/settlement path without dedupe logic upstream.
 */
export async function creditVendorEarningForBooking(bookingDoc) {
    if (!bookingDoc || bookingDoc.ownerType !== 'vendor' || !bookingDoc.vendorId) return;
    if (Number(bookingDoc.money?.vendorEarning) > 0) return; // already credited

    const totalPaid = Number(bookingDoc.money?.totalPaid || 0);
    if (totalPaid <= 0) return;

    const vendor = await BikeVendor.findById(bookingDoc.vendorId).select('commissionRate').lean();
    const settings = await getSettings();
    const commissionRate = Number.isFinite(Number(vendor?.commissionRate)) && vendor?.commissionRate !== null
        ? Number(vendor.commissionRate)
        : Number(settings.defaultVendorCommissionPercent ?? 20);

    // Vendor-authored coupons are billed fully to that vendor: the platform's commission is
    // computed on the pre-discount amount (unaffected by the vendor's own promo), and the
    // vendor's share absorbs the entire discount on top of the normal commission cut.
    const couponCostBorneByVendor = bookingDoc.couponApplied?.ownerType === 'vendor'
        ? Number(bookingDoc.couponApplied?.discountAmount || 0)
        : 0;
    const grossAmount = totalPaid + couponCostBorneByVendor;

    const commissionAmount = roundMoney((grossAmount * commissionRate) / 100);
    const vendorEarning = roundMoney(Math.max(0, totalPaid - commissionAmount));

    bookingDoc.money.commissionRate = commissionRate;
    bookingDoc.money.commissionAmount = commissionAmount;
    bookingDoc.money.vendorEarning = vendorEarning;
    bookingDoc.money.couponCostBorneByVendor = couponCostBorneByVendor;
    bookingDoc.markModified('money');
    await bookingDoc.save();

    const wallet = await getOrCreateWallet(bookingDoc.vendorId);
    wallet.balance = roundMoney(wallet.balance + vendorEarning);
    wallet.totalEarnings = roundMoney(wallet.totalEarnings + vendorEarning);
    await wallet.save();

    const referenceId = `vendor-earning:${bookingDoc._id}`;
    if (vendorEarning > 0) {
        await recordTransaction({
            bookingId: bookingDoc._id,
            userId: bookingDoc.userId,
            vendorId: bookingDoc.vendorId,
            amount: vendorEarning,
            paymentMode: 'system',
            transactionType: 'vendor_earning',
            referenceId,
            meta: { commissionRate, grossAmount },
        });
    }
    if (commissionAmount > 0) {
        await recordTransaction({
            bookingId: bookingDoc._id,
            userId: bookingDoc.userId,
            vendorId: bookingDoc.vendorId,
            amount: commissionAmount,
            paymentMode: 'system',
            transactionType: 'platform_commission',
            referenceId,
            meta: { commissionRate, grossAmount },
        });
    }
}

export async function listVendorEarnings(vendorId, query = {}) {
    const parsed = parseListQuery(query);
    const filter = {
        isDeleted: { $ne: true },
        ownerType: 'vendor',
        vendorId,
        'money.vendorEarning': { $gt: 0 },
    };
    const dateRange = buildDateRangeFilter(parsed.createdFrom, parsed.createdTo);
    if (dateRange) filter.createdAt = dateRange;
    const [docs, total] = await Promise.all([
        BikeBooking.find(filter)
            .select('bookingNumber status money bikeSnapshot createdAt actualEndAt')
            .sort({ createdAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikeBooking.countDocuments(filter),
    ]);
    return toBikeRentPagination({
        docs: docs.map((doc) => ({
            id: String(doc._id),
            bookingNumber: doc.bookingNumber,
            status: doc.status,
            bikeName: doc.bikeSnapshot?.name || '',
            totalPaid: Number(doc.money?.totalPaid || 0),
            commissionRate: Number(doc.money?.commissionRate || 0),
            commissionAmount: Number(doc.money?.commissionAmount || 0),
            vendorEarning: Number(doc.money?.vendorEarning || 0),
            settledAt: doc.actualEndAt || doc.createdAt,
        })),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

/** Deposit refunds + late/damage balance settlements for the vendor's own bookings. */
export async function listVendorRefunds(vendorId, query = {}) {
    const parsed = parseListQuery(query);
    const filter = {
        isDeleted: { $ne: true },
        ownerType: 'vendor',
        vendorId,
        'depositRefund.status': { $exists: true, $nin: ['not_applicable'] },
    };
    if (query.status && query.status !== 'all') {
        filter['depositRefund.status'] = String(query.status);
    }
    const dateRange = buildDateRangeFilter(parsed.createdFrom, parsed.createdTo);
    if (dateRange) filter.createdAt = dateRange;
    const [docs, total] = await Promise.all([
        BikeBooking.find(filter)
            .select('bookingNumber status bikeSnapshot depositRefund lateReturn createdAt')
            .sort({ 'depositRefund.processedAt': -1, createdAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikeBooking.countDocuments(filter),
    ]);
    return toBikeRentPagination({
        docs: docs.map((doc) => ({
            id: String(doc._id),
            bookingNumber: doc.bookingNumber,
            status: doc.status,
            bikeName: doc.bikeSnapshot?.name || '',
            depositRefund: {
                status: doc.depositRefund?.status || 'not_applicable',
                amount: Number(doc.depositRefund?.amount || 0),
                scheduledAt: doc.depositRefund?.scheduledAt || null,
                eligibleAt: doc.depositRefund?.eligibleAt || null,
                processedAt: doc.depositRefund?.processedAt || null,
                note: doc.depositRefund?.note || '',
            },
            lateReturn: doc.lateReturn?.isLate
                ? {
                    chargeAmount: Number(doc.lateReturn.chargeAmount || 0),
                    damageFee: Number(doc.lateReturn.damageFee || 0),
                    remainingAmount: Number(doc.lateReturn.remainingAmount || 0),
                    paymentStatus: doc.lateReturn.paymentStatus || 'not_applicable',
                }
                : null,
            createdAt: doc.createdAt,
        })),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

export async function requestWithdrawal(vendorId, body = {}) {
    const amount = roundMoney(body.amount);
    if (!Number.isFinite(amount) || amount < 1) {
        throw new ValidationError('Enter a valid withdrawal amount');
    }

    const vendor = await BikeVendor.findById(vendorId).select('bank').lean();
    if (!vendor) throw new NotFoundError('Vendor not found');

    const wallet = await getOrCreateWallet(vendorId);
    const available = roundMoney(wallet.balance - wallet.lockedAmount);
    if (amount > available) {
        throw new ValidationError(`Insufficient wallet balance. Available: ₹${available}`);
    }

    const withdrawal = await BikeVendorWithdrawal.create({
        vendorId,
        amount,
        status: 'pending',
        bankDetails: {
            accountNumber: vendor.bank?.accountNumber || '',
            ifscCode: vendor.bank?.ifscCode || '',
            bankName: vendor.bank?.bankName || '',
            accountHolderName: vendor.bank?.accountHolderName || '',
        },
    });

    wallet.lockedAmount = roundMoney(wallet.lockedAmount + amount);
    await wallet.save();

    return serializeWithdrawal(withdrawal);
}

/** Stringifies an ObjectId ref whether or not it was .populate()'d. */
function refId(value) {
    if (!value) return null;
    if (typeof value.toHexString === 'function') return value.toHexString();
    if (value._id) return String(value._id);
    return String(value);
}

function serializeWithdrawal(doc) {
    const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
        id: String(obj._id),
        vendorId: refId(obj.vendorId),
        amount: Number(obj.amount || 0),
        status: obj.status,
        paymentMethod: obj.paymentMethod || 'bank_transfer',
        bankDetails: obj.bankDetails || {},
        adminNote: obj.adminNote || '',
        rejectionReason: obj.rejectionReason || '',
        transactionId: obj.transactionId || '',
        processedAt: obj.processedAt || null,
        createdAt: obj.createdAt,
        updatedAt: obj.updatedAt,
    };
}

export async function listVendorWithdrawals(vendorId, query = {}) {
    const parsed = parseListQuery(query);
    const filter = { vendorId };
    if (query.status && query.status !== 'all') filter.status = String(query.status);
    const dateRange = buildDateRangeFilter(parsed.createdFrom, parsed.createdTo);
    if (dateRange) filter.createdAt = dateRange;
    const [docs, total] = await Promise.all([
        BikeVendorWithdrawal.find(filter)
            .sort({ createdAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikeVendorWithdrawal.countDocuments(filter),
    ]);
    return toBikeRentPagination({
        docs: docs.map(serializeWithdrawal),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

export async function listAllWithdrawals(query = {}) {
    const parsed = parseListQuery(query);
    const filter = {};
    if (query.status && query.status !== 'all') filter.status = String(query.status);
    const [docs, total] = await Promise.all([
        BikeVendorWithdrawal.find(filter)
            .populate('vendorId', 'businessName ownerName vendorCode')
            .sort({ createdAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikeVendorWithdrawal.countDocuments(filter),
    ]);
    return toBikeRentPagination({
        docs: docs.map((doc) => ({
            ...serializeWithdrawal(doc),
            vendor: doc.vendorId && typeof doc.vendorId === 'object'
                ? {
                    id: String(doc.vendorId._id),
                    businessName: doc.vendorId.businessName || '',
                    ownerName: doc.vendorId.ownerName || '',
                    vendorCode: doc.vendorId.vendorCode || '',
                }
                : null,
        })),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

export async function approveWithdrawal(id, body, reqUser) {
    const withdrawal = await BikeVendorWithdrawal.findById(id);
    if (!withdrawal) throw new NotFoundError('Withdrawal request not found');
    if (withdrawal.status !== 'pending') {
        throw new ValidationError('Only pending withdrawal requests can be approved');
    }

    const wallet = await getOrCreateWallet(withdrawal.vendorId);
    if (wallet.balance < withdrawal.amount) {
        throw new ValidationError('Vendor wallet balance is lower than the requested amount');
    }

    wallet.balance = roundMoney(wallet.balance - withdrawal.amount);
    wallet.lockedAmount = roundMoney(Math.max(0, wallet.lockedAmount - withdrawal.amount));
    wallet.totalWithdrawn = roundMoney(wallet.totalWithdrawn + withdrawal.amount);
    await wallet.save();

    withdrawal.status = 'approved';
    withdrawal.transactionId = String(body?.transactionId || '').trim();
    withdrawal.adminNote = String(body?.adminNote || '').trim();
    withdrawal.processedAt = new Date();
    await withdrawal.save();

    return serializeWithdrawal(withdrawal);
}

export async function rejectWithdrawal(id, reason, reqUser) {
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) throw new ValidationError('Rejection reason is required');

    const withdrawal = await BikeVendorWithdrawal.findById(id);
    if (!withdrawal) throw new NotFoundError('Withdrawal request not found');
    if (withdrawal.status !== 'pending') {
        throw new ValidationError('Only pending withdrawal requests can be rejected');
    }

    const wallet = await getOrCreateWallet(withdrawal.vendorId);
    wallet.lockedAmount = roundMoney(Math.max(0, wallet.lockedAmount - withdrawal.amount));
    await wallet.save();

    withdrawal.status = 'rejected';
    withdrawal.rejectionReason = trimmedReason;
    withdrawal.processedAt = new Date();
    await withdrawal.save();

    return serializeWithdrawal(withdrawal);
}
