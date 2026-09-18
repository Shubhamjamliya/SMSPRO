import { Navigate } from "react-router-dom";
import {
  BIKE_VENDOR_LOGIN_PATH,
  getBikeVendorUser,
  hasBikeVendorSession,
  normalizeVendorStatus,
} from "../utils/authVendor";

/**
 * Protects bike vendor routes. Pending/rejected vendors are steered to status pages.
 */
export default function VendorProtectedRoute({
  children,
  allowPending = false,
  allowRejected = false,
  requireApproved = false,
}) {
  if (!hasBikeVendorSession()) {
    return <Navigate to={BIKE_VENDOR_LOGIN_PATH} replace />;
  }

  const vendor = getBikeVendorUser();
  const status = normalizeVendorStatus(vendor);

  if (requireApproved && status !== "approved") {
    if (status === "pending") {
      return <Navigate to="/bike-rent/vendor/pending" replace />;
    }
    if (status === "rejected") {
      return <Navigate to="/bike-rent/vendor/onboarding" replace />;
    }
    return <Navigate to="/bike-rent/vendor/onboarding" replace />;
  }

  if (status === "pending" && !allowPending && !requireApproved) {
    return <Navigate to="/bike-rent/vendor/pending" replace />;
  }

  if (status === "rejected" && !allowRejected && !requireApproved) {
    return <Navigate to="/bike-rent/vendor/onboarding" replace />;
  }

  return children;
}
