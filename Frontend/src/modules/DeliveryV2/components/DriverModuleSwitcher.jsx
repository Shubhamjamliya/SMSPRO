import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bike,
  CarTaxiFront,
  Package,
  ShoppingBasket,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDeliveryStore } from "@/modules/DeliveryV2/store/useDeliveryStore";
import {
  enrollmentStatusLabel,
  getModuleShortLabel,
  normalizeDriverModuleKey,
  orderSwitcherEnrollments,
  readStoredDeliveryUser,
} from "@/modules/DeliveryV2/utils/driverModuleAccess";

/** Same accent as user HomeHeader food/porter/taxi tabs */
const ACCENT = "#FF6A00";

const MODULE_ICONS = {
  food: UtensilsCrossed,
  "quick-commerce": ShoppingBasket,
  porter: Truck,
  parcel: Package,
  taxi: CarTaxiFront,
  "bike-rent": Bike,
};

const withAlpha = (hex, alpha) => {
  const value = String(hex || ACCENT).replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * Driver work-module tabs — same visual language as /food/user HomeHeader tabs.
 * Approved → switch work context. Pending/Rejected → open status + resubmit page.
 */
export default function DriverModuleSwitcher({ className = "", onSwitched }) {
  const navigate = useNavigate();
  const isOnline = useDeliveryStore((s) => s.isOnline);
  const activeOrder = useDeliveryStore((s) => s.activeOrder);
  const moduleEnrollments = useDeliveryStore((s) => s.moduleEnrollments);
  const activeModule = useDeliveryStore((s) => s.activeModule);
  const setActiveModule = useDeliveryStore((s) => s.setActiveModule);
  const resolveActiveModule = useDeliveryStore((s) => s.resolveActiveModule);

  const visible = useMemo(
    () => orderSwitcherEnrollments(moduleEnrollments),
    [moduleEnrollments],
  );

  const current =
    normalizeDriverModuleKey(activeModule) || resolveActiveModule() || null;

  if (visible.length < 1) return null;

  const openModuleStatusPage = (enrollment) => {
    const key = normalizeDriverModuleKey(enrollment.module);
    const user = readStoredDeliveryUser();
    const phone = String(user?.phone || "")
      .replace(/\D/g, "")
      .slice(-10);
    if (phone) sessionStorage.setItem("deliveryPendingPhone", phone);
    navigate("/food/delivery/verification", {
      state: {
        phone,
        focusModule: key,
        enrollments: moduleEnrollments,
      },
    });
  };

  const handleSelect = (enrollment) => {
    const key = normalizeDriverModuleKey(enrollment.module);
    const status = enrollment.status || "pending";

    // Non-approved: open proper status page (reason + Edit & Resubmit)
    if (status !== "approved") {
      openModuleStatusPage(enrollment);
      return;
    }

    if (key === current) return;

    const result = setActiveModule(key);
    if (!result.ok) {
      if (result.reason === "online") {
        toast.error("Go offline to switch service modules");
      } else if (result.reason === "active_trip") {
        toast.error("Finish your current trip before switching modules");
      } else {
        toast.error("Unable to switch module");
      }
      return;
    }
    toast.success(`Switched to ${getModuleShortLabel(key)}`);
    onSwitched?.(key);
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200/70 bg-white p-1 shadow-md shadow-black/10",
        className,
      )}
    >
      <div
        className="flex gap-1 overflow-x-auto overscroll-x-contain rounded-xl bg-gray-100/80 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Switch driver service module"
      >
        {visible.map((enrollment) => {
          const key = normalizeDriverModuleKey(enrollment.module);
          const Icon = MODULE_ICONS[key] || Package;
          const status = enrollment.status || "pending";
          const approved = status === "approved";
          const isActive = approved && key === current;
          const isRejected = status === "rejected";
          const isPending =
            status === "pending" || status === "documents_required";

          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              title={
                approved
                  ? getModuleShortLabel(key)
                  : `${getModuleShortLabel(key)} — ${enrollmentStatusLabel(enrollment)}. Tap to view.`
              }
              onClick={() => handleSelect(enrollment)}
              className={cn(
                "flex-1 min-w-[4.75rem] shrink-0 rounded-xl py-2 px-2 font-bold flex flex-col items-center justify-center gap-0.5 transition-all duration-200 cursor-pointer border-0",
                isActive
                  ? "text-white shadow-sm"
                  : approved
                    ? "text-gray-600 hover:text-gray-900 bg-transparent"
                    : "text-gray-400 bg-transparent",
                (isOnline || Boolean(activeOrder)) &&
                  approved &&
                  !isActive
                  ? "opacity-80"
                  : null,
              )}
              style={
                isActive
                  ? {
                      backgroundColor: ACCENT,
                      boxShadow: `0 2px 8px ${withAlpha(ACCENT, 0.3)}`,
                    }
                  : undefined
              }
            >
              <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide sm:text-[11px]">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{getModuleShortLabel(key)}</span>
              </span>
              {!approved ? (
                <span
                  className={cn(
                    "text-[8px] font-bold normal-case tracking-normal leading-none",
                    isRejected
                      ? "text-red-500"
                      : isPending
                        ? "text-amber-600"
                        : "text-gray-400",
                    isActive ? "text-white/90" : null,
                  )}
                >
                  {enrollmentStatusLabel(enrollment)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
