import {
  clearModuleAuth,
  getCurrentUser,
  getModuleToken,
  hasModuleSession,
  isModuleAuthenticated,
  setAuthData,
} from "@food/utils/auth";

export const BIKE_VENDOR_AUTH_MODULE = "bike_vendor";
export const BIKE_VENDOR_LOGIN_PATH = "/bike-rent/vendor/login";
export const BIKE_VENDOR_PENDING_PHONE_KEY = "bike_vendor_pendingPhone";

export function isBikeVendorAuthenticated() {
  return isModuleAuthenticated(BIKE_VENDOR_AUTH_MODULE);
}

export function hasBikeVendorSession() {
  return hasModuleSession(BIKE_VENDOR_AUTH_MODULE);
}

export function getBikeVendorToken() {
  return getModuleToken(BIKE_VENDOR_AUTH_MODULE);
}

export function getBikeVendorUser() {
  return getCurrentUser(BIKE_VENDOR_AUTH_MODULE);
}

export function setBikeVendorAuth(accessToken, vendor, refreshToken = null) {
  setAuthData(BIKE_VENDOR_AUTH_MODULE, accessToken, vendor, refreshToken);
  try {
    localStorage.setItem("auth_bike_vendor", accessToken);
  } catch {
    /* ignore */
  }
}

export function clearBikeVendorAuth() {
  clearModuleAuth(BIKE_VENDOR_AUTH_MODULE);
  try {
    localStorage.removeItem("auth_bike_vendor");
    localStorage.removeItem(BIKE_VENDOR_PENDING_PHONE_KEY);
  } catch {
    /* ignore */
  }
}

export function setBikeVendorPendingPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "").slice(-10);
  if (!digits) {
    localStorage.removeItem(BIKE_VENDOR_PENDING_PHONE_KEY);
    return;
  }
  localStorage.setItem(BIKE_VENDOR_PENDING_PHONE_KEY, digits);
}

export function getBikeVendorPendingPhone() {
  return localStorage.getItem(BIKE_VENDOR_PENDING_PHONE_KEY);
}

export function normalizeVendorStatus(vendor) {
  return String(vendor?.status || "").toLowerCase();
}
