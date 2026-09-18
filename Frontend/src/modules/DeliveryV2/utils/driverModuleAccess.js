import { toast } from "sonner";
import {
  getDriverOnboardingDraft,
  getMyDriverOnboarding,
} from "@/modules/common/api/driverOnboarding";
import {
  emptySignupDetails,
  saveSignupDetails,
  setResubmitModules,
} from "./signupDraft";
import { resetOnboardingClientStateForPhone } from "./signupSubmit";
import { applyServerOnboardingToClient } from "./onboardingDraftApi";

export const DRIVER_MODULE_LABELS = {
  food: "Food Delivery",
  "quick-commerce": "Quick Commerce",
  porter: "Porter",
  parcel: "Parcel",
  taxi: "Taxi",
  "bike-rent": "Bike Rent",
};

/** Short labels for the feed module switcher (Admin-style). */
export const DRIVER_MODULE_SHORT_LABELS = {
  food: "Food",
  "quick-commerce": "Quick",
  porter: "Porter",
  parcel: "Parcel",
  taxi: "Taxi",
  "bike-rent": "Bike",
};

export const DRIVER_SWITCHER_MODULE_ORDER = [
  "food",
  "quick-commerce",
  "porter",
  "taxi",
  "bike-rent",
];

export const normalizeDriverModuleKey = (raw) => {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (key === "quick" || key === "quickcommerce" || key === "quick-commerce") {
    return "quick-commerce";
  }
  if (key === "bikerent" || key === "bike" || key === "bike-rent") {
    return "bike-rent";
  }
  return key;
};

export const getModuleDisplayName = (moduleKey) => {
  const key = normalizeDriverModuleKey(moduleKey);
  return (
    DRIVER_MODULE_LABELS[key] ||
    key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
    "Module"
  );
};

export const getModuleShortLabel = (moduleKey) => {
  const key = normalizeDriverModuleKey(moduleKey);
  return (
    DRIVER_MODULE_SHORT_LABELS[key] ||
    getModuleDisplayName(key).split(" ")[0] ||
    "Module"
  );
};

export const getAuthorizedServicesFromUser = (user) => {
  if (Array.isArray(user?.authorizedServices) && user.authorizedServices.length) {
    return user.authorizedServices.map((k) => normalizeDriverModuleKey(k));
  }
  if (Array.isArray(user?.enrollments)) {
    return user.enrollments
      .filter((item) => item?.status === "approved" && item?.module)
      .map((item) => normalizeDriverModuleKey(item.module));
  }
  return [];
};

/**
 * Flatten profile enrollments from array or registeredServices map.
 * Excludes not_registered (never applied).
 */
export const flattenDriverEnrollments = (profileOrUser) => {
  if (!profileOrUser) return [];
  if (Array.isArray(profileOrUser.enrollments)) {
    return profileOrUser.enrollments
      .filter(
        (item) =>
          item?.module &&
          item.status &&
          item.status !== "not_registered",
      )
      .map((item) => ({
        ...item,
        module: normalizeDriverModuleKey(item.module),
        status: String(item.status || "pending"),
      }));
  }
  if (
    profileOrUser.registeredServices &&
    typeof profileOrUser.registeredServices === "object"
  ) {
    return Object.entries(profileOrUser.registeredServices)
      .filter(([, value]) => value?.status && value.status !== "not_registered")
      .map(([module, value]) => ({
        module: normalizeDriverModuleKey(module),
        ...value,
        status: String(value.status || "pending"),
      }));
  }
  // Authorized-only fallback (approved chips)
  const authorized = getAuthorizedServicesFromUser(profileOrUser);
  return authorized.map((module) => ({
    module: normalizeDriverModuleKey(module),
    status: "approved",
  }));
};

export const getApprovedModulesFromEnrollments = (enrollments = []) =>
  (Array.isArray(enrollments) ? enrollments : [])
    .filter((item) => item?.status === "approved" && item?.module)
    .map((item) => normalizeDriverModuleKey(item.module));

/** Ordered list for switcher UI (applied modules only). */
export const orderSwitcherEnrollments = (enrollments = []) => {
  const list = Array.isArray(enrollments) ? [...enrollments] : [];
  list.sort((a, b) => {
    const ai = DRIVER_SWITCHER_MODULE_ORDER.indexOf(
      normalizeDriverModuleKey(a.module),
    );
    const bi = DRIVER_SWITCHER_MODULE_ORDER.indexOf(
      normalizeDriverModuleKey(b.module),
    );
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  return list;
};

export const driverHasApprovedModule = (user) =>
  getAuthorizedServicesFromUser(user).length > 0;

export const readStoredDeliveryUser = () => {
  try {
    const raw = localStorage.getItem("delivery_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** True only when the driver has zero approved modules. */
export const isDeliveryOnboardingOnlyGate = () => {
  if (typeof sessionStorage === "undefined") return false;
  if (sessionStorage.getItem("deliveryOnboardingOnly") !== "true") return false;

  const user = readStoredDeliveryUser();
  if (driverHasApprovedModule(user)) {
    sessionStorage.removeItem("deliveryOnboardingOnly");
    return false;
  }
  return true;
};

export const clearDeliveryOnboardingOnlyGate = () => {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem("deliveryOnboardingOnly");
};

export const setDeliveryOnboardingOnlyGate = () => {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem("deliveryOnboardingOnly", "true");
};

/**
 * True when this browser session should not hit driver work APIs
 * (orders, availability, etc.). Used by realtime/shell to avoid 403 toasts
 * during signup / pending verification.
 */
export const isDeliveryWorkFeaturesBlocked = () => {
  if (isDeliveryOnboardingOnlyGate()) return true;

  try {
    const token = localStorage.getItem("delivery_accessToken");
    if (!token) return false;
    // Lazy import avoided — decode inline (JWT base64url)
    const parts = String(token).split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (payload?.scope !== "onboarding") return false;
    const authorized = Array.isArray(payload?.authorizedServices)
      ? payload.authorizedServices
      : [];
    if (authorized.length > 0) return false;
    return !driverHasApprovedModule(readStoredDeliveryUser());
  } catch {
    return false;
  }
};

export const formatModuleDate = (value) => {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
};

export const getEnrollmentAppliedAt = (item) =>
  item?.firstSubmittedAt || item?.appliedAt || item?.submittedAt || null;

export const getEnrollmentLastUpdated = (item) =>
  item?.lastResubmittedAt ||
  item?.approvedAt ||
  item?.rejectedAt ||
  item?.submittedAt ||
  item?.appliedAt ||
  null;

export const enrollmentStatusLabel = (item) => {
  const itemStatus = item?.status || "pending";
  if (itemStatus === "pending" && item?.isResubmission) {
    return "Pending Review After Resubmission";
  }
  if (itemStatus === "documents_required") return "Documents Required";
  if (itemStatus === "pending") return "Pending Approval";
  if (itemStatus === "approved") return "Approved";
  if (itemStatus === "rejected") return "Rejected";
  return itemStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * Prefill the multi-step signup flow for Edit & Resubmit of one module.
 */
export const beginModuleEditResubmit = async ({
  enrollment,
  phone,
  navigate,
}) => {
  const digits = String(phone || "")
    .replace(/\D/g, "")
    .slice(-10);

  setResubmitModules(enrollment?.module ? [enrollment.module] : []);
  sessionStorage.setItem("deliveryNeedsRegistration", "true");
  sessionStorage.setItem("deliveryIsRejected", "true");
  if (enrollment?.rejectionReason) {
    sessionStorage.setItem(
      "deliveryRejectionReason",
      enrollment.rejectionReason,
    );
  } else {
    sessionStorage.removeItem("deliveryRejectionReason");
  }
  sessionStorage.removeItem("deliveryDocumentsRequested");
  sessionStorage.removeItem("deliveryDocumentsRequired");

  resetOnboardingClientStateForPhone(digits);

  let onboarding = null;
  try {
    onboarding =
      (await getDriverOnboardingDraft()) || (await getMyDriverOnboarding());
  } catch (error) {
    try {
      onboarding = await getMyDriverOnboarding();
    } catch (inner) {
      toast.error(
        inner?.response?.data?.message ||
          error?.response?.data?.message ||
          "Could not load your previous application. Please log in again.",
      );
      navigate("/food/delivery/login", {
        replace: true,
        state: { resumeResubmit: true, module: enrollment?.module },
      });
      return false;
    }
  }

  const hydrated = applyServerOnboardingToClient(onboarding, {
    preferredModule: enrollment?.module || null,
    rejectionReason: enrollment?.rejectionReason || "",
    documentsRequested: enrollment?.documentsRequested || [],
  });

  try {
    localStorage.setItem("delivery_user", JSON.stringify(onboarding));
  } catch {
    /* ignore */
  }

  if (!hydrated?.details?.phone && digits) {
    saveSignupDetails({
      ...(hydrated?.details || emptySignupDetails()),
      phone: digits,
      countryCode: "+91",
    });
  }

  navigate("/food/delivery/signup/details");
  return true;
};
