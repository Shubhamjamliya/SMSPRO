import { Navigate } from "react-router-dom";
import {
  SERVICE_PROVIDER_LOGIN_PATH,
  getServiceProviderUser,
  hasServiceProviderSession,
} from "../utils/authServiceProvider";

const normalizeProviderStatus = (provider) => String(provider?.status || "").toLowerCase();

/** Protects service provider routes. Onboarding/pending/rejected providers are steered to status pages. */
export default function ServiceProviderProtectedRoute({
  children,
  allowOnboarding = false,
  allowPending = false,
  allowRejected = false,
  requireApproved = false,
}) {
  if (!hasServiceProviderSession()) {
    return <Navigate to={SERVICE_PROVIDER_LOGIN_PATH} replace />;
  }

  const provider = getServiceProviderUser();
  const status = normalizeProviderStatus(provider);

  if (requireApproved && status !== "approved") {
    if (status === "pending_approval") {
      return <Navigate to="/service-provider/pending" replace />;
    }
    return <Navigate to="/service-provider/onboarding" replace />;
  }

  if (status === "onboarding" && !allowOnboarding && !requireApproved) {
    return <Navigate to="/service-provider/onboarding" replace />;
  }

  if (status === "pending_approval" && !allowPending && !requireApproved) {
    return <Navigate to="/service-provider/pending" replace />;
  }

  if (status === "rejected" && !allowRejected && !requireApproved) {
    return <Navigate to="/service-provider/onboarding" replace />;
  }

  return children;
}
