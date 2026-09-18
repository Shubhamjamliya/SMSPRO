import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  UtensilsCrossed,
  ShoppingBag,
  Truck,
  CarTaxiFront,
  Bike,
  Wrench,
  HardHat,
  ArrowRight,
  Search,
  User,
  Sparkles,
  ShieldCheck,
  Zap,
  CheckCircle2,
  ChevronRight,
  Compass,
} from "lucide-react";
import { useEnabledModules } from "../hooks/useEnabledModules";
import { rememberUserModulePath } from "../utils/enabledModules";
import { useAuth } from "@core/context/AuthContext";
import { useLocation } from "@food/hooks/useLocation";

const ALL_MODULE_DEFINITIONS = [
  {
    id: "food",
    moduleKey: "food",
    title: "Food Delivery",
    tagline: "Top Restaurants & Meals",
    description: "Order hot meals from 500+ top local restaurants.",
    path: "/food/user",
    icon: UtensilsCrossed,
    badgeText: "500+ Restos",
    badgeColor: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
    bgLight: "bg-gradient-to-br from-red-50/90 via-white to-orange-50/40 dark:from-red-950/20 dark:to-orange-950/10",
    borderColor: "border-red-200/80 dark:border-red-800/40 hover:border-red-400",
    iconBg: "bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-red-500/25",
  },
  {
    id: "quickCommerce",
    moduleKey: "quickCommerce",
    title: "Quick Commerce",
    tagline: "10 Min Grocery",
    description: "Fresh groceries, snacks & essentials delivered in minutes.",
    path: "/quick",
    icon: ShoppingBag,
    badgeText: "10 Min Delivery",
    badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    bgLight: "bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/40 dark:from-emerald-950/20 dark:to-teal-950/10",
    borderColor: "border-emerald-200/80 dark:border-emerald-800/40 hover:border-emerald-400",
    iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/25",
  },
  {
    id: "porter",
    moduleKey: "porter",
    title: "Porter Courier",
    tagline: "Instant Parcel",
    description: "Send packages & parcels across town with OTP safety.",
    path: "/porter",
    icon: Truck,
    badgeText: "Instant Parcel",
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    bgLight: "bg-gradient-to-br from-blue-50/90 via-white to-indigo-50/40 dark:from-blue-950/20 dark:to-indigo-950/10",
    borderColor: "border-blue-200/80 dark:border-blue-800/40 hover:border-blue-400",
    iconBg: "bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-blue-600/25",
  },
  {
    id: "taxi",
    moduleKey: "taxi",
    title: "Taxi & Rides",
    tagline: "Cabs & Autos",
    description: "Book comfortable cab rides & autos at best rates.",
    path: "/taxi",
    icon: CarTaxiFront,
    badgeText: "Instant Rides",
    badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    bgLight: "bg-gradient-to-br from-amber-50/90 via-white to-yellow-50/40 dark:from-amber-950/20 dark:to-yellow-950/10",
    borderColor: "border-amber-200/80 dark:border-amber-800/40 hover:border-amber-400",
    iconBg: "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-amber-500/25",
  },
  {
    id: "bikeRent",
    moduleKey: "bikeRent",
    title: "Bike Rental",
    tagline: "Self Drive",
    description: "Rent scooters, electric bikes & motorbikes hourly/daily.",
    path: "/bike-rent",
    icon: Bike,
    badgeText: "Self Drive",
    badgeColor: "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300",
    bgLight: "bg-gradient-to-br from-purple-50/90 via-white to-violet-50/40 dark:from-purple-950/20 dark:to-violet-950/10",
    borderColor: "border-purple-200/80 dark:border-purple-800/40 hover:border-purple-400",
    iconBg: "bg-gradient-to-br from-purple-600 to-violet-600 text-white shadow-purple-600/25",
  },
  {
    id: "serviceProvider",
    moduleKey: "serviceProvider",
    title: "Home Services",
    tagline: "Repairs & Pros",
    description: "Book verified plumbers, electricians, cleaning & beauty pros.",
    path: "/services",
    icon: Wrench,
    badgeText: "Verified Pros",
    badgeColor: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300",
    bgLight: "bg-gradient-to-br from-cyan-50/90 via-white to-blue-50/40 dark:from-cyan-950/20 dark:to-blue-950/10",
    borderColor: "border-cyan-200/80 dark:border-cyan-800/40 hover:border-cyan-400",
    iconBg: "bg-gradient-to-br from-cyan-600 to-blue-600 text-white shadow-cyan-600/25",
  },
  {
    id: "construction",
    moduleKey: "construction",
    title: "Construction",
    tagline: "Civil Work & Quotes",
    description: "Get contractor quotes, civil work estimates & turnkey plans.",
    path: "/construction",
    icon: HardHat,
    badgeText: "Pro Quotes",
    badgeColor: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300",
    bgLight: "bg-gradient-to-br from-orange-50/90 via-white to-amber-50/40 dark:from-orange-950/20 dark:to-amber-950/10",
    borderColor: "border-orange-200/80 dark:border-orange-800/40 hover:border-orange-400",
    iconBg: "bg-gradient-to-br from-orange-600 to-amber-600 text-white shadow-orange-600/25",
  },
];

import AppMobileFrame from "../components/AppMobileFrame";

export default function ModuleSelectionScreen() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { location } = useLocation();
  const { modules: enabledModules, loading: modulesLoading } = useEnabledModules();
  const [searchQuery, setSearchQuery] = useState("");

  const activeModules = useMemo(() => {
    return ALL_MODULE_DEFINITIONS.filter(
      (m) => enabledModules[m.moduleKey] !== false
    );
  }, [enabledModules]);

  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return activeModules;
    const query = searchQuery.toLowerCase();
    return activeModules.filter(
      (m) =>
        m.title.toLowerCase().includes(query) ||
        m.tagline.toLowerCase().includes(query) ||
        m.description.toLowerCase().includes(query)
    );
  }, [activeModules, searchQuery]);

  const handleSelectModule = (moduleItem) => {
    rememberUserModulePath(moduleItem.path);
    try {
      localStorage.setItem("selected_module", moduleItem.moduleKey);
    } catch {
      /* ignore */
    }
    navigate(moduleItem.path);
  };

  return (
    <AppMobileFrame bgClassName="bg-white dark:bg-[#121215]">
      {/* Top Sticky Header */}
      <div className="w-full">
          <header className="sticky top-0 z-50 bg-white/95 dark:bg-[#121215]/95 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800 shadow-2xs px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              {/* Brand Logo - SMSPRO */}
              <div className="flex items-center gap-2 cursor-pointer group" onClick={() => navigate("/modules")}>
                <div className="w-9 h-9 bg-gradient-to-br from-blue-600 via-indigo-600 to-orange-500 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                  <Zap className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-lg font-black tracking-tighter italic text-slate-900 dark:text-white">
                      SMS<span className="text-orange-500">PRO</span>
                    </span>
                    <span className="bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[8.5px] font-extrabold px-1.5 py-0.2 rounded-full border border-orange-500/20 uppercase tracking-widest">
                      App
                    </span>
                  </div>
                  <span className="text-[9.5px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 block -mt-0.5">
                    Super-App Ecosystem
                  </span>
                </div>
              </div>

              {/* Account Link */}
              <button
                type="button"
                onClick={() => navigate(isAuthenticated ? "/food/user/profile" : "/user/auth/login")}
                className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-full hover:bg-slate-200 transition-all text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs"
              >
                <User className="w-3.5 h-3.5 text-orange-500" />
                <span>{isAuthenticated ? "Account" : "Sign In"}</span>
              </button>
            </div>
          </header>

          {/* Main Body Content */}
          <main className="px-4 py-5 space-y-5">
            {/* Hero Heading */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 px-3 py-1 rounded-full text-[11px] font-extrabold text-orange-600 dark:text-orange-400">
                <Sparkles className="w-3.5 h-3.5 text-orange-500 animate-pulse" />
                <span>SMSPRO All-In-One Super-App</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white leading-tight">
                All Your Services in <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-orange-500 to-red-500">One Place</span>
              </h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                Tap any module to instantly launch Food, Cabs, Groceries, Courier or Construction.
              </p>

              {/* Search Bar */}
              {activeModules.length > 3 && (
                <div className="pt-2 max-w-sm mx-auto">
                  <div className="relative flex items-center">
                    <Search className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search services (food, taxi, grocery, porter)..."
                      className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-2xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modules Grid — Responsive 2 Columns in App View */}
            {modulesLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-44 rounded-3xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                ))}
              </div>
            ) : filteredModules.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6">
                <Compass className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Services Found</h3>
                <p className="text-xs text-slate-500 mt-1">No active modules match "{searchQuery}".</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredModules.map((item, idx) => {
                  const IconComponent = item.icon;
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.03 * idx }}
                      onClick={() => handleSelectModule(item)}
                      className="group cursor-pointer flex flex-col h-full"
                    >
                      <div className={`relative flex-1 ${item.bgLight} border ${item.borderColor} rounded-3xl p-3.5 flex flex-col justify-between shadow-2xs hover:shadow-md transition-all duration-200`}>
                        
                        {/* Badge */}
                        <div className="flex items-center justify-between gap-1 mb-2.5">
                          <span className={`text-[9.5px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full truncate max-w-[90px] ${item.badgeColor}`}>
                            {item.badgeText}
                          </span>
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        </div>

                        {/* Icon & Title */}
                        <div className="space-y-2 mb-2">
                          <div className={`w-10 h-10 ${item.iconBg} rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                            <IconComponent className="w-5 h-5 stroke-[2.2]" />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-slate-900 dark:text-white truncate group-hover:text-orange-600 transition-colors">
                              {item.title}
                            </h3>
                            <p className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 truncate">
                              {item.tagline}
                            </p>
                          </div>
                        </div>

                        {/* Action CTA */}
                        <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between mt-auto">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                            Open <ArrowRight className="w-3 h-3 text-orange-500" />
                          </span>
                          <div className="w-6 h-6 rounded-full bg-white dark:bg-slate-800 group-hover:bg-orange-500 flex items-center justify-center shadow-2xs transition-colors">
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
                          </div>
                        </div>

                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Trust Highlights */}
            <div className="pt-3">
              <div className="bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900 dark:text-white">Verified SMSPRO Partners</h4>
                    <p className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400">Top rated vendors, drivers & technicians</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0">
                    <Zap className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900 dark:text-white">Instant Fulfillment</h4>
                    <p className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400">Real-time booking & live tracking</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-900 dark:text-white">Unified SMSPRO Account</h4>
                    <p className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400">Single wallet & order history</p>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>

      {/* Bottom Footer */}
      <footer className="py-4 border-t border-slate-200/80 dark:border-slate-800 text-center text-[11px] font-semibold text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
        <p>&copy; 2026 SMSPRO Platform. All rights reserved.</p>
      </footer>
    </AppMobileFrame>
  );
}
