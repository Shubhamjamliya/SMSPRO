import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  Save,
  Truck,
  Check,
  ChevronDown,
  UtensilsCrossed,
  Zap,
  CarTaxiFront,
  Bike,
  LayoutGrid,
  RotateCcw,
  Plus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader, StatusBadge, EmptyState } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { cn } from "@/lib/utils";
import {
  getVehicleConfiguration,
  saveModuleVehicleMappings,
} from "@/modules/common/api/vehicleConfigurations";

const MODULE_META = {
  food: {
    icon: UtensilsCrossed,
    iconClass: "bg-red-50 text-red-600",
    accentClass: "border-red-200 bg-red-50 text-red-700",
  },
  quickCommerce: {
    icon: Zap,
    iconClass: "bg-emerald-50 text-emerald-600",
    accentClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  porter: {
    icon: Truck,
    iconClass: "bg-blue-50 text-blue-600",
    accentClass: "border-blue-200 bg-blue-50 text-blue-700",
  },
  taxi: {
    icon: CarTaxiFront,
    iconClass: "bg-amber-50 text-amber-600",
    accentClass: "border-amber-200 bg-amber-50 text-amber-700",
  },
  bikeRent: {
    icon: Bike,
    iconClass: "bg-teal-50 text-teal-600",
    accentClass: "border-teal-200 bg-teal-50 text-teal-700",
  },
};

const FALLBACK_META = {
  icon: LayoutGrid,
  iconClass: "bg-gray-100 text-gray-600",
  accentClass: "border-gray-200 bg-gray-50 text-gray-700",
};

const getVehicleId = (vehicle) => String(vehicle?._id || vehicle?.id || "");

const normalizeMappings = (raw, modules) =>
  Object.fromEntries(
    modules.map((module) => [
      module.key,
      Array.isArray(raw?.[module.key]) ? raw[module.key].map(String) : [],
    ]),
  );

function VehicleTile({ vehicle, selected, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
        selected
          ? "border-[var(--just-order-primary,#ef4444)] bg-red-50/50 shadow-sm"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50",
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
        {vehicle.icon?.url ? (
          <img
            src={vehicle.icon.url}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : (
          <Truck size={16} className="text-gray-400" />
        )}
      </div>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
        {vehicle.name}
      </span>
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          selected
            ? "border-[var(--just-order-primary,#ef4444)] bg-[var(--just-order-primary,#ef4444)] text-white"
            : "border-gray-300 bg-white text-transparent group-hover:border-gray-400",
        )}
      >
        <Check size={12} strokeWidth={3} />
      </span>
    </button>
  );
}

function ModuleMappingCard({
  module,
  vehicles,
  selectedIds,
  onToggleVehicle,
  onSelectAll,
  onClearAll,
}) {
  const [expanded, setExpanded] = useState(true);
  const [query, setQuery] = useState("");

  const meta = MODULE_META[module.key] || FALLBACK_META;
  const Icon = meta.icon;
  const selectedCount = selectedIds.size;

  const filteredVehicles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((vehicle) =>
      String(vehicle.name || "").toLowerCase().includes(q),
    );
  }, [vehicles, query]);

  const allFilteredSelected =
    filteredVehicles.length > 0 &&
    filteredVehicles.every((vehicle) => selectedIds.has(getVehicleId(vehicle)));

  return (
    <div className="just-order-card overflow-hidden">
      {/* Card header — always visible, toggles the body */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5"
      >
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            meta.iconClass,
          )}
        >
          <Icon size={20} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-bold text-gray-900 sm:text-base">
              {module.label}
            </h3>
            <StatusBadge
              status={module.enabled ? "active" : "inactive"}
              label={module.enabled ? "Enabled" : "Disabled"}
            />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {selectedCount > 0
              ? `${selectedCount} vehicle${selectedCount === 1 ? "" : "s"} assigned`
              : "No vehicles assigned"}
          </p>
        </div>

        <span
          className={cn(
            "hidden shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-bold sm:inline-flex",
            selectedCount > 0 ? meta.accentClass : "border-gray-200 bg-gray-50 text-gray-500",
          )}
        >
          {selectedCount} / {vehicles.length}
        </span>
        <ChevronDown
          size={18}
          className={cn(
            "shrink-0 text-gray-400 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 sm:px-5">
          {vehicles.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              No active vehicles available. Add vehicles in Vehicle
              Configuration first.
            </p>
          ) : (
            <>
              {/* Toolbar: search + bulk actions */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-9 text-sm"
                    placeholder={`Search vehicles for ${module.label}...`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1 sm:ml-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={filteredVehicles.length === 0 || allFilteredSelected}
                    onClick={() => onSelectAll(filteredVehicles)}
                  >
                    Select all
                  </Button>
                  <span className="text-gray-300">|</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-gray-500"
                    disabled={selectedCount === 0}
                    onClick={onClearAll}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {/* Vehicle grid — capped height so 50+ vehicles stay manageable */}
              {filteredVehicles.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No vehicles match "{query}"
                </p>
              ) : (
                <div className="mt-3 grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredVehicles.map((vehicle) => {
                    const id = getVehicleId(vehicle);
                    return (
                      <VehicleTile
                        key={id}
                        vehicle={vehicle}
                        selected={selectedIds.has(id)}
                        onToggle={() => onToggleVehicle(id)}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ModuleVehicleMapping() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modules, setModules] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [mappings, setMappings] = useState({});
  const [savedMappings, setSavedMappings] = useState({});

  const applyConfig = useCallback((config) => {
    const nextModules = Array.isArray(config?.modules) ? config.modules : [];
    const normalized = normalizeMappings(config?.mappings, nextModules);
    setModules(nextModules);
    setVehicles(Array.isArray(config?.vehicles) ? config.vehicles : []);
    setMappings(normalized);
    setSavedMappings(normalized);
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const config = await getVehicleConfiguration();
      applyConfig(config);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load mappings");
    } finally {
      setLoading(false);
    }
  }, [applyConfig]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const activeVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.status === "active"),
    [vehicles],
  );

  const selectedIdsByModule = useMemo(
    () =>
      Object.fromEntries(
        modules.map((module) => [
          module.key,
          new Set((mappings[module.key] || []).map(String)),
        ]),
      ),
    [modules, mappings],
  );

  const dirty = useMemo(
    () =>
      modules.some((module) => {
        const current = [...(mappings[module.key] || [])].sort();
        const saved = [...(savedMappings[module.key] || [])].sort();
        return (
          current.length !== saved.length ||
          current.some((id, index) => id !== saved[index])
        );
      }),
    [modules, mappings, savedMappings],
  );

  const totalAssigned = useMemo(
    () =>
      modules.reduce(
        (sum, module) => sum + (mappings[module.key]?.length || 0),
        0,
      ),
    [modules, mappings],
  );

  const toggleVehicle = (moduleKey, vehicleId) => {
    setMappings((prev) => {
      const current = Array.isArray(prev[moduleKey])
        ? prev[moduleKey].map(String)
        : [];
      const next = current.includes(vehicleId)
        ? current.filter((id) => id !== vehicleId)
        : [...current, vehicleId];
      return { ...prev, [moduleKey]: next };
    });
  };

  const selectAll = (moduleKey, vehicleList) => {
    setMappings((prev) => {
      const current = new Set(
        (Array.isArray(prev[moduleKey]) ? prev[moduleKey] : []).map(String),
      );
      vehicleList.forEach((vehicle) => current.add(getVehicleId(vehicle)));
      return { ...prev, [moduleKey]: [...current] };
    });
  };

  const clearAll = (moduleKey) => {
    setMappings((prev) => ({ ...prev, [moduleKey]: [] }));
  };

  const handleDiscard = () => {
    setMappings(savedMappings);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const config = await saveModuleVehicleMappings(
        normalizeMappings(mappings, modules),
      );
      applyConfig(config);
      toast.success("Module vehicle mappings saved");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save mappings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="just-order-theme-scope mx-auto max-w-6xl space-y-6 px-4 py-8 pb-28 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Global Settings"
        title="Module Vehicle Mapping"
        description="Choose which vehicles are available in each module. New modules appear here automatically."
        actions={
          <>
            {dirty && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleDiscard}
                disabled={saving}
              >
                <RotateCcw size={14} /> Discard
              </Button>
            )}
            <Button
              className="gap-2"
              onClick={handleSave}
              isLoading={saving}
              disabled={!dirty && !saving}
            >
              <Save size={16} /> Save Changes
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="just-order-card animate-pulse p-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gray-100" />
                <div className="space-y-2">
                  <div className="h-4 w-40 rounded bg-gray-100" />
                  <div className="h-3 w-24 rounded bg-gray-100" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="h-12 rounded-xl bg-gray-50" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : activeVehicles.length === 0 ? (
        <div className="just-order-card p-6">
          <EmptyState
            icon={<Truck className="h-10 w-10" />}
            title="No active vehicles to assign"
            description="Create and activate vehicles first, then come back to map them to modules."
            action={
              <Button
                className="gap-2"
                onClick={() =>
                  navigate("/admin/global-settings/vehicle-configuration")
                }
              >
                <Plus size={16} /> Go to Vehicle Configuration
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {modules.map((module) => (
            <ModuleMappingCard
              key={module.key}
              module={module}
              vehicles={activeVehicles}
              selectedIds={selectedIdsByModule[module.key] || new Set()}
              onToggleVehicle={(vehicleId) => toggleVehicle(module.key, vehicleId)}
              onSelectAll={(vehicleList) => selectAll(module.key, vehicleList)}
              onClearAll={() => clearAll(module.key)}
            />
          ))}
        </div>
      )}

      {/* Sticky unsaved-changes bar */}
      {dirty && !loading && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm text-gray-600">
              <span className="font-semibold text-gray-900">
                Unsaved changes
              </span>
              <span className="hidden sm:inline">
                {" "}
                — {totalAssigned} vehicle assignment
                {totalAssigned === 1 ? "" : "s"} across {modules.length} module
                {modules.length === 1 ? "" : "s"}
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDiscard}
                disabled={saving}
              >
                Discard
              </Button>
              <Button size="sm" className="gap-2" onClick={handleSave} isLoading={saving}>
                <Save size={14} /> Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
