import { TaxiCashLimit } from '../models/taxiCashLimit.model.js';
import { TaxiRide } from '../models/taxiRide.model.js';
import { ValidationError } from '../../../core/auth/errors.js';

const DEFAULTS = { cashLimit: 2000, isActive: true };

function mapSettings(doc) {
    return {
        cashLimit: Number(doc?.cashLimit ?? DEFAULTS.cashLimit),
        isActive: doc?.isActive !== false,
        updatedAt: doc?.updatedAt || null,
    };
}

export async function getOrCreateCashLimitSettings() {
    let doc = await TaxiCashLimit.findOne({ key: 'default' });
    if (!doc) {
        doc = await TaxiCashLimit.create({ key: 'default', ...DEFAULTS });
    }
    return doc;
}

export async function getCashLimitSettings() {
    const doc = await getOrCreateCashLimitSettings();
    return mapSettings(doc);
}

export async function updateCashLimitSettings(body = {}) {
    const next = {};
    if (body.cashLimit !== undefined) {
        const n = Number(body.cashLimit);
        if (!Number.isFinite(n) || n < 0) {
            throw new ValidationError('cashLimit must be a non-negative number');
        }
        next.cashLimit = n;
    }
    if (body.isActive !== undefined) {
        next.isActive = Boolean(body.isActive);
    }
    if (!Object.keys(next).length) {
        throw new ValidationError('No valid cash limit fields to update');
    }

    const doc = await TaxiCashLimit.findOneAndUpdate(
        { key: 'default' },
        { $set: next, $setOnInsert: { key: 'default' } },
        { new: true, upsert: true },
    );
    return mapSettings(doc);
}

/**
 * Cash in hand = sum of completed taxi cash ride totals for this driver.
 * (v1: no taxi deposits yet)
 */
export async function getDriverTaxiCashInHand(driverId) {
    if (!driverId) return 0;
    const rows = await TaxiRide.aggregate([
        {
            $match: {
                isDeleted: { $ne: true },
                status: 'completed',
                'dispatch.deliveryPartnerId': driverId,
                'payment.method': 'cash',
                'payment.status': 'paid',
            },
        },
        {
            $group: {
                _id: null,
                total: { $sum: { $ifNull: ['$fare.total', 0] } },
            },
        },
    ]);
    return Number(rows[0]?.total || 0);
}

export async function getDriverTaxiCashAvailability(driverId) {
    const settings = await getCashLimitSettings();
    const cashInHand = await getDriverTaxiCashInHand(driverId);
    if (!settings.isActive) {
        return {
            ...settings,
            cashInHand,
            availableCashLimit: Number.POSITIVE_INFINITY,
            canCollectCash: true,
        };
    }
    const availableCashLimit = Math.max(0, settings.cashLimit - cashInHand);
    return {
        ...settings,
        cashInHand,
        availableCashLimit,
        canCollectCash: availableCashLimit > 0,
    };
}

export async function assertCanCollectTaxiCash(driverId, amount) {
    const info = await getDriverTaxiCashAvailability(driverId);
    if (!info.isActive) return info;
    const need = Number(amount || 0);
    if (info.availableCashLimit < need) {
        throw new ValidationError(
            `Taxi cash limit exceeded. Available ₹${Math.round(info.availableCashLimit)}, ride needs ₹${Math.round(need)}. Deposit or settle cash first.`,
        );
    }
    return info;
}
