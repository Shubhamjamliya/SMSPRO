import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, Plus, Search, Edit, Trash2, Map } from "lucide-react";
import { toast } from "sonner";
import serviceProviderAdminApi from "../services/adminApi";

const BASE = "/admin/service-provider/zones";

export default function ServiceProviderZones() {
  const navigate = useNavigate();
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchZones = async () => {
    try {
      setLoading(true);
      const result = await serviceProviderAdminApi.getZones({ limit: 100 });
      setZones(result.records || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load zones");
      setZones([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchZones();
  }, []);

  const handleDeleteZone = async (zoneId) => {
    if (!window.confirm("Are you sure you want to delete this zone?")) return;
    try {
      await serviceProviderAdminApi.deleteZone(zoneId);
      toast.success("Zone deleted successfully");
      fetchZones();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete zone");
    }
  };

  const filteredZones = zones.filter(
    (zone) =>
      zone.name?.toLowerCase().includes(searchQuery.toLowerCase())
      || zone.country?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const zoneId = (zone) => zone.id || zone._id;
  const isActive = (zone) => zone.status === "active";

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 p-2 lg:p-3">
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500">
              <MapPin className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-slate-900 sm:text-2xl">
                Service Provider Zone Setup
              </h1>
              <p className="text-sm text-slate-600">Manage the service areas providers can operate in</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`${BASE}/map`)}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm text-white transition-colors hover:bg-green-700 sm:px-4"
            >
              <Map className="h-5 w-5" />
              <span>View Map</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(`${BASE}/add`)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700 sm:px-4"
            >
              <Plus className="h-5 w-5" />
              <span>Add Zone</span>
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search zones by name or country..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            <p className="text-slate-600">Loading zones...</p>
          </div>
        ) : filteredZones.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
            <MapPin className="mx-auto mb-4 h-16 w-16 text-slate-400" />
            <h3 className="mb-2 text-lg font-semibold text-slate-900">No zones found</h3>
            <p className="mb-6 text-slate-600">
              {searchQuery ? "Try adjusting your search query" : "Create your first Service Provider zone to get started"}
            </p>
            {!searchQuery && (
              <button
                type="button"
                onClick={() => navigate(`${BASE}/add`)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
              >
                <Plus className="h-5 w-5" />
                <span>Add Zone</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Zone</th>
                    <th className="px-4 py-3">Country</th>
                    <th className="px-4 py-3">Unit</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredZones.map((zone) => {
                    const id = zoneId(zone);
                    return (
                      <tr key={id} className="border-t border-slate-100 hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{zone.name || "Unnamed Zone"}</p>
                          {Array.isArray(zone.coordinates) && zone.coordinates.length > 0 ? (
                            <p className="text-xs text-slate-500">{zone.coordinates.length} polygon points</p>
                          ) : (
                            <p className="text-xs text-slate-400">No polygon</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{zone.country || "—"}</td>
                        <td className="px-4 py-3 capitalize text-slate-600">{zone.unit || "kilometer"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                              isActive(zone) ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {isActive(zone) ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => navigate(`${BASE}/edit/${id}`)}
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-green-50 hover:text-green-600"
                              title="Edit zone"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteZone(id)}
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-red-50 hover:text-red-600"
                              title="Delete zone"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
