import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Home, Car, LifeBuoy, User } from "lucide-react";
import UserBottomNav from "@/shared/layout/UserBottomNav";
import {
  getTaxiHomePath,
  getTaxiRidesPath,
  getTaxiSupportPath,
  getTaxiProfilePath,
} from "../../utils/routes";

const TaxiBottomNav = () => {
  const location = useLocation();
  const items = useMemo(() => {
    const isHome = location.pathname === "/taxi" || location.pathname === "/taxi/";
    const isRides = location.pathname.startsWith(getTaxiRidesPath());
    const isSupport = location.pathname.startsWith("/taxi/support");
    const isProfile = location.pathname.startsWith("/taxi/profile");

    return [
      { id: "home", label: "Home", icon: Home, to: getTaxiHomePath(), active: isHome },
      { id: "rides", label: "Rides", icon: Car, to: getTaxiRidesPath(), active: isRides },
      { id: "support", label: "Support", icon: LifeBuoy, to: getTaxiSupportPath(), active: isSupport, fillWhenActive: false },
      { id: "profile", label: "Profile", icon: User, to: getTaxiProfilePath(), active: isProfile },
    ];
  }, [location.pathname]);

  return <UserBottomNav items={items} ariaLabel="Taxi navigation" />;
};

export default React.memo(TaxiBottomNav);
