// Porter standalone layout shell. Renders the routed screen + bottom nav.
import React, { useEffect, useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";
import PorterBottomNav from "./components/layout/BottomNav";

const SHOW_NAV_PATHS = new Set(["/porter", "/porter/shipments", "/porter/saved-places"]);

import AppMobileFrame from "@/modules/common/components/AppMobileFrame";

const UserLayout = React.memo(() => {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  const showNav = useMemo(() => SHOW_NAV_PATHS.has(location.pathname), [location.pathname]);

  return (
    <AppMobileFrame bgClassName="bg-[#F4F7FC] dark:bg-[#0a0a0a]">
      <div className="w-full flex-1 flex flex-col justify-between">
        <main className={showNav ? "pb-[80px]" : ""}>
          <Outlet />
        </main>
        {showNav && <PorterBottomNav />}
      </div>
    </AppMobileFrame>
  );
});

UserLayout.displayName = "PorterUserLayout";

export default UserLayout;
