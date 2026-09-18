import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import VendorLayout from "../components/VendorLayout";
import { bikeVendorApi } from "../services/vendorApi";
import { getBikeVendorUser } from "../utils/authVendor";

export default function VendorZones() {
  const navigate = useNavigate();
  const myVendorId = getBikeVendorUser()?.id;
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await bikeVendorApi.getZones({ limit: 100 });
      setZones(data.records || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not load zones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (zone) => {
    try {
      await bikeVendorApi.updateZoneStatus(zone.id, {
        status: zone.status === "active" ? "inactive" : "active",
      });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not update status");
    }
  };

  const removeZone = async (zone) => {
    if (!window.confirm(`Delete zone "${zone.name}"?`)) return;
    try {
      await bikeVendorApi.deleteZone(zone.id);
      toast.success("Zone deleted");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not delete zone");
    }
  };

  const ownerLabel = (zone) => {
    if (zone.ownerType === "admin") return "Platform zone";
    if (String(zone.vendorId) === String(myVendorId)) return "Your zone";
    return zone.vendor?.businessName || "Other vendor";
  };

  return (
    <VendorLayout
      title="Zones"
      subtitle="Zones you and other vendors/admin serve. You can only edit or delete zones you created."
      actions={
        <button
          type="button"
          onClick={() => navigate("/bike-rent/vendor/zones/new")}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF6A00] px-3 py-2 text-xs font-bold text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          New zone
        </button>
      }
    >
      {loading ? (
        <p className="text-sm text-gray-500">Loading zones…</p>
      ) : zones.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No zones yet. Create one to start adding pickup hubs.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {zones.map((zone) => {
            const isMine = zone.ownerType === "vendor" && String(zone.vendorId) === String(myVendorId);
            return (
              <div key={zone.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6A00]" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-900">{zone.name}</p>
                      <p className="text-xs text-gray-500">{zone.country}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      zone.status === "active"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {zone.status}
                  </span>
                </div>
                <p className="mt-2 text-[11px] font-semibold text-gray-400">{ownerLabel(zone)}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span>
                    Hubs: {zone.hubCount || 0} · Bikes: {zone.bikes || 0}
                  </span>
                  {isMine && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleStatus(zone)}
                        className="rounded-lg border border-gray-200 px-2 py-1 font-bold text-gray-600 hover:bg-gray-50"
                      >
                        {zone.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/bike-rent/vendor/zones/${zone.id}/edit`)}
                        className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeZone(zone)}
                        className="rounded-lg border border-red-100 p-1.5 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </VendorLayout>
  );
}
