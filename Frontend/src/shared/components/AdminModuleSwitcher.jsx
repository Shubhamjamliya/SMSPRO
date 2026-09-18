import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bike, CarTaxiFront, HardHat, Package, ShoppingBasket, UtensilsCrossed, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEnabledModules } from "@/modules/common/hooks/useEnabledModules";

const ADMIN_MODULES = [
  {
    key: "food",
    moduleKey: "food",
    label: "Food",
    shortLabel: "Food",
    path: "/admin/food",
    icon: UtensilsCrossed,
    active: (pathname) => pathname.startsWith("/admin/food"),
  },
  {
    key: "quick",
    moduleKey: "quickCommerce",
    label: "Quick",
    shortLabel: "Quick",
    path: "/admin/quick-commerce",
    icon: ShoppingBasket,
    active: (pathname) => pathname.startsWith("/admin/quick-commerce"),
  },
  {
    key: "porter",
    moduleKey: "porter",
    label: "Porter",
    shortLabel: "Porter",
    path: "/admin/porter",
    icon: Package,
    active: (pathname) => pathname.startsWith("/admin/porter"),
  },
  {
    key: "taxi",
    moduleKey: "taxi",
    label: "Taxi",
    shortLabel: "Taxi",
    path: "/admin/taxi",
    icon: CarTaxiFront,
    active: (pathname) => pathname.startsWith("/admin/taxi"),
  },
  {
    key: "bikeRent",
    moduleKey: "bikeRent",
    label: "Bike Rent",
    shortLabel: "Bike",
    path: "/admin/bike-rent",
    icon: Bike,
    active: (pathname) => pathname.startsWith("/admin/bike-rent"),
  },
  // Service Provider is live but was never listed here, so its admin section
  // had no way in from the switcher.
  {
    key: "serviceProvider",
    moduleKey: "serviceProvider",
    label: "Services",
    shortLabel: "Services",
    path: "/admin/service-provider",
    icon: Wrench,
    active: (pathname) => pathname.startsWith("/admin/service-provider"),
  },
  {
    key: "construction",
    moduleKey: "construction",
    label: "Construction",
    shortLabel: "Build",
    path: "/admin/construction",
    icon: HardHat,
    active: (pathname) => pathname.startsWith("/admin/construction"),
  },
];

export default function AdminModuleSwitcher({ className = "", variant = "light" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { modules } = useEnabledModules();
  const isDark = variant === "dark";

  const visibleModules = useMemo(
    () =>
      ADMIN_MODULES.filter(
        (module) => modules[module.moduleKey] !== false,
      ),
    [modules],
  );

  if (visibleModules.length < 1) return null;

  return (
    <div
      className={cn(
        "grid gap-0.5 p-1",
        isDark
          ? "rounded-xl border border-white/10 bg-white/5"
          : "rounded-2xl border border-slate-200 bg-slate-50 shadow-sm",
        className,
      )}
      style={{
        gridTemplateColumns: `repeat(${visibleModules.length}, minmax(0, 1fr))`,
      }}
      role="tablist"
      aria-label="Switch admin module"
    >
      {visibleModules.map((module) => {
        const Icon = module.icon;
        const isActive = module.active(location.pathname);

        return (
          <button
            key={module.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={module.label}
            onClick={() => navigate(module.path)}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-2 text-[10px] font-black uppercase tracking-wide transition-all",
              isDark
                ? isActive
                  ? "bg-white text-slate-950 shadow-md shadow-black/20"
                  : "text-slate-400 hover:bg-white/10 hover:text-white"
                : isActive
                  ? "bg-slate-950 text-white shadow-md shadow-slate-900/15"
                  : "text-slate-500 hover:bg-white hover:text-slate-950",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate w-full text-center">{module.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
