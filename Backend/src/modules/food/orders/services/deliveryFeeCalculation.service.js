function roundCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(2));
}

export function calculateBaseDeliveryFeeForDistance(distanceKm, feeSettings) {
  const distance = Number(distanceKm);
  if (!Number.isFinite(distance) || distance < 0) return 0;

  if (Array.isArray(feeSettings?.deliveryDistanceSlabs) && feeSettings.deliveryDistanceSlabs.length > 0) {
    const baseSlab = feeSettings.deliveryDistanceSlabs.find((s) => Number(s.fromKm || 0) === 0);

    if (!baseSlab) {
      const matchedSlab = feeSettings.deliveryDistanceSlabs.find(
        (slab) => distance >= Number(slab.fromKm) && distance <= Number(slab.toKm),
      );
      if (matchedSlab) {
        return roundCurrency(Number(matchedSlab.deliveryFee));
      }
      const sortedSlabs = [...feeSettings.deliveryDistanceSlabs].sort((a, b) => Number(b.toKm) - Number(a.toKm));
      if (sortedSlabs.length > 0 && distance > Number(sortedSlabs[0].toKm)) {
        return roundCurrency(Number(sortedSlabs[0].deliveryFee));
      }
      return 60;
    }

    const baseFee = Number(baseSlab.deliveryFee || 0);
    const baseMax = Number(baseSlab.toKm || 0);

    if (distance <= baseMax) {
      return roundCurrency(baseFee);
    }

    const sorted = [...feeSettings.deliveryDistanceSlabs].sort(
      (a, b) => Number(a.fromKm || 0) - Number(b.fromKm || 0),
    );
    let totalFee = baseFee;

    for (const slab of sorted) {
      const slabMin = Number(slab.fromKm || 0);
      if (slabMin === 0) continue;

      const slabMax = slab.toKm == null ? null : Number(slab.toKm);
      const rate = Number(slab.deliveryFee || 0);

      if (distance <= slabMin) continue;

      const upper = slabMax == null ? distance : Math.min(distance, slabMax);
      const kmInSlab = Math.max(0, upper - slabMin);

      if (kmInSlab > 0) {
        totalFee += kmInSlab * rate;
      }
    }

    return roundCurrency(totalFee);
  }

  return 60;
}

export function resolveSlabExtraConfig(distanceKm, feeSettings) {
  const slabs = Array.isArray(feeSettings?.deliveryDistanceSlabs)
    ? feeSettings.deliveryDistanceSlabs
    : [];
  if (!slabs.length) {
    return { extraAmount: 0, extraType: "FLAT" };
  }

  const distance = Number(distanceKm);
  const baseSlab = slabs.find((s) => Number(s.fromKm || 0) === 0);

  // Incremental pricing: apply the base slab's extra on the total computed fee.
  if (baseSlab) {
    return {
      extraAmount: Number(baseSlab.extraAmount || 0),
      extraType: String(baseSlab.extraType || "FLAT").trim().toUpperCase(),
    };
  }

  const matchedSlab = slabs.find(
    (slab) =>
      Number.isFinite(distance) &&
      distance >= Number(slab.fromKm) &&
      distance <= Number(slab.toKm),
  );
  if (matchedSlab) {
    return {
      extraAmount: Number(matchedSlab.extraAmount || 0),
      extraType: String(matchedSlab.extraType || "FLAT").trim().toUpperCase(),
    };
  }

  const sortedByTo = [...slabs].sort((a, b) => Number(b.toKm) - Number(a.toKm));
  if (sortedByTo.length > 0 && Number.isFinite(distance) && distance > Number(sortedByTo[0].toKm)) {
    return {
      extraAmount: Number(sortedByTo[0].extraAmount || 0),
      extraType: String(sortedByTo[0].extraType || "FLAT").trim().toUpperCase(),
    };
  }

  const sortedByFrom = [...slabs].sort((a, b) => Number(a.fromKm) - Number(b.fromKm));
  if (sortedByFrom.length > 0) {
    return {
      extraAmount: Number(sortedByFrom[0].extraAmount || 0),
      extraType: String(sortedByFrom[0].extraType || "FLAT").trim().toUpperCase(),
    };
  }

  return { extraAmount: 0, extraType: "FLAT" };
}

/** @deprecated Use resolveSlabExtraConfig(distanceKm, feeSettings) */
export function getBaseSlabExtraConfig(feeSettings) {
  return resolveSlabExtraConfig(0, feeSettings);
}

export function calculateDeliveryExtraCharge(baseFee, extraAmount, extraType) {
  const base = Number(baseFee) || 0;
  const extra = Number(extraAmount) || 0;
  if (extra <= 0 || base <= 0) return 0;

  const type = String(extraType || "FLAT").trim().toUpperCase();
  if (type === "PERCENT") {
    return roundCurrency(base * (extra / 100));
  }

  return roundCurrency(extra);
}

export function calculateDeliveryFeeBreakdown(distanceKm, feeSettings) {
  const riderBaseDeliveryFee = calculateBaseDeliveryFeeForDistance(distanceKm, feeSettings);
  const { extraAmount, extraType } = resolveSlabExtraConfig(distanceKm, feeSettings);
  const deliveryExtraFee = calculateDeliveryExtraCharge(
    riderBaseDeliveryFee,
    extraAmount,
    extraType,
  );
  const totalDeliveryFee = roundCurrency(riderBaseDeliveryFee + deliveryExtraFee);

  return {
    riderBaseDeliveryFee,
    deliveryExtraFee,
    totalDeliveryFee,
  };
}

export function resolveFoodRiderEarning(pricing = {}) {
  const riderBase = Number(pricing.riderBaseDeliveryFee || 0);
  const deliveryExtra = Number(pricing.deliveryExtraFee || 0);
  if (riderBase > 0 || deliveryExtra > 0) {
    return roundCurrency(riderBase + deliveryExtra);
  }
  return roundCurrency(Number(pricing.userDeliveryFee ?? pricing.deliveryFee ?? 0));
}
