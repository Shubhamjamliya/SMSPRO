import React, { useState, useEffect } from "react";
import {
  ChevronRight,
  Loader2,
  LayoutGrid,
  Zap,
  AlertCircle,
  Bike,
  CarTaxiFront,
  Truck,
  UtensilsCrossed,
  Wrench,
  HardHat,
} from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@/services/api";
import { setCachedSettings } from "@/modules/common/utils/businessSettings";
import { normalizeEnabledModules } from "@/modules/common/utils/enabledModules";
import { cn } from "@/lib/utils";

const MODULE_CARDS = [
  {
    key: "food",
    title: "Food Delivery",
    description: "Restaurants, menus, and food delivery for customers.",
    icon: UtensilsCrossed,
    activeClass: "border-red-200 bg-red-50/60",
    iconActiveClass: "bg-red-500 text-white",
    toggleActiveClass: "bg-red-500",
    glowClass: "bg-red-500",
  },
  {
    key: "quickCommerce",
    title: "Quick Commerce",
    description: "Instant groceries and essentials for customers.",
    icon: Zap,
    activeClass: "border-emerald-200 bg-emerald-50/60",
    iconActiveClass: "bg-emerald-500 text-white",
    toggleActiveClass: "bg-emerald-500",
    glowClass: "bg-emerald-500",
  },
  {
    key: "porter",
    title: "Porter / Logistics",
    description: "Parcel delivery and logistics booking for customers.",
    icon: Truck,
    activeClass: "border-blue-200 bg-blue-50/60",
    iconActiveClass: "bg-blue-500 text-white",
    toggleActiveClass: "bg-blue-500",
    glowClass: "bg-blue-500",
  },
  {
    key: "taxi",
    title: "Taxi",
    description: "On-demand taxi rides for customers.",
    icon: CarTaxiFront,
    activeClass: "border-amber-200 bg-amber-50/60",
    iconActiveClass: "bg-amber-500 text-white",
    toggleActiveClass: "bg-amber-500",
    glowClass: "bg-amber-500",
  },
  {
    key: "bikeRent",
    title: "Bike Rent",
    description: "Hourly and daily bike rentals for customers.",
    icon: Bike,
    activeClass: "border-teal-200 bg-teal-50/60",
    iconActiveClass: "bg-teal-500 text-white",
    toggleActiveClass: "bg-teal-500",
    glowClass: "bg-teal-500",
  },
  {
    key: "serviceProvider",
    title: "Service Provider",
    description: "On-demand home services like repairs, cleaning, and electrical work.",
    icon: Wrench,
    activeClass: "border-violet-200 bg-violet-50/60",
    iconActiveClass: "bg-violet-500 text-white",
    toggleActiveClass: "bg-violet-500",
    glowClass: "bg-violet-500",
  },
  {
    key: "construction",
    title: "Construction",
    description:
      "Verified contractors, itemised quotes, and stage-by-stage project payments.",
    icon: HardHat,
    activeClass: "border-orange-200 bg-orange-50/60",
    iconActiveClass: "bg-orange-500 text-white",
    toggleActiveClass: "bg-orange-500",
    glowClass: "bg-orange-500",
  },
];

const ModuleCard = ({
  title,
  description,
  icon: Icon,
  enabled,
  saving,
  onToggle,
  activeClass,
  iconActiveClass,
  toggleActiveClass,
  glowClass,
}) => (
  <div
    className={cn(
      "relative overflow-hidden rounded-2xl border-2 p-4 sm:p-5 md:p-6 transition-all duration-300",
      enabled ? activeClass : "border-gray-100 bg-white",
    )}
  >
    <div className="relative z-10 flex items-start justify-between gap-3 sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors sm:h-12 sm:w-12",
            enabled ? iconActiveClass : "bg-gray-100 text-gray-400",
          )}
        >
          <Icon size={22} />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-900 sm:text-lg">
            {title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">
            {description}
          </p>
        </div>
      </div>

      <button
        type="button"
        aria-label={`${enabled ? "Disable" : "Enable"} ${title}`}
        disabled={saving}
        onClick={onToggle}
        className={cn(
          "relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors duration-200 outline-none disabled:opacity-60 sm:h-8 sm:w-14",
          enabled ? toggleActiveClass : "bg-gray-200",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 sm:top-1 sm:left-1",
            enabled ? "translate-x-5 sm:translate-x-6" : "translate-x-0",
          )}
        />
      </button>
    </div>

    <div
      className={cn(
        "absolute -right-6 -bottom-6 h-24 w-24 rounded-full opacity-10 blur-3xl transition-colors",
        enabled ? glowClass : "bg-transparent",
      )}
    />
  </div>
);

const ModuleManagement = () => {
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [modules, setModules] = useState(normalizeEnabledModules());

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getBusinessSettings();
      const settings = response?.data?.data || response?.data;
      if (settings?.modules) {
        setModules(normalizeEnabledModules(settings.modules));
      }
    } catch (err) {
      console.error("Fetch error:", err);
      toast.error("Failed to load module settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleToggle = async (name) => {
    const previousModules = modules;
    const nextModules = {
      ...modules,
      [name]: !modules[name],
    };

    setModules(nextModules);
    setSavingKey(name);

    try {
      const response = await adminAPI.updateBusinessSettings({
        modules: nextModules,
      });
      const updatedSettings = response?.data?.data || response?.data;

      if (updatedSettings) {
        setModules(normalizeEnabledModules(updatedSettings.modules));
        setCachedSettings(updatedSettings);
        const label =
          MODULE_CARDS.find((card) => card.key === name)?.title || "Module";
        toast.success(
          `${label} ${nextModules[name] ? "enabled" : "disabled"} for customers`,
        );
        return;
      }

      throw new Error("No settings returned");
    } catch (err) {
      setModules(previousModules);
      toast.error(err?.response?.data?.message || "Failed to update module");
    } finally {
      setSavingKey("");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50 px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-sm font-black tracking-widest text-gray-800 uppercase sm:text-[15px]">
            Module Management
          </h1>
          <p className="mt-1 text-xs font-medium text-gray-500 sm:text-sm">
            Enable or disable customer-facing modules across the app
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold tracking-widest text-gray-400 uppercase sm:text-[11px]">
          <span>Customization</span>
          <ChevronRight size={12} strokeWidth={3} />
          <span className="text-gray-600">Modules</span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl sm:rounded-3xl">
          <div className="flex items-center gap-3 border-b border-gray-50 bg-gray-50/40 px-4 py-4 sm:px-6 sm:py-5">
            <LayoutGrid className="shrink-0 text-indigo-500" size={20} />
            <h2 className="text-sm font-bold tracking-tight text-gray-700 uppercase">
              Active Modules
            </h2>
          </div>

          <div className="space-y-4 px-4 py-5 sm:space-y-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {MODULE_CARDS.map((card) => (
                <ModuleCard
                  key={card.key}
                  title={card.title}
                  description={card.description}
                  icon={card.icon}
                  enabled={modules[card.key] !== false}
                  saving={savingKey === card.key}
                  onToggle={() => handleToggle(card.key)}
                  activeClass={card.activeClass}
                  iconActiveClass={card.iconActiveClass}
                  toggleActiveClass={card.toggleActiveClass}
                  glowClass={card.glowClass}
                />
              ))}
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 sm:gap-4 sm:p-5">
              <AlertCircle
                className="mt-0.5 shrink-0 text-indigo-500"
                size={20}
              />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-indigo-900">Important</h4>
                <p className="text-xs leading-relaxed text-indigo-700 sm:text-sm">
                  Disabling a module hides it from the customer app immediately
                  and redirects users to the next available module. Admin
                  navigation is updated as well.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModuleManagement;
