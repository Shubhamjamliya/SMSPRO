import { TaxiSettings } from '../models/taxiSettings.model.js';
import { ValidationError } from '../../../core/auth/errors.js';

const DEFAULTS = {
    searchRadiusKm: 8,
};

function mapSettings(doc) {
    return {
        searchRadiusKm: Number(doc?.searchRadiusKm ?? DEFAULTS.searchRadiusKm),
        updatedAt: doc?.updatedAt || null,
    };
}

export async function getOrCreateSettings() {
    let doc = await TaxiSettings.findOne({ key: 'default' });
    if (!doc) {
        doc = await TaxiSettings.create({
            key: 'default',
            ...DEFAULTS,
        });
    }
    return doc;
}

export async function getSettings() {
    const doc = await getOrCreateSettings();
    return mapSettings(doc);
}

/**
 * Used by dispatch — always returns a safe number.
 */
export async function getSearchRadiusKm() {
    try {
        const doc = await getOrCreateSettings();
        const km = Number(doc.searchRadiusKm);
        if (!Number.isFinite(km) || km < 1) return DEFAULTS.searchRadiusKm;
        return Math.min(100, Math.max(1, km));
    } catch {
        return DEFAULTS.searchRadiusKm;
    }
}

export async function updateSettings(body = {}) {
    const next = {};

    if (body.searchRadiusKm !== undefined) {
        const km = Number(body.searchRadiusKm);
        if (!Number.isFinite(km) || km < 1 || km > 100) {
            throw new ValidationError('searchRadiusKm must be between 1 and 100');
        }
        next.searchRadiusKm = Math.round(km * 10) / 10;
    }

    if (!Object.keys(next).length) {
        throw new ValidationError('No valid settings fields to update');
    }

    const doc = await TaxiSettings.findOneAndUpdate(
        { key: 'default' },
        { $set: next, $setOnInsert: { key: 'default' } },
        { new: true, upsert: true },
    );

    return mapSettings(doc);
}
