/**
 * Central API client for backend (auth and future APIs).
 * - baseURL from VITE_API_BASE_URL (e.g. http://localhost:5000/api/v1)
 * - When baseURL ends with /api/v1, request paths must NOT include /v1 (use /food/..., /auth/...)
 * - Attaches Bearer token (user or admin based on request URL)
 * - On 401: attempts refresh, retries once; on refresh failure logs out
 * - Centralized normalize + GET retry + deduped infra toasts via httpErrorHandling
 */

import axios from "axios";
import { redirectToModuleLogin, getModuleFromPathname } from "@core/utils/sessionExpiry";
import { installHttpCache } from "./httpCache.js";
import {
  attachSlowNetworkWatcher,
  clearRequestWatchers,
  installHttpErrorHandling,
} from "./httpErrorHandling.js";
import { notifyNetworkStatus } from "./networkToast.js";
import { ApiErrorCode } from "./errors.js";
import { getImageUrl } from "@/shared/utils/getImageUrl";

const normalizeUploadUrls = (value) => {
  if (typeof value === "string") {
    return /^\/?uploads\//i.test(value) ? getImageUrl(value) : value;
  }
  if (Array.isArray(value)) return value.map(normalizeUploadUrls);
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => {
      value[key] = normalizeUploadUrls(child);
    });
  }
  return value;
};

// Only force a redirect if the module whose session just died is the one actually being
// viewed — a background 401 for an unrelated module shouldn't hijack the active session.
function redirectIfCurrentModule(module) {
  if (typeof window === "undefined") return;
  if (getModuleFromPathname(window.location.pathname) === module) {
    redirectToModuleLogin(module);
  }
}

// AuthContext (core/context/AuthContext.jsx) tracks its own "auth_*" keys and reacts to
// these custom events. Keep it in sync when this instance silently refreshes a token,
// otherwise AuthContext keeps seeing the old token and can force a logout on its own axios
// instance shortly after a successful refresh here.
const AUTH_CONTEXT_KEY_BY_MODULE = {
  user: "auth_customer",
  admin: "auth_admin",
  delivery: "auth_delivery",
};
const AUTH_CONTEXT_EVENT_BY_MODULE = {
  user: "userAuthChanged",
  admin: "adminAuthChanged",
  delivery: "deliveryAuthChanged",
};

// Prefer explicit env. If not set, use same-origin (works with a Vite proxy).
// This avoids hardcoding ports like 5000 that may conflict with local setups.
const baseURL =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, "")
    : "/api/v1";

const apiClient = axios.create({
  baseURL: baseURL || undefined,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// Transparently de-duplicate concurrent identical GETs and short-cache their responses,
// then clear that cache after any successful write. This eliminates the repeated,
// identical API calls fired on every page mount / re-navigation (and React StrictMode's
// double effect invocation in dev). Opt out per request with `noCache: true`, or tune the
// window with `cacheTTL: <ms>`. See ./httpCache.js.
installHttpCache(apiClient);

// Register error finalizer BEFORE the 401 interceptor so Axios (LIFO on errors)
// runs auth refresh first, then normalization / GET-retry / infra toasts.
installHttpErrorHandling(apiClient);

function getModuleFromUrl(url = "") {
  const normalized = (typeof url === "string" ? url : (url?.url || "")).toLowerCase();

  // Public fee summary is user-facing (cart) even though legacy path contains /admin/.
  if (
    normalized.includes("/fee-settings/public") ||
    normalized.includes("/delivery-speed-options/public") ||
    normalized.includes("/public/delivery-speed-options")
  ) return "user";

  // 1. Admin detection (Priority)
  if (
    normalized.includes("/admin/") || 
    normalized.includes("/food/admin/") || 
    normalized.includes("/food/auth/admin") || 
    normalized.includes("/auth/admin") || 
    normalized.includes("admin/login")
  ) return "admin";

  // 2. Special case: /food/restaurants (plural) is a public endpoint
  // BUT only if it's not a restaurant owner's specific route
  if (normalized.includes("/food/restaurants") && !normalized.includes("/food/restaurant/")) {
    return "user";
  }

  // 3. Restaurant detection
  if (
    normalized.includes("/restaurant/") || 
    normalized.includes("/food/restaurant") ||
    normalized.includes("/auth/restaurant")
  ) {
    return "restaurant";
  }
  
  // 4. Delivery detection
  if (
    normalized.includes("/delivery/") || 
    normalized.includes("/food/delivery") ||
    normalized.includes("/auth/delivery")
  ) return "delivery";

  return "user";
}

function getModuleFromConfig(config) {
  if (config?.contextModule) return config.contextModule;
  return getModuleFromUrl(config?.url);
}

const ACCESS_TOKEN_ALIASES = {
  seller: ["auth_seller"],
  bike_vendor: ["auth_bike_vendor"],
};

function getAccessToken(config) {
  const module = getModuleFromConfig(config);
  const key = `${module}_accessToken`;
  try {
    // 1. Try module-specific token first
    const moduleToken = localStorage.getItem(key);
    if (moduleToken) return moduleToken;

    const aliases = ACCESS_TOKEN_ALIASES[module] || [];
    for (const alias of aliases) {
      const aliasToken = localStorage.getItem(alias);
      if (aliasToken) return aliasToken;
    }
    
    // 2. Fallback to generic token only for non-admin modules
    if (module !== "admin") {
      return localStorage.getItem("accessToken") || null;
    }
    return null;
  } catch {
    return null;
  }
}

function getRefreshToken(module) {
  try {
    // 1. Try module-specific refresh token
    const moduleRefreshToken = localStorage.getItem(`${module}_refreshToken`);
    if (moduleRefreshToken) return moduleRefreshToken;
    
    // 2. Fallback to generic refresh token only for non-admin modules
    if (module !== "admin") {
      return localStorage.getItem("refreshToken") || null;
    }
    return null;
  } catch {
    return null;
  }
}

function clearModuleAuth(module) {
  try {
    localStorage.removeItem(`${module}_accessToken`);
    localStorage.removeItem(`${module}_refreshToken`);
    localStorage.removeItem(`${module}_authenticated`);
    localStorage.removeItem(`${module}_user`);
    if (module === "admin") {
      localStorage.removeItem("auth_admin");
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminInfo");
    } else if (module === "user") {
      localStorage.removeItem("auth_customer");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("token");
    }
  } catch (_) {}
}

let isRefreshing = false;
let refreshSubscribers = [];

function subscribeToRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(newToken, module) {
  refreshSubscribers.forEach((cb) => cb(newToken, module));
  refreshSubscribers = [];
}

function onRefreshFailed(module) {
  clearModuleAuth(module);
  // Fail any queued requests that were waiting for this refresh
  refreshSubscribers.forEach((cb) => cb(null, module));
  refreshSubscribers = [];

  if (typeof window !== "undefined") {
    redirectIfCurrentModule(module);
    window.dispatchEvent(new CustomEvent("authRefreshFailed", { detail: { module } }));
  }
}

function isFormDataBody(data) {
  if (!data || typeof data !== "object") return false;
  if (typeof FormData !== "undefined" && data instanceof FormData) return true;
  return Object.prototype.toString.call(data) === "[object FormData]";
}

function unsetJsonContentType(headers) {
  if (!headers) return;
  // Axios 1.x uses AxiosHeaders — `delete headers['Content-Type']` is a no-op.
  if (typeof headers.setContentType === "function") {
    headers.setContentType(false);
    return;
  }
  if (typeof headers.delete === "function") {
    headers.delete("Content-Type");
    headers.delete("content-type");
    return;
  }
  delete headers["Content-Type"];
  delete headers["content-type"];
}

apiClient.interceptors.request.use(
  (config) => {
    config.contextModule = getModuleFromConfig(config);

    // Multipart must *not* force Content-Type. Android WebView keeps
    // `multipart/form-data` without a boundary, and multer then sees no files
    // (e.g. "RC Front is required" on APK while web/local succeed).
    if (isFormDataBody(config.data)) {
      if (!config.headers) config.headers = {};
      unsetJsonContentType(config.headers);
      config.timeout = Math.max(Number(config.timeout) || 0, 120000);
    }

    const token = getAccessToken(config);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Attach context module as header for backend scoping (e.g. notifications)
    if (config.contextModule) {
      config.headers['x-context-module'] = config.contextModule;
    }

    attachSlowNetworkWatcher(config, () =>
      notifyNetworkStatus(ApiErrorCode.SLOW_NETWORK),
    );

    return config;
  },
  (err) => Promise.reject(err)
);

apiClient.interceptors.response.use(
  (response) => {
    clearRequestWatchers(response?.config);
    if (response?.data) {
      response.data = normalizeUploadUrls(response.data);
    }
    return response;
  },
  async (err) => {
    clearRequestWatchers(err?.config);
    const original = err?.config;
    if (err?.response?.status === 429) {
      return Promise.reject(err);
    }
    if (err?.response?.status !== 401 || !original || original._retry) {
      return Promise.reject(err);
    }
    const module = original.contextModule || getModuleFromUrl(original.url);
    // Was a token actually attached to this request? If not, this is likely an anonymous/guest
    // call to an optional endpoint — don't force a login redirect for those.
    const hadAccessToken = Boolean(original.headers?.Authorization);
    const refreshToken = getRefreshToken(module);
    if (!refreshToken) {
      clearModuleAuth(module);
      if (hadAccessToken) {
        redirectIfCurrentModule(module);
      }
      return Promise.reject(err);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeToRefresh((newToken) => {
          if (newToken) {
            original.headers.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(original));
          } else {
            reject(err);
          }
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      // Use relative URL so this works both with an explicit baseURL and with a dev proxy.
      // Use plain axios to avoid interceptor recursion.
      const refreshUrl = baseURL ? `${baseURL}/food/auth/refresh-token` : "/api/v1/food/auth/refresh-token";
      const { data } = await axios.post(refreshUrl, { refreshToken }, { timeout: 10000 });
      const newAccessToken = data?.data?.accessToken || data?.accessToken;
      if (newAccessToken) {
        try {
          localStorage.setItem(`${module}_accessToken`, newAccessToken);

          // Also sync legacy and global keys for consistency across the app
          if (module === "admin") {
            localStorage.setItem("adminToken", newAccessToken);
          }
          localStorage.setItem("accessToken", newAccessToken);

          // Also sync the "auth_*" keys AuthContext reads, and fire its expected event,
          // so AuthContext doesn't keep the stale (expired) token after a silent refresh here.
          const authContextKey = AUTH_CONTEXT_KEY_BY_MODULE[module];
          if (authContextKey) {
            localStorage.setItem(authContextKey, newAccessToken);
          }
          window.dispatchEvent(new Event(AUTH_CONTEXT_EVENT_BY_MODULE[module] || "userAuthChanged"));

          // Dispatch a custom event specifically for the module that refreshed
          window.dispatchEvent(new CustomEvent("authRefreshed", {
            detail: { module, token: newAccessToken }
          }));
        } catch (_) {}
        onRefreshed(newAccessToken, module);
        original.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(original);
      }
    } catch (_) {
      onRefreshFailed(module);
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }

    onRefreshFailed(module);
    return Promise.reject(err);
  }
);

export default apiClient;
