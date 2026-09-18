import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import bikeRentUserApi from "../services/userApi";
import { buildBikeRentPolicySections } from "../utils/policyDisplay";

/**
 * Shows all admin-configured Bike Rent settings as customer policies.
 * Bottom sheet on mobile, centered modal on desktop.
 */
export default function BikeRentPoliciesSheet({
  open,
  onClose,
  settings: settingsProp,
  onSettingsLoaded,
  bikeId,
}) {
  const [localSettings, setLocalSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const handleLoaded = useCallback(
    (data) => {
      onSettingsLoaded?.(data);
    },
    [onSettingsLoaded],
  );

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    let cancelled = false;
    setLoading(true);
    setLoadError("");
    bikeRentUserApi
      .getPublicSettings(bikeId)
      .then((data) => {
        if (cancelled) return;
        setLocalSettings(data || null);
        handleLoaded(data || null);
        if (!data) setLoadError("Policies could not be loaded.");
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Policies could not be loaded. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, handleLoaded, bikeId]);

  const settings = localSettings || settingsProp;
  const sections = useMemo(() => buildBikeRentPolicySections(settings), [settings]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[600] flex items-end justify-center md:items-center md:p-4">
          <motion.button
            type="button"
            aria-label="Close policies"
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bike-rent-policies-title"
            initial={{ y: "100%", opacity: 0.96 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "40%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className={cn(
              "relative z-10 flex w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl",
              "max-h-[min(94vh,44rem)] rounded-t-3xl",
              "md:max-h-[min(90vh,40rem)] md:max-w-2xl md:rounded-2xl md:border md:border-gray-100",
            )}
          >
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-gray-200 md:hidden" />

            <div className="flex items-start gap-2 border-b border-gray-100 px-4 py-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FF6A00]/10 text-[#FF6A00]">
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="bike-rent-policies-title"
                  className="text-base font-extrabold text-gray-900"
                >
                  Bike Rental Policies
                </h2>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  Same rules configured by admin in Bike Rent Settings
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
              {loading && !sections.length ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-500">
                  <Loader2 className="h-6 w-6 animate-spin text-[#FF6A00]" />
                  <p className="text-xs font-semibold">Loading policies…</p>
                </div>
              ) : sections.length ? (
                <div className="space-y-3">
                  {sections.map((section, index) => (
                    <section
                      key={section.id}
                      className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
                    >
                      <div className="flex items-start gap-2 border-b border-gray-50 bg-gradient-to-r from-orange-50/80 to-white px-3 py-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FF6A00] text-[11px] font-black text-white">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-sm font-extrabold text-gray-900">
                            {section.title}
                          </h3>
                          {section.summary ? (
                            <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
                              {section.summary}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="divide-y divide-gray-50">
                        {(section.items || []).map((item) => {
                          const isLong = String(item.value || "").length > 90;
                          return (
                            <div
                              key={`${section.id}-${item.label}`}
                              className={cn(
                                "px-3 py-2.5",
                                isLong
                                  ? "space-y-1"
                                  : "grid grid-cols-1 gap-0.5 sm:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] sm:gap-3",
                              )}
                            >
                              <p className="text-[11px] font-bold text-gray-500">
                                {item.label}
                              </p>
                              <p
                                className={cn(
                                  "text-xs font-semibold leading-relaxed text-gray-900 sm:text-[13px]",
                                  !isLong && "sm:text-right",
                                  isLong && "rounded-lg bg-amber-50/70 px-2.5 py-2 text-amber-950",
                                )}
                              >
                                {item.value}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-gray-50 px-3 py-10 text-center">
                  <p className="text-sm font-semibold text-gray-700">
                    {loadError || "Policies unavailable"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Open again in a moment, or check Bike Rent Settings in admin.
                  </p>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-gray-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-extrabold text-white"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
