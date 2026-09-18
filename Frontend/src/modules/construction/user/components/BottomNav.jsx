import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { ClipboardList, FileText, HardHat, Home, User } from "lucide-react";
import UserBottomNav from "@/shared/layout/UserBottomNav";

/**
 * Construction customer tabs — redesign with modern glassmorphic bar
 * and rich glowing indicators.
 */
const ConstructionBottomNav = () => {
  const location = useLocation();

  const items = useMemo(() => {
    const path = location.pathname;
    const isHome =
      path === "/construction"
      || path === "/construction/"
      || path.startsWith("/construction/services");
    const isEnquiries =
      path.startsWith("/construction/enquiries")
      && !path.includes("/compare");
    const isQuotes =
      path.startsWith("/construction/quotations")
      || path.includes("/compare");
    const isProjects = path.startsWith("/construction/projects");
    const isProfile = path.startsWith("/construction/profile");

    return [
      { id: "home", label: "Home", icon: Home, to: "/construction", active: isHome },
      {
        id: "enquiries",
        label: "Enquiries",
        icon: ClipboardList,
        to: "/construction/enquiries",
        active: isEnquiries,
        fillWhenActive: false,
      },
      {
        id: "quotes",
        label: "My Quotes",
        icon: FileText,
        to: "/construction/quotations",
        active: isQuotes,
        fillWhenActive: false,
      },
      {
        id: "projects",
        label: "Projects",
        icon: HardHat,
        to: "/construction/projects",
        active: isProjects,
        fillWhenActive: false,
      },
      {
        id: "profile",
        label: "Profile",
        icon: User,
        to: "/construction/profile",
        active: isProfile,
        fillWhenActive: false,
      },
    ];
  }, [location.pathname]);

  return <UserBottomNav items={items} ariaLabel="Construction navigation" />;
};

export default React.memo(ConstructionBottomNav);

