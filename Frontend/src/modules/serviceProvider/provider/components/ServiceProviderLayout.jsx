import { useState } from "react";
import { Menu } from "lucide-react";
import { PageHeader } from "@/shared/components/admin";
import ServiceProviderSidebar from "./ServiceProviderSidebar";
import IncomingRequestPopup from "./IncomingRequestPopup";
import { getServiceProviderUser } from "../utils/authServiceProvider";
import { SP_ADMIN_PAGE_CLASS_WIDE } from "../../admin/utils/adminTheme";

// ServiceProviderRealtimeProvider is mounted by the router (serviceProvider/routes.jsx),
// wrapping every approved-provider route — NOT here. A component can only read context
// provided by an ANCESTOR, never by something it renders as its own child, so nesting
// the provider inside this layout meant pages calling useServiceProviderRealtime()
// before returning <ServiceProviderLayout> (Dashboard, Jobs, IncomingRequests all do,
// e.g. for a "Live" badge or a realtime refresh trigger) crashed with "must be used
// within ServiceProviderRealtimeProvider". Mounting it at the router level instead
// makes it a true ancestor of every page, while still keeping exactly one shared
// socket connection — see ServiceProviderRealtimeContext.jsx.
export default function ServiceProviderLayout({ title, subtitle, actions, children }) {
  const provider = getServiceProviderUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-[#F7F7F8]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-90 bg-gray-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <ServiceProviderSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onCollapseChange={setIsSidebarCollapsed}
      />

      <div
        className={`flex min-h-screen min-w-0 flex-1 flex-col transition-all duration-300 ease-in-out ${
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
                {provider?.ownerName || "Service Provider"}
              </p>
            </div>
          </div>
        </header>

        {/* Full width, no centered max-width column — matches Food AdminLayout's main
            content area (w-full max-w-full next to the sidebar), not a narrow centered
            page leaving large empty gutters on wide screens. */}
        <main className={SP_ADMIN_PAGE_CLASS_WIDE}>
          {(title || actions) && <PageHeader title={title} description={subtitle} actions={actions} />}
          {children}
        </main>
      </div>

      <IncomingRequestPopup />
    </div>
  );
}
