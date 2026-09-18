import { TaxSettings, TAX_SETTINGS_DEFAULTS } from '../models/taxSettings.model.js';
import { TransactionTaxBreakdown } from '../models/transactionTaxBreakdown.model.js';

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

export async function getTaxSettings() {
    let doc = await TaxSettings.findOne({ key: 'default' }).lean();
    if (!doc) {
        doc = (await TaxSettings.create({ key: 'default' })).toObject();
    }
    return doc;
}

/**
 * The single place GST math happens — every caller (quote engine, return-inspection billing,
 * invoice generation) goes through this so there's no duplicated tax logic anywhere.
 *
 * Pure/synchronous: pass in whatever taxable-component amounts are currently known
 * (`rentalAmount`/`platformFee` at quote time; `lateCharges`/`damageCharges` once known at
 * return-inspection time) and the already-loaded settings doc. Always recomputed fresh from
 * everything currently known — never incrementally accumulated — so `money.taxAmount` stays
 * internally consistent no matter how many times it's recomputed over a booking's lifecycle.
 */
export function computeTaxFromSettings(components = {}, taxSettings) {
    const {
        rentalAmount = 0,
        platformFee = 0,
        lateCharges = 0,
        damageCharges = 0,
        securityDeposit = 0,
    } = components;
    const flags = taxSettings?.taxableComponents || TAX_SETTINGS_DEFAULTS.taxableComponents;
    const gstRate = Number(taxSettings?.gstPercent ?? TAX_SETTINGS_DEFAULTS.gstPercent) || 0;

    const candidates = [
        { component: 'rentalAmount', baseAmount: rentalAmount, taxable: Boolean(flags.rentalAmount) },
        { component: 'platformFee', baseAmount: platformFee, taxable: Boolean(flags.platformFee) },
        { component: 'lateCharges', baseAmount: lateCharges, taxable: Boolean(flags.lateCharges) },
        { component: 'damageCharges', baseAmount: damageCharges, taxable: Boolean(flags.damageCharges) },
        { component: 'securityDeposit', baseAmount: securityDeposit, taxable: Boolean(flags.securityDeposit) },
    ].filter((line) => Number(line.baseAmount) > 0);

    let taxableAmount = 0;
    const breakdown = candidates.map((line) => {
        const baseAmount = roundMoney(line.baseAmount);
        const gstAmount = line.taxable ? roundMoney((baseAmount * gstRate) / 100) : 0;
        if (line.taxable) taxableAmount += baseAmount;
        return {
            component: line.component,
            baseAmount,
            taxable: line.taxable,
            gstRate,
            gstAmount,
        };
    });

    const gstAmount = roundMoney(breakdown.reduce((sum, line) => sum + line.gstAmount, 0));

    return {
        taxableAmount: roundMoney(taxableAmount),
        gstRate,
        gstAmount,
        breakdown,
    };
}

/** Convenience wrapper that loads TaxSettings itself — use computeTaxFromSettings when the
 *  caller already has settings loaded (e.g. alongside resolvePlatformFeeFromSettings) to avoid
 *  a redundant read. */
export async function computeTax(components = {}) {
    const taxSettings = await getTaxSettings();
    return computeTaxFromSettings(components, taxSettings);
}

/**
 * Fixed or percent-of-rental platform fee, per admin config. Returns `amount: 0` when disabled.
 * `payer` tells the caller whether this should be added to what the customer pays
 * (`'customer'`) or only recorded for later deduction from the vendor's settlement
 * (`'vendor'` — never added to the customer-facing total or taxed, since the customer never
 * sees it as a separate charge in that mode).
 */
export function resolvePlatformFeeFromSettings(rentalAmount, taxSettings) {
    const config = taxSettings?.platformFee || TAX_SETTINGS_DEFAULTS.platformFee;
    if (!config?.enabled) return { amount: 0, payer: '' };
    const amount = config.type === 'percent'
        ? roundMoney(((Number(rentalAmount) || 0) * (Number(config.amount) || 0)) / 100)
        : roundMoney(Number(config.amount) || 0);
    return { amount, payer: config.payer || 'customer' };
}

export async function resolvePlatformFee(rentalAmount) {
    const taxSettings = await getTaxSettings();
    return resolvePlatformFeeFromSettings(rentalAmount, taxSettings);
}

/** Persists the audit-trail rows behind a tax calculation event — one row per taxed component. */
export async function recordTaxBreakdown({ bookingId, invoiceId = null, breakdown = [] }) {
    const rows = (breakdown || [])
        .filter((line) => line.taxable && Number(line.baseAmount) > 0)
        .map((line) => ({
            bookingId,
            invoiceId,
            component: line.component,
            baseAmount: line.baseAmount,
            gstRate: line.gstRate,
            gstAmount: line.gstAmount,
            computedAt: new Date(),
        }));
    if (!rows.length) return [];
    return TransactionTaxBreakdown.insertMany(rows);
}
