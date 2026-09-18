import {
    BikeRentSettings,
    BIKE_RENT_SETTINGS_DEFAULTS,
} from '../models/bikeRentSettings.model.js';
import { BikeAuditLog } from '../models/bikeAuditLog.model.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import { ValidationError, NotFoundError } from '../../../core/auth/errors.js';
import { mapSettings } from '../utils/mappers.util.js';
import { validateSettingsDto, validateVendorSettingsDto } from '../validators/settings.validator.js';
import { VENDOR_OVERRIDABLE_KEY_SET } from '../utils/vendorSettings.util.js';
export { VENDOR_SETTINGS_SECTIONS, VENDOR_OVERRIDABLE_KEYS } from '../utils/vendorSettings.util.js';

export async function getSettings() {
    let doc = await BikeRentSettings.findOne({ key: 'default' }).lean();
    if (!doc) {
        doc = (await BikeRentSettings.create({
            key: 'default',
            ...BIKE_RENT_SETTINGS_DEFAULTS,
        })).toObject();
    }
    return mapSettings(doc);
}

/**
 * Merge platform defaults with vendor and (optional) bike overrides. Only whitelisted,
 * non-null keys from `vendorSettings`/`bikeOverride` are applied — anything else always
 * falls through to the admin platform value.
 */
export function resolveEffectiveSettings(adminSettings, vendorSettings = null, bikeOverride = null) {
    const settings = { ...adminSettings };
    const sources = {};
    Object.keys(adminSettings).forEach((key) => { sources[key] = 'admin'; });

    if (vendorSettings && typeof vendorSettings === 'object') {
        Object.entries(vendorSettings).forEach(([key, value]) => {
            if (value === undefined || value === null || !VENDOR_OVERRIDABLE_KEY_SET.has(key)) return;
            settings[key] = value;
            sources[key] = 'vendor';
        });
    }

    if (bikeOverride && typeof bikeOverride === 'object') {
        Object.entries(bikeOverride).forEach(([key, value]) => {
            if (value === undefined || value === null || !VENDOR_OVERRIDABLE_KEY_SET.has(key)) return;
            settings[key] = value;
            sources[key] = 'bike';
        });
    }

    return { settings, sources };
}

/**
 * Resolve the effective settings a specific booking/quote/bike should use, walking
 * bike -> vendor -> platform. Pass whichever of `bikeId`/`vendorId` you already have in
 * scope; if `bikeId` is given its vendor is resolved automatically when `vendorId` isn't.
 */
export async function getEffectiveSettings({ bikeId = null, vendorId = null } = {}) {
    const adminSettings = await getSettings();
    if (!bikeId && !vendorId) {
        return { settings: adminSettings, sources: {} };
    }

    let effectiveVendorId = vendorId ? String(vendorId) : null;
    let bikeOverride = null;

    if (bikeId) {
        const { BikeUnit } = await import('../models/bikeUnit.model.js');
        const bike = await BikeUnit.findById(bikeId).select('vendorId ownerType settingsOverride').lean();
        if (bike) {
            bikeOverride = bike.settingsOverride || null;
            if (!effectiveVendorId && bike.ownerType === 'vendor' && bike.vendorId) {
                effectiveVendorId = String(bike.vendorId);
            }
        }
    }

    let vendorSettings = null;
    if (effectiveVendorId) {
        const { BikeVendor } = await import('../models/bikeVendor.model.js');
        const vendor = await BikeVendor.findById(effectiveVendorId).select('settings').lean();
        vendorSettings = vendor?.settings || null;
    }

    return resolveEffectiveSettings(adminSettings, vendorSettings, bikeOverride);
}

export async function updateSettings(body, reqUser) {
    const payload = validateSettingsDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);
    const before = await getSettings();

    // When only one duration bound is sent, validate against the stored counterpart.
    if (
        (payload.minBookingDurationHours != null && payload.maxBookingDurationHours == null)
        || (payload.maxBookingDurationHours != null && payload.minBookingDurationHours == null)
    ) {
        const minH = payload.minBookingDurationHours ?? before.minBookingDurationHours;
        const maxH = payload.maxBookingDurationHours ?? before.maxBookingDurationHours;
        if (Number(maxH) < Number(minH)) {
            throw new ValidationError(
                'Maximum booking duration must be greater than or equal to minimum booking duration',
            );
        }
    }

    // Avoid Mongo path conflicts: the same field cannot appear in both $set and $setOnInsert.
    let doc = await BikeRentSettings.findOne({ key: 'default' });
    if (!doc) {
        doc = new BikeRentSettings({
            key: 'default',
            ...BIKE_RENT_SETTINGS_DEFAULTS,
        });
    }

    Object.assign(doc, payload);
    doc.updatedBy = performer;
    await doc.save();

    const after = mapSettings(doc.toObject());
    try {
        await BikeAuditLog.create({
            entityType: 'settings',
            entityId: doc?._id || null,
            action: 'settings.updated',
            before,
            after,
            performedBy: performer,
            meta: {
                changedKeys: Object.keys(payload || {}),
            },
        });
    } catch {
        /* non-blocking */
    }

    return after;
}

/**
 * A vendor's own settings screen: their current overrides, the resulting effective
 * (merged) values, which source ('admin' | 'vendor') each key currently comes from,
 * and the raw platform defaults so the UI can show "inherited" values greyed out.
 */
export async function getVendorSettings(vendorId) {
    const { BikeVendor } = await import('../models/bikeVendor.model.js');
    const vendor = await BikeVendor.findById(vendorId).select('settings').lean();
    if (!vendor) throw new NotFoundError('Vendor not found');

    const adminSettings = await getSettings();
    const overrides = vendor.settings || {};
    const { settings, sources } = resolveEffectiveSettings(adminSettings, overrides);
    return { overrides, effective: settings, sources, platformDefaults: adminSettings };
}

/**
 * Full replace of the vendor's settings-override map — omitted (whitelisted) keys revert
 * to "inherit platform default". Audit-logged the same way platform settings changes are.
 */
export async function updateVendorSettings(vendorId, body, reqUser) {
    const { BikeVendor } = await import('../models/bikeVendor.model.js');
    const vendor = await BikeVendor.findById(vendorId);
    if (!vendor) throw new NotFoundError('Vendor not found');

    const payload = validateVendorSettingsDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);
    const before = vendor.settings || {};

    vendor.settings = payload;
    vendor.markModified('settings');
    await vendor.save();

    try {
        await BikeAuditLog.create({
            entityType: 'vendor_settings',
            entityId: vendor._id,
            action: 'vendor_settings.updated',
            before,
            after: payload,
            performedBy: performer,
            meta: { vendorId: String(vendor._id), changedKeys: Object.keys(payload || {}) },
        });
    } catch {
        /* non-blocking */
    }

    const adminSettings = await getSettings();
    const { settings, sources } = resolveEffectiveSettings(adminSettings, payload);
    return { overrides: payload, effective: settings, sources, platformDefaults: adminSettings };
}
