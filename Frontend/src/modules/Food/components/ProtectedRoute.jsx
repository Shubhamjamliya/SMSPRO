import { Navigate, useLocation } from "react-router-dom";
import { isModuleAuthenticated } from "@food/utils/auth";
import { buildLoginRedirectState } from "@core/utils/postLoginRedirect";

/**
 * Role-based Protected Route Component
 * Only allows access if user is authenticated for the specific module
 */
export default function ProtectedRoute({ children, requiredRole, loginPath = "/user/auth/login" }) {
  const location = useLocation();

  // If no role required, allow access
  if (!requiredRole) {
    return children;
  }

  const isAuthenticated = isModuleAuthenticated(requiredRole);

  // If not authenticated for this module, redirect to login (preserve full route for return).
  if (!isAuthenticated) {
    return (
      <Navigate
        to={loginPath}
        state={buildLoginRedirectState(location)}
        replace
      />
    );
  }

  return children;
}
