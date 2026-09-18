/**
 * Resolve whether the active delivery point matches a saved address label.
 * Live/GPS locations must NOT inherit a stale Home/Work badge.
 */

export const normalizeSavedLabel = (label = "") => {
  const raw = String(label || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "home") return "Home";
  if (lower === "office" || lower === "work") return "Office";
  if (lower === "other") return "Other";
  return raw;
};

export const tabFromSavedLabel = (label = "") => {
  const normalized = normalizeSavedLabel(label);
  if (normalized === "Office") return "Work";
  if (normalized === "Home" || normalized === "Other") return normalized;
  return null;
};

export const findMatchingSavedAddress = (savedAddresses = [], addressText = "") => {
  const target = String(addressText || "").trim().toLowerCase();
  if (!target || !Array.isArray(savedAddresses) || savedAddresses.length === 0) {
    return null;
  }
  return (
    savedAddresses.find(
      (addr) => String(addr?.address || "").trim().toLowerCase() === target,
    ) || null
  );
};

/** UI badge: Home / Office / Other / Current */
export const resolveDeliveryLabel = ({
  addressText = "",
  savedAddresses = [],
  storedType = "",
  storedId = "",
} = {}) => {
  const text = String(addressText || "").trim();
  if (!text) return "";

  const byText = findMatchingSavedAddress(savedAddresses, text);
  if (byText) return normalizeSavedLabel(byText.label) || "Other";

  if (storedId) {
    const byId = (savedAddresses || []).find(
      (addr) => String(addr?.id) === String(storedId),
    );
    if (byId && String(byId.address || "").trim().toLowerCase() === text.toLowerCase()) {
      return normalizeSavedLabel(byId.label) || "Other";
    }
  }

  const stored = normalizeSavedLabel(storedType);
  // Stale Home/Work/Other on a non-matching live address → Current
  if (stored === "Home" || stored === "Office" || stored === "Other") {
    return "Current";
  }
  if (stored === "Current" || stored.toLowerCase() === "current location") {
    return "Current";
  }
  return "Current";
};

export const deliveryLabelForDisplay = (label = "") => {
  const normalized = String(label || "").trim();
  if (!normalized) return "";
  if (normalized === "Current") return "Current location";
  if (normalized === "Office") return "Work";
  return normalized;
};
