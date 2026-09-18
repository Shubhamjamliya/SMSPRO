import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, LogOut, Wrench, X } from "lucide-react";
import { serviceProviderSidebarMenu } from "../utils/sidebarMenu";
import { clearServiceProviderAuth, getServiceProviderUser } from "../utils/authServiceProvider";

const SIDEBAR_STATE_KEY = "service_provider_sidebar_state";

function getInitialCollapsed() {
  try {
    const saved = localStorage.getItem(SIDEBAR_STATE_KEY);
    if (saved) return Boolean(JSON.parse(saved).isCollapsed);
  } catch {
    /* ignore malformed storage */
  }
  return false;
}

export default function ServiceProviderSidebar({ isOpen = false, onClose, onCollapseChange }) {
  const location = useLocation();
  const navigate = useNavigate();
  const provider = getServiceProviderUser();
  const [isCollapsed, setIsCollapsed] = useState(getInitialCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify({ isCollapsed }));
    } catch {
      /* ignore storage failures */
    }
    onCollapseChange?.(isCollapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollapsed]);

  const isActive = (path) => {
    const current = location.pathname.replace(/\/+$/, "") || "/";
    const target = String(path).replace(/\/+$/, "") || "/";
    return current === target || current.startsWith(`${target}/`);
  };

  const handleNavClick = () => {
    if (window.innerWidth < 1024) onClose?.();
  };

  return (
    <div
      className={`service-provider-sidebar-scroll-host backdrop-blur-md border-r border-[#EDE8E0] h-screen fixed left-0 top-0 z-100 flex flex-col overflow-hidden shadow-xs transform transition-all duration-300 ease-in-out lg:translate-x-0 ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      } ${isCollapsed ? "w-20" : "w-80"}`}
      style={{ backgroundColor: "#ffffffcc" }}
    >
      <style>{`
        .service-provider-sidebar-scroll::-webkit-scrollbar { width: 2px; }
        .service-provider-sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
        .service-provider-sidebar-scroll::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.1); border-radius: 10px; }
        .service-provider-sidebar-scroll:hover::-webkit-scrollbar { width: 6px; }
        .service-provider-sidebar-scroll { scrollbar-width: thin; scrollbar-color: rgba(0, 0, 0, 0.15) transparent; }
      `}</style>

      <div className="shrink-0 border-b border-[#EDE8E0] px-3 py-3">
        <div className="mb-1 flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FF6A00]/12 text-[#FF6A00]">
                <Wrench className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold uppercase tracking-wide text-[#5C5247]">
                  Service Provider
                </p>
                <h1 className="truncate text-sm font-black text-[#1A1A1A]">
                  {provider?.ownerName || "Provider Panel"}
                </h1>
              </div>
            </div>
          )}
          {isCollapsed && (
            <div className="flex w-full items-center justify-center">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FF6A00]/12 text-[#FF6A00]">
                <Wrench className="h-5 w-5" />
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="rounded-lg p-1.5 text-[#5C5247] transition hover:bg-[#FAF7F2] hover:text-[#1A1A1A]"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#5C5247] transition hover:bg-[#FAF7F2] hover:text-[#1A1A1A] lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <nav className="service-provider-sidebar-scroll flex-1 min-h-0 space-y-2 overflow-y-auto overscroll-y-contain px-3 py-3">
        {serviceProviderSidebarMenu.map((section, index) => (
          <div key={section.title} className={index > 0 ? "mt-2 border-t border-[#EDE8E0] pt-2" : ""}>
            {!isCollapsed && (
              <div className="px-3 py-1 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#5C5247]">
                  {section.title}
                </span>
              </div>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={handleNavClick}
                    title={isCollapsed ? item.label : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all ${
                      isCollapsed ? "justify-center px-2" : ""
                    } ${
                      active
                        ? "bg-[#FFF3EB] font-semibold text-[#FF6A00] shadow-xs"
                        : "text-[#5C5247] hover:bg-[#FAF7F2] hover:text-[#1A1A1A]"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#FF6A00]" : "text-[#5C5247]"}`} />
                    {!isCollapsed && <span className="truncate font-medium">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-[#EDE8E0] p-3">
        <button
          type="button"
          onClick={() => {
            clearServiceProviderAuth();
            navigate("/service-provider/login");
          }}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold text-[#5C5247] transition hover:bg-[#FAF7F2] hover:text-[#1A1A1A] ${
            isCollapsed ? "justify-center px-2" : ""
          }`}
          title={isCollapsed ? "Logout" : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!isCollapsed && "Logout"}
        </button>
      </div>
    </div>
  );
}
