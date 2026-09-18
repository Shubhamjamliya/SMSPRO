import { Tag, User, Truck, UtensilsCrossed } from "lucide-react"
import { useLocation } from "react-router-dom"
import { useAuth } from "@core/context/AuthContext"
import UserBottomNav from "@/shared/layout/UserBottomNav"

export default function BottomNavigation() {
  const location = useLocation()
  const { isAuthenticated } = useAuth()
  const pathname = location.pathname
  const profileSource = new URLSearchParams(location.search).get("from")

  const isDining = pathname === "/food/dining" || pathname.startsWith("/food/user/dining")
  const isUnder250 = pathname === "/food/under-250" || pathname.startsWith("/food/user/under-250")
  const isSharedFoodProfile =
    (pathname === "/profile" || pathname.startsWith("/profile/")) &&
    profileSource !== "quick"
  const isProfile =
    pathname.startsWith("/food/profile") ||
    pathname.startsWith("/food/user/profile") ||
    isSharedFoodProfile
  const isDelivery =
    !isDining &&
    !isUnder250 &&
    !isProfile &&
    (pathname === "/food" ||
      pathname === "/food/" ||
      pathname === "/food/user" ||
      (pathname.startsWith("/food/user") &&
        !pathname.includes("/dining") &&
        !pathname.includes("/under-250") &&
        !pathname.includes("/profile")))

  const items = [
    { id: "delivery", label: "Delivery", icon: Truck, to: "/food/user", active: isDelivery },
    {
      id: "dining",
      label: "Dining",
      icon: UtensilsCrossed,
      to: "/food/user/dining",
      active: isDining,
      fillWhenActive: false,
    },
    { id: "under-250", label: "Under 250", icon: Tag, to: "/food/user/under-250", active: isUnder250 },
    {
      id: "profile",
      label: "Profile",
      icon: User,
      to: isAuthenticated ? "/food/user/profile" : "/user/auth/login",
      state: !isAuthenticated ? { redirectTo: "/food/user/profile" } : undefined,
      active: isProfile,
    },
  ]

  return <UserBottomNav items={items} ariaLabel="Food navigation" />
}
