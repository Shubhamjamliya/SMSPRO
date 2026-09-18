import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  UtensilsCrossed,
  ShoppingBag,
  Truck,
  CarTaxiFront,
  Bike,
  Wrench,
  HardHat,
  X,
  ChevronRight,
  Sparkles,
  LayoutGrid,
  Zap,
} from "lucide-react";
import { useEnabledModules } from "../hooks/useEnabledModules";
import { rememberUserModulePath } from "../utils/enabledModules";

// Unique SMSPRO 4-Service Matrix Hub Icon
function UniqueServiceHubIcon({ className = "w-7 h-7" }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="3" y="3" width="11" height="11" rx="4" className="fill-orange-400" />
      <rect x="18" y="3" width="11" height="11" rx="4" className="fill-emerald-400" />
      <rect x="3" y="18" width="11" height="11" rx="4" className="fill-blue-400" />
      <rect x="18" y="18" width="11" height="11" rx="4" className="fill-purple-400" />
      <circle cx="16" cy="16" r="6" className="fill-slate-900 dark:fill-white" />
      <path
        d="M16.5 11.5L13.5 16.5H16.5L15.5 20.5L18.5 15.5H15.5L16.5 11.5Z"
        className="fill-orange-500 dark:fill-slate-900"
      />
    </svg>
  );
}

const MODULE_ITEMS = [
  {
    id: "food",
    moduleKey: "food",
    title: "Food Delivery",
    tagline: "Order top meals",
    path: "/food/user",
    icon: UtensilsCrossed,
    iconBg: "bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-red-500/20",
    badge: "500+ Outlets",
  },
  {
    id: "quickCommerce",
    moduleKey: "quickCommerce",
    title: "Quick Commerce",
    tagline: "10 Min Groceries",
    path: "/quick",
    icon: ShoppingBag,
    iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/20",
    badge: "10 Mins",
  },
  {
    id: "porter",
    moduleKey: "porter",
    title: "Porter Courier",
    tagline: "Instant Parcel",
    path: "/porter",
    icon: Truck,
    iconBg: "bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-blue-600/20",
    badge: "OTP Track",
  },
  {
    id: "taxi",
    moduleKey: "taxi",
    title: "Taxi & Rides",
    tagline: "Cabs & Auto Rides",
    path: "/taxi",
    icon: CarTaxiFront,
    iconBg: "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-amber-500/20",
    badge: "Best Fares",
  },
  {
    id: "bikeRent",
    moduleKey: "bikeRent",
    title: "Bike Rental",
    tagline: "Self-Drive Bikes",
    path: "/bike-rent",
    icon: Bike,
    iconBg: "bg-gradient-to-br from-purple-600 to-violet-600 text-white shadow-purple-600/20",
    badge: "Hourly",
  },
  {
    id: "serviceProvider",
    moduleKey: "serviceProvider",
    title: "Home Services",
    tagline: "Repair & Maintenance",
    path: "/services",
    icon: Wrench,
    iconBg: "bg-gradient-to-br from-cyan-600 to-blue-600 text-white shadow-cyan-600/20",
    badge: "Verified Pros",
  },
  {
    id: "construction",
    moduleKey: "construction",
    title: "Construction",
    tagline: "Civil Work & Quotes",
    path: "/construction",
    icon: HardHat,
    iconBg: "bg-gradient-to-br from-orange-600 to-amber-600 text-white shadow-orange-600/20",
    badge: "Pro Quotes",
  },
];

// Exact list of Service Home Pages where this floating switcher should appear
const SERVICE_HOME_PATHS = new Set([
  "/food/user",
  "/food",
  "/quick",
  "/porter",
  "/taxi",
  "/bike-rent",
  "/services",
  "/construction",
]);

export default function FloatingServiceSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { modules: enabledModules } = useEnabledModules();

  const rawPath = location.pathname || "";
  const normalizedPath = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;

  // STRICT REQUIREMENT: Only render on each service's HOME page, NOT on sub-routes
  if (!SERVICE_HOME_PATHS.has(normalizedPath)) {
    return null;
  }

  const activeModules = MODULE_ITEMS.filter(
    (m) => enabledModules[m.moduleKey] !== false
  );

  const handleSelect = (item) => {
    rememberUserModulePath(item.path);
    try {
      localStorage.setItem("selected_module", item.moduleKey);
    } catch {
      /* ignore */
    }
    navigate(item.path);
    setIsOpen(false);
  };

  return (
    <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-[9999] pointer-events-auto font-sans">
      {/* Popover Drawer / Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Dark backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-[-1]"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 20 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="absolute bottom-16 right-0 w-[310px] sm:w-[350px] bg-white dark:bg-[#141417] rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xl p-4 sm:p-5 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center shadow-md">
                    <UniqueServiceHubIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                      Switch Service
                    </h3>
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                      SMSPRO Super-App
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Service List */}
              <div className="grid grid-cols-1 gap-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                {activeModules.map((item) => {
                  const Icon = item.icon;
                  const isCurrent = normalizedPath === item.path || (item.path === "/food/user" && normalizedPath === "/food");

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      className={`flex items-center gap-3 p-2.5 rounded-2xl border transition-all text-left group ${
                        isCurrent
                          ? "bg-orange-50/90 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800/80 shadow-xs"
                          : "bg-slate-50/70 dark:bg-slate-900/60 border-slate-100 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:border-slate-200"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl ${item.iconBg} flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform`}>
                        <Icon className="w-4.5 h-4.5" strokeWidth={2.2} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                            {item.title}
                          </span>
                          {isCurrent ? (
                            <span className="text-[9px] font-extrabold uppercase tracking-wide bg-orange-500 text-white px-2 py-0.5 rounded-full shrink-0">
                              Active
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 bg-slate-200/60 dark:bg-slate-800 px-1.5 py-0.5 rounded-md shrink-0">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {item.tagline}
                        </p>
                      </div>

                      <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isCurrent ? "text-orange-500" : "text-slate-300 group-hover:translate-x-0.5"}`} />
                    </button>
                  );
                })}
              </div>

              {/* Footer Grid Link */}
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                <button
                  type="button"
                  onClick={() => {
                    navigate("/modules");
                    setIsOpen(false);
                  }}
                  className="w-full py-2 rounded-xl bg-gradient-to-r from-orange-500 via-rose-500 to-red-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  View All Services Grid
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Unique Floating Trigger FAB Button */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setIsOpen(!isOpen)}
        className="relative group flex items-center justify-center w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-[0_10px_25px_rgba(15,23,42,0.35)] border-2 border-white dark:border-slate-800"
        aria-label="Switch Services"
      >
        {/* Pulse Glow Effect */}
        <span className="absolute -inset-1 rounded-full bg-orange-500/25 animate-ping pointer-events-none" />

        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="w-6 h-6 stroke-[2.5]" />
            </motion.div>
          ) : (
            <motion.div
              key="icon"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center relative"
            >
              <UniqueServiceHubIcon className="w-7 h-7" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hover Tooltip Badge */}
        {!isOpen && (
          <span className="absolute right-full mr-3 hidden sm:flex items-center gap-1.5 whitespace-nowrap bg-slate-900/95 text-white text-xs font-extrabold px-3 py-1.5 rounded-full shadow-lg border border-slate-700/60 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <Sparkles className="w-3.5 h-3.5 text-orange-400" />
            Switch Services
          </span>
        )}
      </motion.button>
    </div>
  );
}
