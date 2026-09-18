import { TaxSettings, TAX_SETTINGS_DEFAULTS } from '../models/taxSettings.model.js';
import { BikeAuditLog } from '../models/bikeAuditLog.model.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import { validateTaxSettingsDto } from '../validators/taxSettings.validator.js';

function mapTaxSettings(doc = {}) {
    return {
        gstPercent: Number(doc.gstPercent ?? TAX_SETTINGS_DEFAULTS.gstPercent),
        taxableComponents: {
            ...TAX_SETTINGS_DEFAULTS.taxableComponents,
            ...(doc.taxableComponents || {}),
        },
        platformFee: {
            ...TAX_SETTINGS_DEFAULTS.platformFee,
            ...(doc.platformFee || {}),
        },
        invoice: {
            ...TAX_SETTINGS_DEFAULTS.invoice,
            ...(doc.invoice || {}),
        },
        updatedBy: doc.updatedBy || null,
        updatedAt: doc.updatedAt || null,
    };
}

export async function getTaxSettings() {
    let doc = await TaxSettings.findOne({ key: 'default' }).lean();
    if (!doc) {
        doc = (await TaxSettings.create({ key: 'default' })).toObject();
    }
    return mapTaxSettings(doc);
}

export async function updateTaxSettings(body, reqUser) {
    const payload = validateTaxSettingsDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);

    let doc = await TaxSettings.findOne({ key: 'default' });
    if (!doc) {
        doc = new TaxSettings({ key: 'default' });
    }
    const before = mapTaxSettings(doc.toObject());

    if (payload.gstPercent !== undefined) doc.gstPercent = payload.gstPercent;
    if (payload.taxableComponents) {
        doc.taxableComponents = { ...doc.taxableComponents?.toObject?.() || doc.taxableComponents, ...payload.taxableComponents };
    }
    if (payload.platformFee) {
        doc.platformFee = { ...doc.platformFee?.toObject?.() || doc.platformFee, ...payload.platformFee };
    }
    if (payload.invoice) {
        doc.invoice = { ...doc.invoice?.toObject?.() || doc.invoice, ...payload.invoice };
    }
    doc.updatedBy = performer;
    doc.markModified('taxableComponents');
    doc.markModified('platformFee');
    doc.markModified('invoice');
    await doc.save();

    const after = mapTaxSettings(doc.toObject());
    try {
        await BikeAuditLog.create({
            entityType: 'tax_settings',
            entityId: doc._id,
            action: 'tax_settings.updated',
            before,
            after,
            performedBy: performer,
            meta: { changedKeys: Object.keys(payload || {}) },
        });
    } catch {
        /* non-blocking */
    }

    return after;
}
