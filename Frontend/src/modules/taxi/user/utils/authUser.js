import { isModuleAuthenticated } from "@food/utils/auth";
import { buildLoginRedirectState } from "@core/utils/postLoginRedirect";

export const TAXI_USER_LOGIN_PATH = "/user/auth/login";

export function isTaxiUserLoggedIn() {
  return isModuleAuthenticated("user");
}

/** Navigate to shared user login and return here after success. */
export function redirectToTaxiLogin(navigate, locationOrPath) {
  const state =
    typeof locationOrPath === "string"
      ? buildLoginRedirectState({ pathname: locationOrPath })
      : buildLoginRedirectState(locationOrPath);
  navigate(TAXI_USER_LOGIN_PATH, { state, replace: false });
}

export function getProfileDisplayName(user) {
  if (!user) return "";
  const name =
    user.name ||
    user.fullName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    "";
  return String(name).trim();
}

export function getProfilePhone(user) {
  if (!user) return "";
  return String(user.phone || user.mobile || user.phoneNumber || "").trim();
}

export function getProfileEmail(user) {
  if (!user) return "";
  return String(user.email || "").trim();
}

export function getProfileInitials(user) {
  const name = getProfileDisplayName(user);
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const phone = getProfilePhone(user);
  if (phone) return phone.slice(-2);
  return "U";
}

export function getProfileImageUrl(user) {
  if (!user) return null;
  const raw = user.profileImage ?? user.avatar ?? user.photoUrl ?? null;
  if (!raw) return null;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s || s === "null" || s === "undefined") return null;
    return s;
  }
  if (typeof raw === "object" && typeof raw.url === "string") {
    const s = raw.url.trim();
    return s || null;
  }
  return null;
}
