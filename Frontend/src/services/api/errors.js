/**
 * Centralized API error classification & friendly messaging.
 * Attach `error.normalized` on every failed request so UI never needs to parse Axios/Mongo/etc.
 */

export const ApiErrorCode = Object.freeze({
  OFFLINE: "OFFLINE",
  SLOW_NETWORK: "SLOW_NETWORK",
  TIMEOUT: "TIMEOUT",
  CANCELLED: "CANCELLED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION: "VALIDATION",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  SERVER: "SERVER",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  GATEWAY_TIMEOUT: "GATEWAY_TIMEOUT",
  NETWORK: "NETWORK",
  UNKNOWN: "UNKNOWN",
});

const FRIENDLY = Object.freeze({
  [ApiErrorCode.OFFLINE]: "You're offline. Please check your internet connection.",
  [ApiErrorCode.SLOW_NETWORK]: "Your connection appears to be slow. Please wait a moment.",
  [ApiErrorCode.TIMEOUT]: "The request is taking longer than expected. Please try again.",
  [ApiErrorCode.CANCELLED]: "The request was cancelled.",
  [ApiErrorCode.UNAUTHORIZED]: "Your session has expired. Please log in again.",
  [ApiErrorCode.FORBIDDEN]: "You don't have permission to perform this action.",
  [ApiErrorCode.VALIDATION]: "Please check your input and try again.",
  [ApiErrorCode.NOT_FOUND]: "We couldn't find what you're looking for.",
  [ApiErrorCode.CONFLICT]: "This action conflicts with the current state. Please refresh and try again.",
  [ApiErrorCode.RATE_LIMITED]: "Too many requests. Please wait a moment and try again.",
  [ApiErrorCode.SERVER]: "Something went wrong on our server. Please try again later.",
  [ApiErrorCode.SERVICE_UNAVAILABLE]: "Our services are temporarily unavailable. Please try again later.",
  [ApiErrorCode.GATEWAY_TIMEOUT]: "The server took too long to respond. Please try again.",
  [ApiErrorCode.NETWORK]: "Unable to reach the server. Please check your connection and try again.",
  [ApiErrorCode.UNKNOWN]: "Something went wrong. Please try again.",
});

const RETRYABLE = new Set([
  ApiErrorCode.TIMEOUT,
  ApiErrorCode.NETWORK,
  ApiErrorCode.SERVER,
  ApiErrorCode.SERVICE_UNAVAILABLE,
  ApiErrorCode.GATEWAY_TIMEOUT,
]);

const TECHNICAL_PATTERNS = [
  /axios/i,
  /failed to fetch/i,
  /network\s*error/i,
  /econnaborted/i,
  /etimedout/i,
  /mongo/i,
  /mongoose/i,
  /cast to objectid/i,
  /validationerror/i,
  /sequelize/i,
  /sql/i,
  /stack\s*trace/i,
  /at\s+\S+\s+\(/i,
  /internal server error/i,
  /errno/i,
  /enotfound/i,
  /certificate/i,
];

function isBrowserOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isTechnicalMessage(message) {
  if (!message || typeof message !== "string") return true;
  if (message.length > 220) return true;
  return TECHNICAL_PATTERNS.some((re) => re.test(message));
}

function pickServerMessage(error) {
  const data = error?.response?.data;
  if (!data || typeof data !== "object") return "";
  const candidates = [data.message, data.error, data.msg, data.title];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  if (Array.isArray(data.errors) && data.errors[0]) {
    const first = data.errors[0];
    if (typeof first === "string") return first;
    if (typeof first?.message === "string") return first.message;
  }
  return "";
}

/**
 * Classify a raw Axios/fetch-like error into ApiErrorCode.
 */
export function classifyApiError(error) {
  if (!error) return ApiErrorCode.UNKNOWN;

  if (error.code === "ERR_CANCELED" || error.name === "CanceledError" || error.name === "AbortError") {
    return ApiErrorCode.CANCELLED;
  }

  if (isBrowserOffline() || error.message === "Network Error" || error.code === "ERR_NETWORK") {
    return isBrowserOffline() ? ApiErrorCode.OFFLINE : ApiErrorCode.NETWORK;
  }

  if (
    error.code === "ECONNABORTED" ||
    /timeout/i.test(String(error.message || "")) ||
    error.response?.status === 408
  ) {
    return ApiErrorCode.TIMEOUT;
  }

  const status = Number(error.response?.status) || 0;
  if (status === 401) return ApiErrorCode.UNAUTHORIZED;
  if (status === 403) return ApiErrorCode.FORBIDDEN;
  if (status === 404) return ApiErrorCode.NOT_FOUND;
  if (status === 409) return ApiErrorCode.CONFLICT;
  if (status === 429) return ApiErrorCode.RATE_LIMITED;
  if (status === 400 || status === 422) return ApiErrorCode.VALIDATION;
  if (status === 503) return ApiErrorCode.SERVICE_UNAVAILABLE;
  if (status === 504) return ApiErrorCode.GATEWAY_TIMEOUT;
  if (status >= 500) return ApiErrorCode.SERVER;

  return ApiErrorCode.UNKNOWN;
}

/**
 * Build a normalized error object and attach it to `error.normalized`.
 */
export function normalizeApiError(error, overrides = {}) {
  const code = overrides.code || classifyApiError(error);
  const status = Number(error?.response?.status) || null;
  const serverMessage = pickServerMessage(error);
  const useServer =
    Boolean(serverMessage) &&
    !isTechnicalMessage(serverMessage) &&
    [ApiErrorCode.VALIDATION, ApiErrorCode.CONFLICT, ApiErrorCode.FORBIDDEN, ApiErrorCode.NOT_FOUND].includes(
      code,
    );

  const message = overrides.message || (useServer ? serverMessage : FRIENDLY[code] || FRIENDLY[ApiErrorCode.UNKNOWN]);
  const retryable = overrides.retryable ?? RETRYABLE.has(code);
  const silent =
    Boolean(overrides.silent) ||
    code === ApiErrorCode.CANCELLED ||
    Boolean(error?.config?.silent) ||
    Boolean(error?.config?.skipErrorToast) ||
    Boolean(error?.config?.background);

  const normalized = {
    code,
    status,
    message,
    retryable,
    silent,
    method: String(error?.config?.method || "").toUpperCase() || null,
    url: error?.config?.url || null,
  };

  if (error && typeof error === "object") {
    error.normalized = normalized;
    // Prefer friendly message when callers use error.message
    if (!error._friendlyMessageAttached) {
      try {
        Object.defineProperty(error, "userMessage", {
          value: message,
          enumerable: false,
          configurable: true,
        });
      } catch {
        error.userMessage = message;
      }
      error._friendlyMessageAttached = true;
    }
  }

  return normalized;
}

export function getApiErrorMessage(error, fallback = FRIENDLY[ApiErrorCode.UNKNOWN]) {
  if (!error) return fallback;
  if (error.normalized?.message) return error.normalized.message;
  const normalized = normalizeApiError(error);
  return normalized.message || fallback;
}

export function isRetryableApiError(error) {
  const code = error?.normalized?.code || classifyApiError(error);
  return RETRYABLE.has(code);
}

export function getFriendlyMessageForCode(code) {
  return FRIENDLY[code] || FRIENDLY[ApiErrorCode.UNKNOWN];
}

export { FRIENDLY as API_ERROR_MESSAGES, RETRYABLE as RETRYABLE_ERROR_CODES };
