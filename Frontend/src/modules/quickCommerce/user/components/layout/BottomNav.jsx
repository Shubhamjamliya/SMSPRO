import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { Home, LayoutGrid, ShoppingBag, User } from "lucide-react";
import UserBottomNav from "@/shared/layout/UserBottomNav";
import {
  getQuickCategoriesPath,
  getQuickHomePath,
  getQuickOrdersPath,
  getQuickProfilePath,
} from "../../utils/routes";

const BottomNav = () => {
  const location = useLocation();
  const isSharedQuickProfileRoute = useMemo(
    () =>
      location.pathname === "/profile" &&
      new URLSearchParams(location.search).get("from") === "quick",
    [location.pathname, location.search],
  );

  const items = useMemo(() => {
    const homePath = getQuickHomePath(location.pathname);
    const categoriesPath = getQuickCategoriesPath();
    const ordersPath = getQuickOrdersPath();
    const profilePath = getQuickProfilePath();

    const isHome =
      location.pathname === homePath || location.pathname.startsWith(`${homePath}/`);
    const isCategory =
      location.pathname === categoriesPath ||
      location.pathname.startsWith(`${categoriesPath}/`);
    const isOrders =
      location.pathname === ordersPath || location.pathname.startsWith(`${ordersPath}/`);
    const isProfile =
      isSharedQuickProfileRoute ||
      location.pathname === profilePath ||
      location.pathname.startsWith(`${profilePath}/`);

    return [
      {
        id: "home",
        label: "Home",
        icon: Home,
        to: homePath,
        active: isHome && !isCategory && !isOrders && !isProfile,
        state: { categoryToSelect: "all" },
      },
      {
        id: "category",
        label: "Category",
        icon: LayoutGrid,
        to: categoriesPath,
        active: isCategory,
        fillWhenActive: false,
      },
      {
        id: "orders",
        label: "Orders",
        icon: ShoppingBag,
        to: ordersPath,
        active: isOrders,
        fillWhenActive: false,
      },
      {
        id: "profile",
        label: "Profile",
        icon: User,
        to: profilePath,
        active: isProfile,
      },
    ];
  }, [location.pathname, isSharedQuickProfileRoute]);

  return <UserBottomNav items={items} ariaLabel="Quick Commerce navigation" />;
};

export default React.memo(BottomNav);
