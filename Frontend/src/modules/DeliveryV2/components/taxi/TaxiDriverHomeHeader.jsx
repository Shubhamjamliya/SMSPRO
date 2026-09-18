import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  CarTaxiFront,
  ChevronDown,
  Clock,
  Contact,
  Loader2,
  Navigation2,
} from "lucide-react";

const ACCENT = "#FF6A00";

/**
 * Taxi-mode home header — map-first “shift desk” chrome.
 * Same behaviors as the shared driver card; taxi-only visual language.
 */
export default function TaxiDriverHomeHeader({
  driverName = "Taxi Partner",
  profileImage = null,
  isOnline = false,
  isProcessingToggle = false,
  hasActiveTrip = false,
  isExpanded = false,
  onToggleExpand,
  onToggleOnline,
  onOpenProfile,
  onOpenNotifications,
  notificationUnreadCount = 0,
  activeVehicle = null,
  vehicleLabel = "",
  vehicleReg = "",
  onChangeVehicle,
  distanceKmLabel = "--",
  etaLabel = "--",
  onSos,
  onIdCard,
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.35rem] border border-black/[0.06] bg-white/92 shadow-[0_12px_40px_rgba(15,23,42,0.14)] backdrop-blur-xl">
      {/* Soft brand wash */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-90"
        style={{
          background: `radial-gradient(90% 120% at 0% 0%, ${ACCENT}22 0%, transparent 55%), radial-gradient(70% 100% at 100% 0%, #11182710 0%, transparent 50%)`,
        }}
        aria-hidden
      />

      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand?.();
          }
        }}
        className="relative flex cursor-pointer select-none items-center gap-2.5 px-3 py-2.5"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenProfile?.();
          }}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 ring-2 ring-white shadow-sm active:scale-95"
          aria-label="Open profile"
        >
          {profileImage ? (
            <img
              src={profileImage}
              alt={driverName}
              className="h-full w-full object-cover"
            />
          ) : (
            <span
              className="text-sm font-bold"
              style={{ color: ACCENT }}
            >
              {(driverName || "T").charAt(0).toUpperCase()}
            </span>
          )}
          <span
            className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
              isOnline ? "bg-emerald-500" : "bg-neutral-400"
            }`}
          />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <CarTaxiFront className="h-3.5 w-3.5 shrink-0 text-[#FF6A00]" />
            <p className="truncate text-[13px] font-bold tracking-tight text-neutral-950">
              {driverName}
            </p>
          </div>
          <p className="mt-0.5 truncate text-[11px] font-medium text-neutral-500">
            {hasActiveTrip
              ? "On an active ride"
              : isOnline
                ? "Live · listening for rides"
                : "Offline · go online to earn"}
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleOnline?.();
          }}
          disabled={isProcessingToggle}
          aria-pressed={isOnline}
          className={`relative flex h-9 w-[5.6rem] shrink-0 items-center rounded-full p-1 transition-colors duration-300 ${
            isOnline
              ? "bg-[#FF6A00] shadow-[0_6px_18px_rgba(255,106,0,0.35)]"
              : "bg-neutral-800"
          }`}
        >
          {isProcessingToggle ? (
            <span className="flex w-full justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            </span>
          ) : (
            <>
              <span
                className={`pointer-events-none absolute inset-x-0 text-[9px] font-bold uppercase tracking-wide text-white ${
                  isOnline ? "pl-2.5 text-left" : "pr-2.5 text-right"
                }`}
              >
                {isOnline ? "Online" : "Offline"}
              </span>
              <motion.span
                className="relative z-10 h-7 w-7 rounded-full bg-white shadow"
                animate={{ x: isOnline ? 52 : 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 28 }}
              />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenNotifications?.();
          }}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-800 ring-1 ring-black/[0.04] active:scale-95"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {notificationUnreadCount > 0 ? (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
          ) : null}
        </button>

        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          className="flex h-6 w-6 shrink-0 items-center justify-center text-neutral-400"
        >
          <ChevronDown className="h-5 w-5" />
        </motion.div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            className="relative overflow-hidden"
          >
            {!hasActiveTrip && activeVehicle ? (
              <div className="px-3 pb-2.5">
                <button
                  type="button"
                  onClick={onChangeVehicle}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-black/[0.05] bg-neutral-50 px-2.5 py-2 active:scale-[0.99]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF1E6] text-[#FF6A00]">
                    <CarTaxiFront className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-xs font-semibold text-neutral-900">
                      {vehicleLabel || "Your cab"}
                    </span>
                    <span className="block truncate text-[10px] text-neutral-500">
                      {vehicleReg || "Tap to change vehicle"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-[#FF6A00]">
                    Change
                  </span>
                </button>
              </div>
            ) : null}

            {hasActiveTrip ? (
              <div className="grid grid-cols-2 gap-2 px-3 pb-2.5">
                <div className="flex items-center justify-between rounded-xl bg-[#FF6A00] px-3 py-2.5 text-white">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/80">
                      Distance
                    </p>
                    <p className="mt-0.5 text-lg font-bold leading-none">
                      {distanceKmLabel}
                      <span className="ml-1 text-xs font-semibold opacity-80">km</span>
                    </p>
                  </div>
                  <Navigation2 className="h-4 w-4 rotate-45 text-white/90" />
                </div>
                <div className="flex items-center justify-between rounded-xl bg-neutral-900 px-3 py-2.5 text-white">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">
                      ETA
                    </p>
                    <p className="mt-0.5 text-lg font-bold leading-none">
                      {etaLabel}
                      <span className="ml-1 text-xs font-semibold opacity-80">min</span>
                    </p>
                  </div>
                  <Clock className="h-4 w-4 text-white/90" />
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between border-t border-black/[0.05] bg-neutral-50/80 px-4 py-2.5">
              <button
                type="button"
                onClick={onSos}
                className="flex flex-1 items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-red-500 active:opacity-70"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                SOS
              </button>
              <div className="h-4 w-px bg-black/10" />
              <button
                type="button"
                onClick={onIdCard}
                className="flex flex-1 items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-neutral-600 active:opacity-70"
              >
                <Contact className="h-3.5 w-3.5" />
                ID Card
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
