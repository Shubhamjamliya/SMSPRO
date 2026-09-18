import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin,
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  Map,
  Bike,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";
import { useAuth } from "@core/context/AuthContext";
import { getCurrentUser } from "@food/utils/auth";
import {
  canPerformAdminPermissionAction,
  extractAdminPermissions,
  extractAdminRoleId,
  fetchAdminRolePermissions,
} from "@food/utils/adminPermissions";

const ZONE_PERM = "bikeRent::inventory::zones";
const BASE = "/admin/bike-rent/zones";

export default function Zones() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const currentUser = useMemo(() => authUser || getCurrentUser("admin"), [authUser]);
  const [resolvedPermissions, setResolvedPermissions] = useState({});
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let isMounted = true;
    const resolvePermissions = async () => {
      if (!currentUser || currentUser.role === "ADMIN") {
        if (isMounted) setResolvedPermissions({});
        return;
      }
      const existingPermissions = extractAdminPermissions(currentUser);
      if (Object.keys(existingPermissions).length > 0) {
        if (isMounted) setResolvedPermissions(existingPermissions);
        return;
      }
      const roleId = extractAdminRoleId(currentUser);
      if (!roleId) {
        if (isMounted) setResolvedPermissions({});
        return;
      }
      try {
        const rolePermissions = await fetchAdminRolePermissions(roleId);
        if (isMounted) setResolvedPermissions(rolePermissions);
      } catch {
        if (isMounted) setResolvedPermissions({});
      }
    };
    resolvePermissions();
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const canCreate = useMemo(
    () => canPerformAdminPermissionAction(currentUser, resolvedPermissions, ZONE_PERM, "create"),
    [currentUser, resolvedPermissions],
  );
  const canEdit = useMemo(
    () => canPerformAdminPermissionAction(currentUser, resolvedPermissions, ZONE_PERM, "edit"),
    [currentUser, resolvedPermissions],
  );
  const canDelete = useMemo(
    () => canPerformAdminPermissionAction(currentUser, resolvedPermissions, ZONE_PERM, "delete"),
    [currentUser, resolvedPermissions],
  );

  const fetchZones = async () => {
    try {
      setLoading(true);
      const result = await bikeRentAdminApi.getZones({ limit: 100, sortBy: "name", sortOrder: "asc" });
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
    if (!canDelete) {
      toast.error("Permission denied");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this zone?")) return;
    try {
      await bikeRentAdminApi.deleteZone(zoneId);
      toast.success("Zone deleted successfully");
      fetchZones();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete zone");
    }
  };

  const filteredZones = zones.filter(
    (zone) =>
      zone.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      zone.country?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      zone.polygon?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const zoneId = (zone) => zone.id || zone._id;
  const isActive = (zone) => zone.status === "active" || zone.isActive === true;

  return (
    <div className="p-2 lg:p-3 bg-slate-50 min-h-screen overflow-x-hidden">
      <div className="w-full mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-lg bg-red-500 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">
                Bike Rent Zone Setup
              </h1>
              <p className="text-sm text-slate-600">Manage service zones and pickup hubs</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`${BASE}/map`)}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
            >
              <Map className="w-5 h-5" />
              <span>View Map</span>
            </button>
            {canCreate && (
              <button
                type="button"
                onClick={() => navigate(`${BASE}/add`)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Plus className="w-5 h-5" />
                <span>Add Zone</span>
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search zones by name or country..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-slate-600">Loading zones...</p>
          </div>
        ) : filteredZones.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 sm:p-12 text-center">
            <MapPin className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No zones found</h3>
            <p className="text-slate-600 mb-6">
              {searchQuery
                ? "Try adjusting your search query"
                : "Create your first Bike Rent zone to get started"}
            </p>
            {!searchQuery && canCreate && (
              <button
                type="button"
                onClick={() => navigate(`${BASE}/add`)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
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
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Country</th>
                    <th className="px-4 py-3">Unit</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Hubs</th>
                    <th className="px-4 py-3">Available bikes</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredZones.map((zone) => {
                    const id = zoneId(zone);
                    const hubs = Number(zone.hubCount ?? 0);
                    const available = Number(zone.availableBikes ?? 0);
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
                        <td className="px-4 py-3">
                          {zone.ownerType === "vendor" ? (
                            <span className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                              {zone.vendor?.businessName || "Vendor"}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                              Platform
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{zone.country || "—"}</td>
                        <td className="px-4 py-3 text-slate-600 capitalize">{zone.unit || "kilometer"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                              isActive(zone)
                                ? "bg-green-100 text-green-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {isActive(zone) ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                            <Warehouse className="h-3.5 w-3.5 text-slate-400" />
                            {hubs}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <span
                            className="inline-flex items-center gap-1.5"
                            title="Available bikes in this zone"
                          >
                            <Bike className="h-3.5 w-3.5 text-slate-400" />
                            <span className="font-semibold">{available}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {canCreate || canEdit ? (
                              <button
                                type="button"
                                onClick={() => navigate(`${BASE}/view/${id}`)}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#FF6A00] px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#e55f00]"
                                title="Create hub for this zone"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Create Hub
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => navigate(`${BASE}/view/${id}`)}
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-blue-50 hover:text-blue-600"
                              title="View / manage hubs"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => navigate(`${BASE}/edit/${id}`)}
                                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-green-50 hover:text-green-600"
                                title="Edit zone"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDeleteZone(id)}
                                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-red-50 hover:text-red-600"
                                title="Delete zone"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
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
