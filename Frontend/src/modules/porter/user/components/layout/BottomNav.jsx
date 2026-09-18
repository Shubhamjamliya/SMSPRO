import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Home, Package, User } from "lucide-react";
import UserBottomNav from "@/shared/layout/UserBottomNav";
import { getPorterHomePath, getPorterShipmentsPath, getPorterProfilePath } from "../../utils/routes";

const PorterBottomNav = () => {
  const location = useLocation();
  const items = useMemo(() => {
    const isHome = location.pathname === "/porter" || location.pathname === "/porter/";
    const isShipments = location.pathname.startsWith("/porter/shipments");
    const isAccount =
      location.pathname === "/profile" || location.pathname.startsWith("/profile/");

    return [
      { id: "home", label: "Home", icon: Home, to: getPorterHomePath(), active: isHome },
      { id: "shipments", label: "Shipments", icon: Package, to: getPorterShipmentsPath(), active: isShipments, fillWhenActive: false },
      { id: "account", label: "Account", icon: User, to: getPorterProfilePath(), active: isAccount },
    ];
  }, [location.pathname]);

  return <UserBottomNav items={items} ariaLabel="Porter navigation" />;
};

export default React.memo(PorterBottomNav);
