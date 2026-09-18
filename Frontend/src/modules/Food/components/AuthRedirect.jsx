import { Navigate, useLocation } from "react-router-dom"
import { isModuleAuthenticated } from "@food/utils/auth"
import {
  resolvePostLoginRedirect,
  clearPostLoginRedirect,
} from "@core/utils/postLoginRedirect"

/**
 * AuthRedirect Component
 * Redirects authenticated users away from auth pages.
 * Prefer a preserved return path when available.
 */
export default function AuthRedirect({ children, module, redirectTo = null }) {
  const location = useLocation()
  const isAuthenticated = isModuleAuthenticated(module)

  const moduleHomePages = {
    user: "/food/user",
    restaurant: "/food/restaurant",
    delivery: "/food/delivery",
    admin: "/food/admin",
  }

  if (isAuthenticated) {
    const homePath = redirectTo || moduleHomePages[module] || "/food/user"
    const target = resolvePostLoginRedirect({
      location,
      searchParams: new URLSearchParams(location.search || ""),
      defaultPath: homePath,
    })
    clearPostLoginRedirect()
    return <Navigate to={target} replace />
  }

  return <>{children}</>
}
