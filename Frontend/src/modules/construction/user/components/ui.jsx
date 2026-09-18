import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import HomeHeader from "@food/components/user/home/HomeHeader";
import { useLocation as useAppLocation } from "@food/hooks/useLocation";
import { useLocationSelector } from "@food/components/user/UserLayout";
import ConstructionBottomNav from "./BottomNav";
import FloatingServiceSwitcher from "@/modules/common/components/FloatingServiceSwitcher";

import AppMobileFrame from "@/modules/common/components/AppMobileFrame";

/**
 * Construction customer chrome with modern aesthetic tokens, smooth backdrop blurs,
 * and high-contrast typography inside a realistic mobile device frame.
 */
export function ConstructionPageShell({
  children,
  className,
  showBottomNav = true,
  showServiceSwitcher = false,
}) {
  const navigate = useNavigate();
  const { location } = useAppLocation();
  const { openLocationSelector } = useLocationSelector();

  return (
    <AppMobileFrame bgClassName="bg-slate-50">
      <div className={cn("w-full flex-1 flex flex-col justify-between", showBottomNav ? "pb-20" : "pb-6", className)}>
        <div className="w-full">
          {showServiceSwitcher ? (
            <HomeHeader
              activeTab="construction"
              location={location}
              handleLocationClick={() => openLocationSelector?.()}
            />
          ) : null}

          {children}
        </div>

        {showBottomNav ? <ConstructionBottomNav /> : null}
      </div>
      <FloatingServiceSwitcher />
    </AppMobileFrame>
  );
}

function handleServiceTabChange(navigate, tab) {
  if (tab === "quick") navigate("/quick");
  else if (tab === "porter") navigate("/porter");
  else if (tab === "taxi") navigate("/taxi");
  else if (tab === "bike") navigate("/bike-rent");
  else if (tab === "services") navigate("/services");
  else if (tab === "construction") navigate("/construction");
  else navigate("/food/user");
}

/** Inner-page header: glassmorphic top bar, back button, title, optional right slot. */
export function ConstructionPageHeader({ title, subtitle, onBack, backTo, right, className }) {
  const navigate = useNavigate();
  const handleBack = () => {
    if (onBack) return onBack();
    if (backTo) return navigate(backTo);
    return navigate(-1);
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full max-w-full overflow-x-hidden border-b border-slate-200/80 bg-white/90 px-3.5 py-3 backdrop-blur-xl shadow-xs transition-all sm:px-4",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100/80 text-slate-700 hover:bg-slate-200/80 active:scale-95 transition-transform"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4 stroke-[2.5]" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-extrabold tracking-tight text-slate-900">{title}</h1>
          {subtitle ? <p className="truncate text-[11px] font-medium text-slate-500">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </header>
  );
}

export function SectionLabel({ children, action, className }) {
  return (
    <div className={cn("mb-3 flex items-baseline justify-between gap-3", className)}>
      <h2 className="text-[15px] font-extrabold tracking-tight text-slate-900 flex items-center gap-2">{children}</h2>
      {action}
    </div>
  );
}

/** Consistent empty state with styled icon containers & smooth buttons. */
export function EmptyState({ icon: Icon, title, detail, action }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300/80 bg-white px-6 py-12 text-center shadow-xs">
      {Icon ? (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 ring-4 ring-amber-500/5">
          <Icon className="h-6 w-6 stroke-[2]" />
        </div>
      ) : null}
      <p className="text-base font-extrabold text-slate-900">{title}</p>
      {detail ? (
        <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-slate-500 font-medium">{detail}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

