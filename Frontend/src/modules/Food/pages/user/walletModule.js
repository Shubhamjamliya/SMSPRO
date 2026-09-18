/**
 * Helpers for shared platform wallet when opened with ?from=<module>.
 * One wallet balance; module-scoped history filtering.
 */

const FROM_MODULE = {
  "bike-rent": "bike",
  bike: "bike",
  bike_rent: "bike",
  porter: "porter",
  taxi: "taxi",
  quick: "quick",
  food: "food",
  services: "services",
  service_provider: "services",
  "service-provider": "services",
};

export function resolveWalletFrom(raw) {
  const key = String(raw || "").trim().toLowerCase();
  return FROM_MODULE[key] || null;
}

export function isBikeRentWalletSource(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return false;
  return (
    value === "bike_rental"
    || value === "bike-rental"
    || value === "bike"
    || value.startsWith("bike_rent")
    || value.includes("bike_rent")
    || value.includes("bike-rent")
  );
}

function txnHaystack(transaction) {
  const meta = transaction?.metadata || {};
  return [
    meta.source,
    meta.module,
    meta.service,
    meta.kind,
    meta.initiatedFrom,
    meta.orderId,
    meta.refundTransactionId,
    meta.referenceId,
    transaction?.source,
    transaction?.description,
    transaction?.reason,
  ]
    .map((part) => String(part || "").toLowerCase())
    .join(" ");
}

export function isModuleWalletTransaction(transaction, moduleKey) {
  // Default Food wallet (no ?from=): Food + top-ups + referrals, exclude other services.
  if (!moduleKey || moduleKey === "food") {
    if (isModuleWalletTransaction(transaction, "bike")) return false;
    if (isModuleWalletTransaction(transaction, "taxi")) return false;
    if (isModuleWalletTransaction(transaction, "porter")) return false;
    if (isModuleWalletTransaction(transaction, "quick")) return false;
    if (isModuleWalletTransaction(transaction, "services")) return false;
    return true;
  }

  const meta = transaction?.metadata || {};
  const haystack = txnHaystack(transaction);
  const source = String(meta.source || meta.module || transaction?.source || "").toLowerCase();

  if (moduleKey === "bike") {
    return (
      isBikeRentWalletSource(source)
      || isBikeRentWalletSource(meta.initiatedFrom)
      || haystack.includes("bike_rent")
      || haystack.includes("bike-rent")
      || haystack.includes("bike rental")
      || /deposit-refund:|cancel-deposit:|cancel-rental:|no-show-refund:|bike-rent/.test(haystack)
    );
  }
  if (moduleKey === "porter") {
    return haystack.includes("porter") || source.includes("porter");
  }
  if (moduleKey === "taxi") {
    return haystack.includes("taxi") || haystack.includes("ride") || source.includes("taxi");
  }
  if (moduleKey === "quick") {
    return haystack.includes("quick") || haystack.includes("qc") || source.includes("quick");
  }
  if (moduleKey === "services") {
    return haystack.includes("service_provider") || source.includes("service_provider");
  }
  return true;
}

export function walletModuleTitle(moduleKey) {
  if (moduleKey === "bike") return "Bike Rental";
  if (moduleKey === "porter") return "Porter";
  if (moduleKey === "taxi") return "Taxi";
  if (moduleKey === "quick") return "Quick Commerce";
  if (moduleKey === "services") return "Home Services";
  return "Wallet";
}

export function walletSourceModuleForApi(moduleKey) {
  if (moduleKey === "bike") return "BIKE_RENTAL";
  if (moduleKey === "porter") return "PORTER";
  if (moduleKey === "taxi") return "TAXI";
  if (moduleKey === "quick") return "QUICK_COMMERCE";
  if (moduleKey === "food") return "FOOD";
  if (moduleKey === "services") return "SERVICE_PROVIDER";
  return null;
}

export function formatBikeRentTransactionTitle(transaction) {
  const meta = transaction?.metadata || {};
  const kind = String(meta.kind || meta.reasonCode || transaction?.reason || "").toLowerCase();
  const source = String(meta.source || meta.module || "").toLowerCase();
  const description = String(transaction?.description || transaction?.reason || "").trim();
  const lowerDesc = description.toLowerCase();

  if (kind === "add_money" || /top-?up|add money/i.test(lowerDesc)) {
    return "Added money";
  }
  if (kind === "security_deposit_refund" || /deposit.?refund/i.test(lowerDesc)) {
    return "Security deposit refund";
  }
  if (kind === "cancellation_refund" || /cancellation.?refund/i.test(lowerDesc)) {
    return "Cancellation refund";
  }
  if (kind === "no_show_deposit_refund" || /no.?show/i.test(lowerDesc)) {
    return "No-show refund";
  }
  if (source.includes("extension") || /extension/i.test(lowerDesc)) {
    return "Rental extension payment";
  }
  if (
    kind === "extra_charge_deduction"
    || source.includes("late")
    || /late/i.test(lowerDesc)
  ) {
    return "Late return charge";
  }
  if (source.includes("rollback") || /rollback/i.test(lowerDesc)) {
    return "Payment rollback";
  }
  const type = String(transaction?.type || "").toLowerCase();
  if (type === "deduction" || type === "debit") {
    return description || "Bike rental payment";
  }
  if (type === "refund" || type === "credit" || type === "addition") {
    return description || "Bike rental refund";
  }
  return description || "Bike rental";
}

export function formatBikeRentTransactionSubtitle(transaction) {
  const meta = transaction?.metadata || {};
  const parts = [];
  const booking =
    meta.bookingNumber
    || (meta.bookingId ? String(meta.bookingId).slice(-8) : "")
    || "";
  if (booking) parts.push(`Booking #${String(booking).replace(/^#/, "")}`);
  parts.push("Bike Rental");
  return parts.filter(Boolean).join(" · ");
}
