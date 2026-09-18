import { Navigate } from "react-router-dom";
import {
  CONTRACTOR_LOGIN_PATH,
  getContractorUser,
  hasContractorSession,
} from "../utils/authContractor";

const statusOf = (contractor) => String(contractor?.status || "").toLowerCase();

/**
 * Steers a contractor to the screen that matches how far their registration has
 * got, so nobody lands on a dashboard they cannot use or a form they already
 * submitted. Mirrors ServiceProviderProtectedRoute.
 */
export default function ContractorProtectedRoute({
  children,
  allowOnboarding = false,
  allowPending = false,
  requireApproved = false,
}) {
  if (!hasContractorSession()) {
    return <Navigate to={CONTRACTOR_LOGIN_PATH} replace />;
  }

  const status = statusOf(getContractorUser());

  if (requireApproved && status !== "approved") {
    return <Navigate to={status === "pending_approval" ? "/contractor/status" : "/contractor/register"} replace />;
  }

  // A submitted application must not drop back into the editable form — the
  // server refuses those writes anyway, so the UI would only produce errors.
  if (status === "pending_approval" && !allowPending && !requireApproved) {
    return <Navigate to="/contractor/status" replace />;
  }

  // Onboarding and rejected both belong in the form: a rejection is resubmitted
  // through the same wizard, prefilled with what was turned down.
  if ((status === "onboarding" || status === "rejected") && !allowOnboarding && !requireApproved) {
    return <Navigate to="/contractor/register" replace />;
  }

  return children;
}
