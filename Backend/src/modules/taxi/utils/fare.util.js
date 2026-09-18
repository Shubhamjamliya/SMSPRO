import crypto from 'crypto';

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

function mapRateFields(src = {}) {
    return {
        baseFare: Number(src.baseFare || 0),
        baseDistanceKm: Number(src.baseDistanceKm || 0),
        perKmRate: Number(src.perKmRate || 0),
        perMinRate: Number(src.perMinRate || 0),
        freeWaitMinutes: Number(src.freeWaitMinutes || 0),
        perMinWaitRate: Number(src.perMinWaitRate || 0),
        platformFee: Number(src.platformFee || 0),
        surgeMultiplier: Number(src.surgeMultiplier ?? 1) || 1,
    };
}

/**
 * Pick the slab for a trip distance (option A: whole trip uses one slab).
 * Inclusive bounds; if multiple match (shared boundary), highest fromKm wins.
 * If beyond all slabs, use the last (highest fromKm) slab.
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
 * Minutes the driver waited at pickup (arrived → trip start).
 * Partial minutes round up so short waits still bill when over free wait.
 */
export function computePickupWaitingMinutes(arrivedAt, startedAt) {
    if (!arrivedAt || !startedAt) return 0;
    const startMs = new Date(arrivedAt).getTime();
    const endMs = new Date(startedAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
    return Math.max(0, Math.ceil((endMs - startMs) / 60000));
}

/**
 * Fare = distance-based rates from the matching slab.
 * Trip duration (per-min ride time) is NOT charged — only waiting + fees/surge apply as extras.
 */
export function computeFare({
    distanceKm = 0,
    durationMin: _durationMin = 0, // trip time not billed; kept for callers
    waitingMin = 0,
    pricing,
}) {
    const slab = selectPricingSlab(pricing, distanceKm);
    const base = slab.baseFare;
    const baseDistanceKm = slab.baseDistanceKm;
    const billableKm = Math.max(0, Number(distanceKm || 0) - baseDistanceKm);
    const distance = billableKm * slab.perKmRate;
    // Distance-only trip fare — perMinRate × duration is intentionally excluded
    const time = 0;
    const freeWait = slab.freeWaitMinutes;
    const waitMin = Math.max(0, Number(waitingMin || 0));
    const billableWaitMin = Math.max(0, waitMin - freeWait);
    const waiting = billableWaitMin * slab.perMinWaitRate;
    const platformFee = slab.platformFee;
    const surgeMultiplier = slab.surgeMultiplier;
    const subtotal = (base + distance + time + waiting) * surgeMultiplier;
    const total = subtotal + platformFee;

    return {
        base: round2(base),
        distance: round2(distance),
        time: round2(time),
        waiting: round2(waiting),
        platformFee: round2(platformFee),
        surgeMultiplier,
        subtotal: round2(subtotal),
        total: round2(total),
        currency: 'INR',
        freeWaitMinutes: freeWait,
        waitingMin: waitMin,
        billableWaitMin,
        perMinWaitRate: Number(slab.perMinWaitRate || 0),
        slab: {
            fromKm: slab.fromKm,
            toKm: slab.toKm,
        },
    };
}

/**
 * Split after platform fee is cut from total:
 *   afterPlatform = total − platformFee
 *   adminCommission = afterPlatform × percent/100
 *   driverShare = afterPlatform − adminCommission
 * Admin earnings = platformFee + adminCommission
 *
 * Example: total ₹60, platformFee ₹0, 10% → admin ₹6, driver ₹54
 */
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

export function generateRideOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

export { round2, mapRateFields };
