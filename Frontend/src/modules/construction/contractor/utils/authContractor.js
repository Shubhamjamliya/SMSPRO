import {
  clearModuleAuth,
  getCurrentUser,
  getModuleToken,
  hasModuleSession,
  isModuleAuthenticated,
  setAuthData,
} from "@food/utils/auth";

/**
 * Contractor session helpers — mirrors the Service Provider pattern so the
 * shared axios interceptor and auth store treat contractors as their own
 * module rather than borrowing the customer token.
 */
export const CONTRACTOR_AUTH_MODULE = "contractor";
export const CONTRACTOR_LOGIN_PATH = "/contractor/login";
export const CONTRACTOR_PENDING_PHONE_KEY = "contractor_pendingPhone";

export function isContractorAuthenticated() {
  return isModuleAuthenticated(CONTRACTOR_AUTH_MODULE);
}

export function hasContractorSession() {
  return hasModuleSession(CONTRACTOR_AUTH_MODULE);
}

export function getContractorToken() {
  return getModuleToken(CONTRACTOR_AUTH_MODULE);
}

export function getContractorUser() {
  return getCurrentUser(CONTRACTOR_AUTH_MODULE);
}

export function setContractorAuth(accessToken, contractor, refreshToken = null) {
  setAuthData(CONTRACTOR_AUTH_MODULE, accessToken, contractor, refreshToken);
  try {
    localStorage.setItem("auth_contractor", accessToken);
  } catch {
    /* ignore */
  }
}

/**
 * Refresh the cached contractor WITHOUT touching the tokens.
 *
 * `setContractorAuth` requires an access token and writes it to storage — calling
 * it with `undefined` after a profile save would store the string "undefined"
 * over a valid token and sign the contractor out on their next request. This
 * updates only the cached user, which is all a profile edit should change.
 */
export function updateContractorUser(contractor) {
  if (!contractor) return;
  try {
    localStorage.setItem(`${CONTRACTOR_AUTH_MODULE}_user`, JSON.stringify(contractor));
  } catch {
    /* a stale cached name is not worth throwing over */
  }
}

export function clearContractorAuth() {
  clearModuleAuth(CONTRACTOR_AUTH_MODULE);
  try {
    localStorage.removeItem("auth_contractor");
    localStorage.removeItem(CONTRACTOR_PENDING_PHONE_KEY);
  } catch {
    /* ignore */
  }
}

export function setContractorPendingPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "").slice(-10);
  try {
    if (!digits) localStorage.removeItem(CONTRACTOR_PENDING_PHONE_KEY);
    else localStorage.setItem(CONTRACTOR_PENDING_PHONE_KEY, digits);
  } catch {
    /* ignore */
  }
}

export function getContractorPendingPhone() {
  try {
    return localStorage.getItem(CONTRACTOR_PENDING_PHONE_KEY);
  } catch {
    return null;
  }
}
