import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MapPin, ShieldAlert } from "lucide-react";
import ZonePolygonMapField from "@/shared/components/maps/ZonePolygonMapField";
import ServiceProviderLayout from "../components/ServiceProviderLayout";
import serviceProviderApi from "../services/providerApi";

const STATUS_STYLES = {
  active: "bg-emerald-50 text-emerald-600",
  inactive: "bg-gray-100 text-gray-500",
};

export default function ServiceProviderMyZonesPage() {
  const [loading, setLoading] = useState(true);
  const [zone, setZone] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dashboard = await serviceProviderApi.getDashboard();
      setZone(dashboard.provider?.zone || null);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not load your service zone");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ServiceProviderLayout title="My Zone" subtitle="The service area you're assigned to — set by Admin during onboarding." fullWidth>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !zone ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 text-sm font-semibold text-gray-700">No service zone on file</p>
          <p className="mt-1 text-sm text-gray-500">
            This shouldn&apos;t happen for an approved provider — contact support if this persists.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00]/10 text-[#FF6A00]">
                <MapPin className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-extrabold text-gray-900">My Service Zone: {zone.name}</h2>
                <p className="text-xs text-gray-500">
                  {zone.country || "India"} · {zone.unit === "mile" ? "Miles" : "Kilometers"}
                </p>
              </div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${STATUS_STYLES[zone.status] || STATUS_STYLES.inactive}`}>
              {zone.status === "active" ? "Active" : "Inactive"}
            </span>
          </div>

          <div className="p-4 sm:p-6">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Zone boundary</p>
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <ZonePolygonMapField
                coordinates={[]}
                onCoordinatesChange={() => {}}
                existingZones={[zone]}
                isEditMode={false}
                selectedZoneId={zone._id}
                readOnly
              />
            </div>
            <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
              Your zone is assigned by Admin and set during onboarding. Contact support if you need it changed.
            </p>
          </div>
        </div>
      )}
    </ServiceProviderLayout>
  );
}
