/**
 * Post-login return-path helpers for user Food auth.
 *
 * Guards historically passed `state.from`; Login historically read `state.redirectTo`.
 * This module accepts both (plus `?redirect=` and sessionStorage) so return navigation
 * survives refresh and is consistent across ProtectedRoute / add-to-cart / cart.
 */

const STORAGE_KEY = "user_post_login_redirect_v1"

const AUTH_PATH_PREFIXES = [
  "/user/auth",
  "/food/user/auth",
  "/admin/login",
  "/admin/signup",
  "/admin/forgot-password",
  "/seller/auth",
  "/food/restaurant/auth",
  "/food/restaurant/login",
  "/food/restaurant/signup",
  "/food/restaurant/otp",
  "/food/restaurant/welcome",
  "/food/restaurant/forgot-password",
  "/food/delivery/auth",
  "/food/delivery/login",
]

/** Build pathname + search + hash from a string or React Router location-like object. */
export function getFullLocationPath(loc) {
  if (!loc) return ""
  if (typeof loc === "string") return loc.trim()
  const pathname = String(loc.pathname || "").trim()
  if (!pathname) return ""
  return `${pathname}${loc.search || ""}${loc.hash || ""}`
}

/** Reject auth pages, absolute URLs, and protocol-relative URLs (open-redirect / loops). */
export function isSafePostLoginPath(path) {
  if (!path || typeof path !== "string") return false
  const trimmed = path.trim()
  if (!trimmed.startsWith("/")) return false
  if (trimmed.startsWith("//")) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false

  const pathnameOnly = trimmed.split("?")[0].split("#")[0]
  if (!pathnameOnly || pathnameOnly === "/") return false

  return !AUTH_PATH_PREFIXES.some(
    (prefix) => pathnameOnly === prefix || pathnameOnly.startsWith(`${prefix}/`),
  )
}

export function rememberPostLoginRedirect(path) {
  if (!isSafePostLoginPath(path)) return
  try {
    sessionStorage.setItem(STORAGE_KEY, path.trim())
  } catch {
    // ignore
  }
}

export function peekPostLoginRedirect() {
  try {
    const value = sessionStorage.getItem(STORAGE_KEY)
    return isSafePostLoginPath(value) ? value.trim() : null
  } catch {
    return null
  }
}

export function clearPostLoginRedirect() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function consumePostLoginRedirect() {
  const value = peekPostLoginRedirect()
  clearPostLoginRedirect()
  return value
}

/**
 * Resolve where to send the user after a successful login.
 * Priority: state.redirectTo → state.from → ?redirect= / ?from= → sessionStorage → default.
 */
export function resolvePostLoginRedirect({
  location,
  searchParams,
  defaultPath = "/portal",
} = {}) {
  const params =
    searchParams ||
    (typeof location?.search === "string"
      ? new URLSearchParams(location.search)
      : null)

  const candidates = [
    location?.state?.redirectTo,
    getFullLocationPath(location?.state?.from),
    params?.get?.("redirect"),
    params?.get?.("from"),
    peekPostLoginRedirect(),
  ]

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue
    let decoded = candidate.trim()
    try {
      // Query params may be URI-encoded once.
      if (decoded.includes("%")) decoded = decodeURIComponent(decoded)
    } catch {
      // keep raw
    }
    if (isSafePostLoginPath(decoded)) {
      rememberPostLoginRedirect(decoded)
      return decoded
    }
  }

  return defaultPath
}

/** State object to pass when navigating to the login page. */
export function buildLoginRedirectState(fromLocation) {
  const path = getFullLocationPath(fromLocation)
  if (!isSafePostLoginPath(path)) return {}
  rememberPostLoginRedirect(path)
  return {
    from: path,
    redirectTo: path,
  }
}

/**
 * Navigate to login while preserving the current route for post-login return.
 */
export function navigateToLogin(
  navigate,
  fromLocation,
  {
    loginPath = "/user/auth/login",
    replace = false,
  } = {},
) {
  if (typeof navigate !== "function") return
  navigate(loginPath, {
    replace,
    state: buildLoginRedirectState(fromLocation),
  })
}

/**
 * Soft redirect for session expiry — keep current URL so login can return here.
 */
export function redirectToLoginWithReturn(loginPath = "/user/auth/login") {
  if (typeof window === "undefined") return
  const current = `${window.location.pathname || ""}${window.location.search || ""}${window.location.hash || ""}`
  if (isSafePostLoginPath(current)) {
    rememberPostLoginRedirect(current)
  }
  const url = isSafePostLoginPath(current)
    ? `${loginPath}?redirect=${encodeURIComponent(current)}`
    : loginPath
  window.location.href = url
}
