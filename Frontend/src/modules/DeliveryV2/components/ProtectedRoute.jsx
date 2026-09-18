import { Navigate, useLocation } from "react-router-dom"
import { isModuleAuthenticated } from "@food/utils/auth"
import { isDeliveryOnboardingOnlyGate } from "../utils/driverModuleAccess"

const ONBOARDING_ALLOWED_PREFIXES = [
  "/food/delivery/verification",
  "/food/delivery/signup",
  "/food/delivery/profile",
]

export default function ProtectedRoute({ children }) {
  const location = useLocation()
  const isAuthenticated = isModuleAuthenticated("delivery")

  if (!isAuthenticated) {
    return <Navigate to="/food/delivery/login" state={{ from: location.pathname }} replace />
  }

  // Block work routes only when the driver has zero approved modules.
  // Mixed pending/approved enrollments must still reach the shared dashboard.
  const onboardingOnly = isDeliveryOnboardingOnlyGate()

  if (onboardingOnly) {
    const allowed = ONBOARDING_ALLOWED_PREFIXES.some((prefix) =>
      location.pathname.startsWith(prefix),
    )
    if (!allowed) {
      return <Navigate to="/food/delivery/verification" replace />
    }
  }

  return children
}
