/**
 * Normalize Porter trip fare for invoice / receipt UI.
 * Uses final `fare.total` from the server (post-drop) when available.
 */

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

export function resolvePorterFareTotal(trip) {
  if (!trip) return 0;
  const fare = trip.fare || {};
  return round2(fare.total ?? trip.fareEstimateTotal ?? 0);
}

/**
 * @returns {{ rows: Array<{ label: string, value: number, meta?: string }>, total: number, fare: object }}
 */
export function buildPorterFareBreakdown(trip) {
  const fare = trip?.fare || {};
  const total = resolvePorterFareTotal(trip);

  const rows = [];

  const base = round2(fare.base);
  const distance = round2(fare.distance);
  const weight = round2(fare.weight);
  const waiting = round2(fare.waiting);
  const platformFee = round2(fare.platformFee);
  const preSurge = round2(base + distance + weight + waiting);
  const subtotal = round2(fare.subtotal ?? preSurge);
  const surgeMultiplier = Number(fare.surgeMultiplier || 1);

  if (base > 0) rows.push({ label: "Base fare", value: base });
  if (distance > 0) rows.push({ label: "Distance charge", value: distance });
  if (weight > 0) rows.push({ label: "Weight charge", value: weight });
  if (waiting > 0) {
    const billableMin = Number(fare.billableLoadingMin || 0);
    rows.push({
      label: "Loading overtime",
      value: waiting,
      meta: billableMin > 0 ? `${billableMin} min` : undefined,
    });
  }
  if (surgeMultiplier > 1 && subtotal > preSurge) {
    rows.push({
      label: "Surge charge",
      value: round2(subtotal - preSurge),
      meta: `${surgeMultiplier}x`,
    });
  }
  if (platformFee > 0) rows.push({ label: "Platform fee", value: platformFee });

  const lineSum = round2(rows.reduce((sum, row) => sum + row.value, 0));
  const resolvedTotal = total > 0 ? total : lineSum;

  if (!rows.length && resolvedTotal > 0) {
    rows.push({ label: "Trip fare", value: resolvedTotal });
  }

  return {
    rows,
    total: resolvedTotal,
    fare,
    lineSum,
  };
}

export function buildPorterFareBreakdownFromShipment(shipment) {
  if (!shipment) {
    return { rows: [], total: 0, fare: {}, lineSum: 0 };
  }
  if (shipment.trip) {
    return buildPorterFareBreakdown(shipment.trip);
  }
  return buildPorterFareBreakdown({
    fare: { total: Number(shipment.total || 0) },
  });
}

export function porterFareBreakdownForExport(breakdown, paymentLabel) {
  const map = {};
  for (const row of breakdown.rows || []) {
    if (row.label === "Base fare") map.baseFare = row.value;
    else if (row.label === "Distance charge") map.distanceCharge = row.value;
    else if (row.label === "Weight charge") map.weightCharge = row.value;
    else if (row.label === "Loading overtime") map.waitingCharge = row.value;
    else if (row.label === "Platform fee") map.platformFee = row.value;
    else if (row.label === "Trip fare") map.tripFare = row.value;
  }
  map.total = breakdown.total;
  map.paymentLabel = paymentLabel;
  map.rows = breakdown.rows || [];
  return map;
}
