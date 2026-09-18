/**
 * Step-wise onboarding validation UX helpers.
 * Field-level error presentation (scroll / focus) and incomplete-step routing.
 */
import {
  validateAddressStep,
  validatePersonalStep,
  validateVehicleStep,
} from "./signupDraft";

const escapeAttr = (value) =>
  String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/**
 * Scroll to and focus the first invalid field for a step's error map.
 * Looks up `name`, then `data-field`, then `id`.
 * @param {Record<string, string>} errors
 */
export const focusFirstInvalidField = (errors = {}) => {
  if (typeof document === "undefined") return;
  const firstKey = Object.keys(errors).find((key) => Boolean(errors[key]));
  if (!firstKey) return;

  const escaped = escapeAttr(firstKey);
  const el =
    document.querySelector(`[name="${escaped}"]`) ||
    document.querySelector(`[data-field="${escaped}"]`) ||
    document.getElementById(firstKey);

  if (!el) return;

  el.scrollIntoView({ behavior: "smooth", block: "center" });

  const focusable = el.matches?.(
    "input, select, textarea, button, [tabindex]:not([tabindex='-1'])",
  )
    ? el
    : el.querySelector?.(
        "input, select, textarea, button, [tabindex]:not([tabindex='-1'])",
      );

  if (focusable && typeof focusable.focus === "function") {
    try {
      focusable.focus({ preventScroll: true });
    } catch {
      focusable.focus();
    }
  }
};

/**
 * Earliest incomplete step before review/submit (excludes bank + docs).
 * Used so final Submit redirects instead of dumping Step 1/2 errors on review.
 *
 * @param {object} formData
 * @param {{ modules?: array }} options
 * @returns {{ path: string, message: string } | null}
 */
export const findFirstIncompleteSignupRoute = (formData, options = {}) => {
  if (Object.keys(validatePersonalStep(formData)).length) {
    return {
      path: "/food/delivery/signup/details",
      message: "Please complete personal details first",
    };
  }
  if (Object.keys(validateAddressStep(formData)).length) {
    return {
      path: "/food/delivery/signup/address",
      message: "Please complete address details first",
    };
  }
  if (Object.keys(validateVehicleStep(formData, options)).length) {
    return {
      path: "/food/delivery/signup/documents",
      message: "Please complete vehicle details first",
    };
  }
  return null;
};
