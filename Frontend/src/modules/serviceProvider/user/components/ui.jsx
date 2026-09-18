import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { userAPI } from "@/services/api";
import HomeHeader from "@food/components/user/home/HomeHeader";
import { useLocation as useAppLocation } from "@food/hooks/useLocation";
import { useLocationSelector } from "@food/components/user/UserLayout";
import FloatingServiceSwitcher from "@/modules/common/components/FloatingServiceSwitcher";

function handleServiceTabChange(navigate, tab) {
  if (tab === "quick") navigate("/quick");
  else if (tab === "porter") navigate("/porter");
  else if (tab === "taxi") navigate("/taxi");
  else if (tab === "bike") navigate("/bike-rent");
  else navigate("/food/user");
}

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

/**
 * Same page-shell pattern Bike Rent uses (see bikeRent/user/components/ui/index.jsx) —
 * reuses Food's own HomeHeader/useLocation/useLocationSelector directly instead of a
 * bespoke look, so /services feels like the same app as Food/Taxi/Bike Rent.
 */
import AppMobileFrame from "@/modules/common/components/AppMobileFrame";

export function ServiceProviderPageShell({
  children,
  className,
  /** Food service-switcher tabs — keep on the category/landing screen only. */
  showServiceSwitcher = false,
  /** `full` = location + wallet + tabs (landing screen). `tabs` = tabs-only strip. */
  headerVariant = "tabs",
}) {
  const navigate = useNavigate();
  const { location } = useAppLocation();
  const { openLocationSelector } = useLocationSelector();
  const [walletBalance, setWalletBalance] = useState(null);

  useEffect(() => {
    if (headerVariant !== "full") return;
    let cancelled = false;
    userAPI
      .getWallet()
      .then((res) => {
        if (cancelled) return;
        const data = res?.data?.data || res?.data || {};
        const balance = data?.wallet?.balance ?? data?.balance ?? data?.walletBalance ?? 0;
        setWalletBalance(Number(balance) || 0);
      })
      .catch(() => {
        if (!cancelled) setWalletBalance(0);
      });
    return () => {
      cancelled = true;
    };
  }, [headerVariant]);

  const locationTitle =
    location?.area || location?.city || location?.formattedAddress || "Set your location";
  const savedAddressText =
    location?.formattedAddress
    || location?.address
    || [location?.area, location?.city].filter(Boolean).join(", ")
    || locationTitle;

  return (
    <AppMobileFrame bgClassName="bg-[#F7F7F8]">
      <div className={cn("w-full flex-1 flex flex-col justify-between pb-8", className)}>
        <div className="w-full">
          {showServiceSwitcher ? (
            <HomeHeader
              activeTab="services"
              location={location}
              savedAddressText={savedAddressText}
              handleLocationClick={() => openLocationSelector?.()}
              walletBalance={walletBalance != null ? money(walletBalance) : undefined}
            />
          ) : null}

          {children}
        </div>
      </div>
      <FloatingServiceSwitcher />
    </AppMobileFrame>
  );
}

/** Simple back+title bar for inner funnel screens (category → service → book), matching
 *  Bike Rent's own BikeRentPageHeader look exactly. */
export function ServiceProviderPageHeader({ title, subtitle, onBack, backTo, right, className }) {
  const navigate = useNavigate();
  const handleBack = () => {
    if (onBack) return onBack();
    if (backTo) return navigate(backTo);
    return navigate(-1);
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
          <h1 className="truncate text-base font-extrabold text-gray-900">{title}</h1>
          {subtitle ? <p className="truncate text-[11px] text-gray-500">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </header>
  );
}
