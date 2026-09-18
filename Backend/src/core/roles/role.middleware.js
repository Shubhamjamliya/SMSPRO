import { sendError } from "../../utils/response.js";

export const requireRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return sendError(res, 401, "Not authenticated");
    }

    const userRole = String(req.user.role).toUpperCase();
    const allowedSet = new Set(
      allowedRoles.map((r) => String(r).toUpperCase()),
    );
    if (!allowedSet.has(userRole)) {
      return sendError(res, 403, "Forbidden: insufficient permissions");
    }

    next();
  };
};

/**
 * Blocks onboarding-scoped driver tokens from work APIs unless the driver
 * already has at least one approved module (authorizedServices from DB).
 * Mixed enrollments (e.g. Food pending + Taxi approved) must unlock the
 * shared dashboard and approved-module work features.
 */
export const requireFullDriverAccess = (req, res, next) => {
  if (
    req.user?.role === "DELIVERY_PARTNER" &&
    req.user?.scope === "onboarding"
  ) {
    const authorized = Array.isArray(req.user?.authorizedServices)
      ? req.user.authorizedServices
      : [];
    if (authorized.length === 0) {
      return sendError(
        res,
        403,
        "Complete module approval before accessing driver work features",
      );
    }
    // Elevate for this request — enrollments are the source of truth.
    req.user.scope = "full";
  }
  next();
};

/** Requires the driver to be authorized for a specific module */
export const requireAuthorizedModule = (moduleKey) => {
  return (req, res, next) => {
    if (req.user?.role !== "DELIVERY_PARTNER") return next();
    const authorized = Array.isArray(req.user?.authorizedServices)
      ? req.user.authorizedServices
      : [];
    if (req.user?.scope === "onboarding" && authorized.length === 0) {
      return sendError(res, 403, "Module access requires approval");
    }
    if (moduleKey && !authorized.includes(moduleKey)) {
      return sendError(res, 403, `Not authorized for module: ${moduleKey}`);
    }
    next();
  };
};
