import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, Menu } from "lucide-react";
import { PageHeader } from "@/shared/components/admin";
import VendorSidebar from "./VendorSidebar";
import { getBikeVendorUser } from "../utils/authVendor";
import { bikeVendorApi } from "../services/vendorApi";
import { BIKE_RENT_ADMIN_PAGE_CLASS } from "../../admin/utils/adminTheme";

export default function VendorLayout({ title, subtitle, actions, children }) {
  const location = useLocation();
  const vendor = getBikeVendorUser();
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    bikeVendorApi
      .getNotifications({ limit: 30 })
      .then((list) => {
        if (!cancelled) setUnreadCount((list || []).filter((n) => !n.read).length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-[#F7F7F8]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-90 bg-gray-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <VendorSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onCollapseChange={setIsSidebarCollapsed}
      />

      <div
        className={`flex min-h-screen flex-1 flex-col transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? "lg:ml-20" : "lg:ml-80"
        }`}
      >
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="rounded-xl border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <p className="truncate text-sm font-bold text-gray-700">
                {vendor?.businessName || "Vendor dashboard"}
              </p>
            </div>
            <Link
              to="/bike-rent/vendor/notifications"
              className="relative inline-flex items-center gap-2 rounded-xl border border-gray-200 p-2.5 text-gray-600 hover:bg-gray-50"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#FF6A00] px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          </div>
        </header>

        <main className={BIKE_RENT_ADMIN_PAGE_CLASS}>
          {(title || actions) && <PageHeader title={title} description={subtitle} actions={actions} />}
          {children}
        </main>
      </div>
    </div>
  );
}
