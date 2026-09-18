import {
  clearModuleAuth,
  getCurrentUser,
  getModuleToken,
  hasModuleSession,
  isModuleAuthenticated,
  setAuthData,
} from "@food/utils/auth";

export const SERVICE_PROVIDER_AUTH_MODULE = "service_provider";
export const SERVICE_PROVIDER_LOGIN_PATH = "/service-provider/login";
export const SERVICE_PROVIDER_PENDING_PHONE_KEY = "service_provider_pendingPhone";

export function isServiceProviderAuthenticated() {
  return isModuleAuthenticated(SERVICE_PROVIDER_AUTH_MODULE);
}

export function hasServiceProviderSession() {
  return hasModuleSession(SERVICE_PROVIDER_AUTH_MODULE);
}

export function getServiceProviderToken() {
  return getModuleToken(SERVICE_PROVIDER_AUTH_MODULE);
}

export function getServiceProviderUser() {
  return getCurrentUser(SERVICE_PROVIDER_AUTH_MODULE);
}

export function setServiceProviderAuth(accessToken, provider, refreshToken = null) {
  setAuthData(SERVICE_PROVIDER_AUTH_MODULE, accessToken, provider, refreshToken);
  try {
    localStorage.setItem("auth_service_provider", accessToken);
  } catch {
    /* ignore */
  }
}

export function clearServiceProviderAuth() {
  clearModuleAuth(SERVICE_PROVIDER_AUTH_MODULE);
  try {
    localStorage.removeItem("auth_service_provider");
    localStorage.removeItem(SERVICE_PROVIDER_PENDING_PHONE_KEY);
  } catch {
    /* ignore */
  }
}

export function setServiceProviderPendingPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "").slice(-10);
  if (!digits) {
    localStorage.removeItem(SERVICE_PROVIDER_PENDING_PHONE_KEY);
    return;
  }
  localStorage.setItem(SERVICE_PROVIDER_PENDING_PHONE_KEY, digits);
}

export function getServiceProviderPendingPhone() {
  return localStorage.getItem(SERVICE_PROVIDER_PENDING_PHONE_KEY);
}
