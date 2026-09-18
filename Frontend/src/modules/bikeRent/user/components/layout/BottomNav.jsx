import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Home, ClipboardList, LifeBuoy, User } from "lucide-react";
import UserBottomNav from "@/shared/layout/UserBottomNav";
import {
  getBikeRentHomePath,
  getBikeRentBookingsPath,
  getBikeRentSupportPath,
  getBikeRentProfilePath,
} from "../../utils/routes";

const BikeRentBottomNav = () => {
  const location = useLocation();
  const items = useMemo(() => {
    const isHome =
      location.pathname === "/bike-rent" ||
      location.pathname === "/bike-rent/" ||
      location.pathname.startsWith("/bike-rent/browse") ||
      location.pathname.startsWith("/bike-rent/bikes");
    const isBookings =
      location.pathname.startsWith("/bike-rent/bookings") ||
      location.pathname.startsWith("/bike-rent/active") ||
      location.pathname.startsWith("/bike-rent/return") ||
      location.pathname.startsWith("/bike-rent/invoice") ||
      location.pathname.startsWith("/bike-rent/review") ||
      location.pathname.startsWith("/bike-rent/pay") ||
      location.pathname.startsWith("/bike-rent/checkout");
    const isSupport = location.pathname.startsWith("/bike-rent/support");
    const isProfile = location.pathname.startsWith("/bike-rent/profile");

    return [
      { id: "home", label: "Home", icon: Home, to: getBikeRentHomePath(), active: isHome },
      { id: "bookings", label: "Bookings", icon: ClipboardList, to: getBikeRentBookingsPath(), active: isBookings, fillWhenActive: false },
      { id: "support", label: "Support", icon: LifeBuoy, to: getBikeRentSupportPath(), active: isSupport, fillWhenActive: false },
      { id: "profile", label: "Profile", icon: User, to: getBikeRentProfilePath(), active: isProfile },
    ];
  }, [location.pathname]);

  return <UserBottomNav items={items} ariaLabel="Bike Rent navigation" />;
};

export default React.memo(BikeRentBottomNav);
