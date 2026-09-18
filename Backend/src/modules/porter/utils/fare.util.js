import crypto from 'crypto';

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

function mapRateFields(src = {}) {
    return {
        baseFare: Number(src.baseFare ?? src.basePrice ?? 0),
        baseDistanceKm: Number(src.baseDistanceKm ?? src.baseDistance ?? 0),
        perKmRate: Number(src.perKmRate ?? src.distancePrice ?? 0),
        freeWeightKg: Number(src.freeWeightKg || 0),
        perKgRate: Number(src.perKgRate || 0),
        platformFee: Number(src.platformFee || 0),
        surgeMultiplier: Number(src.surgeMultiplier ?? 1) || 1,
    };
}

/**
 * Pick the slab for a trip distance (whole trip uses one slab).
 * Inclusive bounds; if multiple match (shared boundary), highest fromKm wins.
 */
export function selectPricingSlab(pricing, distanceKm = 0) {
    const d = Math.max(0, Number(distanceKm) || 0);
    const raw = Array.isArray(pricing?.slabs) ? pricing.slabs : [];

    if (!raw.length) {
        return {
            fromKm: 0,
            toKm: null,
            ...mapRateFields(pricing),
            legacy: true,
        };
    }

    const slabs = [...raw]
        .map((s) => ({
            fromKm: Number(s.fromKm || 0),
            toKm: s.toKm == null || s.toKm === '' ? null : Number(s.toKm),
            ...mapRateFields(s),
        }))
        .sort((a, b) => a.fromKm - b.fromKm);

    const matches = slabs.filter((s) => {
        if (d < s.fromKm) return false;
        if (s.toKm == null || !Number.isFinite(s.toKm)) return true;
        return d <= s.toKm;
    });

    if (matches.length) {
        return matches[matches.length - 1];
    }

    return slabs[slabs.length - 1];
}

/**
 * Porter fare = distance rates from matching slab + weight + loading overtime.
 */
export function computeLoadingMinutes(loadingStartedAt, loadedAt = new Date()) {
    if (!loadingStartedAt) return 0;
    const startMs = new Date(loadingStartedAt).getTime();
    const endMs = new Date(loadedAt || Date.now()).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
    return Math.max(0, Math.ceil((endMs - startMs) / 60000));
}

export function computeFare({
    distanceKm = 0,
    weightKg = 0,
    loadingMin = 0,
    freeLoadingMinutes,
    extraLoadingPerMinCharge,
    pricing,
}) {
    const slab = selectPricingSlab(pricing, distanceKm);
    const base = slab.baseFare;
    const baseDistanceKm = slab.baseDistanceKm;
    const billableKm = Math.max(0, Number(distanceKm || 0) - baseDistanceKm);
    const distance = billableKm * slab.perKmRate;

    const freeWeight = slab.freeWeightKg;
    const loadKg = Math.max(0, Number(weightKg || 0));
    const billableKg = Math.max(0, loadKg - freeWeight);
    const weight = billableKg * slab.perKgRate;

    const freeLoad = Math.max(
        0,
        Number(
            freeLoadingMinutes != null
                ? freeLoadingMinutes
                : (pricing?.freeLoadingMinutes ?? 60),
        ) || 0,
    );
    const loadRate = Math.max(
        0,
        Number(
            extraLoadingPerMinCharge != null
                ? extraLoadingPerMinCharge
                : (pricing?.extraLoadingPerMinCharge ?? 3),
        ) || 0,
    );
    const waitMin = Math.max(0, Number(loadingMin || 0));
    const billableLoadingMin = Math.max(0, waitMin - freeLoad);
    const waiting = billableLoadingMin * loadRate;

    const platformFee = slab.platformFee;
    const surgeMultiplier = slab.surgeMultiplier;
    const subtotal = (base + distance + weight + waiting) * surgeMultiplier;
    const total = subtotal + platformFee;

    return {
        base: round2(base),
        distance: round2(distance),
        weight: round2(weight),
        time: 0,
        waiting: round2(waiting),
        platformFee: round2(platformFee),
        serviceTax: 0,
        surgeMultiplier,
        subtotal: round2(subtotal),
        total: round2(total),
        currency: 'INR',
        freeWeightKg: freeWeight,
        weightKg: loadKg,
        billableKg,
        perKgRate: Number(slab.perKgRate || 0),
        freeLoadingMinutes: freeLoad,
        loadingMin: waitMin,
        billableLoadingMin,
        extraLoadingPerMinCharge: loadRate,
        slab: {
            fromKm: slab.fromKm,
            toKm: slab.toKm,
        },
    };
}

export function applyAdminCommission(fare, adminCommissionPercent = 0) {
    const percent = Math.min(100, Math.max(0, Number(adminCommissionPercent) || 0));
    const total = round2(Number(fare?.total || 0));
    const platformFee = round2(Math.max(0, Number(fare?.platformFee || 0)));
    const afterPlatform = round2(Math.max(0, total - platformFee));
    const adminCommissionAmount = round2((afterPlatform * percent) / 100);
    const driverShare = round2(Math.max(0, afterPlatform - adminCommissionAmount));

    return {
        ...fare,
        adminCommissionPercent: percent,
        adminCommissionAmount,
        driverShare,
    };
}

export function generateDeliveryOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

export { round2, mapRateFields };
