import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import HomeHeader from "@food/components/user/home/HomeHeader";
import { useLocation as useAppLocation } from "@food/hooks/useLocation";
import { useLocationSelector } from "@food/components/user/UserLayout";
import BikeRentBottomNav from "../layout/BottomNav";
import FloatingServiceSwitcher from "@/modules/common/components/FloatingServiceSwitcher";

function handleServiceTabChange(navigate, tab) {
  if (tab === "quick") navigate("/quick");
  else if (tab === "porter") navigate("/porter");
  else if (tab === "taxi") navigate("/taxi");
  else if (tab === "bike") navigate("/bike-rent");
  else navigate("/food/user");
}

import AppMobileFrame from "@/modules/common/components/AppMobileFrame";

export function BikeRentPageShell({
  children,
  className,
  showBottomNav = false,
  /** Food / Taxi / Bike / etc. service tabs — keep on Home only. */
  showServiceSwitcher = false,
  /** `full` matches Bike Rent home (location + tabs). `tabs` is tabs-only. */
  headerVariant = "tabs",
}) {
  const navigate = useNavigate();
  const { location } = useAppLocation();
  const { openLocationSelector } = useLocationSelector();

  const locationTitle =
    location?.area || location?.city || location?.formattedAddress || "Current location";
  const savedAddressText =
    location?.formattedAddress
    || location?.address
    || [location?.area, location?.city].filter(Boolean).join(", ")
    || locationTitle;

  return (
    <AppMobileFrame bgClassName="bg-[#F7F7F8]">
      <div className={cn("w-full flex-1 flex flex-col justify-between", showBottomNav ? "pb-24" : "pb-8", className)}>
        <div className="w-full">
          {showServiceSwitcher ? (
            <HomeHeader
              activeTab="bike"
              location={location}
              savedAddressText={savedAddressText}
              handleLocationClick={() => openLocationSelector?.()}
            />
          ) : null}

          {children}
        </div>

        {showBottomNav ? <BikeRentBottomNav /> : null}
      </div>
      <FloatingServiceSwitcher />
    </AppMobileFrame>
  );
}

export function BikeRentPageHeader({
  title,
  subtitle,
  onBack,
  backTo,
  right,
  className,
}) {
  const navigate = useNavigate();
  const handleBack = () => {
    if (onBack) return onBack();
    if (backTo) return navigate(backTo);
    navigate(-1);
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full max-w-full overflow-x-hidden border-b border-gray-100 bg-white/95 px-3 py-3 backdrop-blur-md sm:px-4",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 active:scale-95"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-extrabold text-gray-900">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-[11px] text-gray-500">{subtitle}</p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </header>
  );
}

export function SectionLabel({ children, className }) {
  return (
    <h2
      className={cn(
        "mb-2 px-0.5 text-[11px] font-bold uppercase tracking-wider text-gray-400",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function ListTile({
  icon: Icon,
  title,
  subtitle,
  onClick,
  danger = false,
  right,
  className,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 text-left shadow-sm active:scale-[0.99] transition",
        className,
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            danger
              ? "bg-red-50 text-red-600"
              : "bg-[#FF6A00]/10 text-[#FF6A00]",
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-bold",
            danger ? "text-red-600" : "text-gray-900",
          )}
        >
          {title}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block text-[11px] text-gray-500">{subtitle}</span>
        ) : null}
      </span>
      {right || (
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
      )}
    </button>
  );
}

export function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
      {Icon ? (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00]">
          <Icon className="h-6 w-6" />
        </span>
      ) : null}
      <p className="text-sm font-extrabold text-gray-900">{title}</p>
      {subtitle ? (
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-gray-500">{subtitle}</p>
      ) : null}
      {action ? <div className="mt-4 w-full max-w-xs">{action}</div> : null}
    </div>
  );
}

export function PrimaryButton({
  children,
  className,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF6A00] px-4 py-3.5 text-sm font-extrabold text-white shadow-sm active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
