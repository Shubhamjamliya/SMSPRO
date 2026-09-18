import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/shared/components/admin";
import bikeRentAdminApi from "../services/adminApi";
import { BIKE_RENT_ADMIN_SELECT_CLASS } from "../utils/adminTheme";
import HubLocationPicker from "../../shared/components/HubLocationPicker";

const EMPTY = {
  name: "",
  address: "",
  landmark: "",
  instructions: "",
  lat: null,
  lng: null,
  status: "active",
};

const message = (error, fallback) => error?.response?.data?.message || fallback;
const getId = (item) => item?.id || item?._id;

const DUPLICATE_LOCATION_METERS = 80;

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function findDuplicateHub({ hubs, name, lat, lng, excludeId = null }) {
  const normalizedName = String(name || "").trim().toLowerCase();
  const latNum = Number(lat);
  const lngNum = Number(lng);

  for (const hub of hubs || []) {
    const hubId = getId(hub);
    if (excludeId && String(hubId) === String(excludeId)) continue;

    if (normalizedName && String(hub.name || "").trim().toLowerCase() === normalizedName) {
      return { type: "name", hub };
    }

    const existingLat = Number(hub.lat);
    const existingLng = Number(hub.lng);
    if (
      Number.isFinite(latNum) &&
      Number.isFinite(lngNum) &&
      Number.isFinite(existingLat) &&
      Number.isFinite(existingLng) &&
      haversineMeters(latNum, lngNum, existingLat, existingLng) <= DUPLICATE_LOCATION_METERS
    ) {
      return { type: "location", hub };
    }
  }
  return null;
}

export default function ZoneHubsPanel({
  zoneId,
  zoneCoordinates = [],
  onHubsChange,
}) {
  const [hubs, setHubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [mapMountReady, setMapMountReady] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    if (!zoneId) return;
    setLoading(true);
    try {
      const rows = await bikeRentAdminApi.getHubsByZone(zoneId);
      const list = Array.isArray(rows) ? rows : [];
      setHubs(list);
      onHubsChange?.(list);
    } catch (error) {
      toast.error(message(error, "Failed to load hubs"));
      setHubs([]);
      onHubsChange?.([]);
    } finally {
      setLoading(false);
    }
  }, [zoneId, onHubsChange]);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = (hub = null) => {
    setEditing(hub);
    setForm(
      hub
        ? {
            name: hub.name || "",
            address: hub.address || "",
            landmark: hub.landmark || "",
            instructions: hub.instructions || "",
            lat: hub.lat == null || hub.lat === "" ? null : Number(hub.lat),
            lng: hub.lng == null || hub.lng === "" ? null : Number(hub.lng),
            status: hub.status || "active",
          }
        : EMPTY,
    );
    setMapMountReady(false);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) {
      setMapMountReady(false);
      return undefined;
    }
    // Wait for dialog open animation so Google Maps gets a real container size
    const timer = setTimeout(() => setMapMountReady(true), 220);
    return () => clearTimeout(timer);
  }, [open]);

  const handleLocationChange = (location) => {
    setForm((current) => ({
      ...current,
      lat: location.lat == null ? null : Number(location.lat),
      lng: location.lng == null ? null : Number(location.lng),
      address: location.address || "",
    }));
  };

  const save = async () => {
    if (!String(form.name || "").trim()) {
      toast.error("Hub name is required");
      return;
    }
    if (!Number.isFinite(Number(form.lat)) || !Number.isFinite(Number(form.lng))) {
      toast.error("Please select a pickup location on the map within this zone");
      return;
    }
    if (!String(form.address || "").trim()) {
      toast.error("Please select a location on the map so the address can be captured");
      return;
    }

    const duplicate = findDuplicateHub({
      hubs,
      name: form.name,
      lat: form.lat,
      lng: form.lng,
      excludeId: getId(editing),
    });
    if (duplicate?.type === "name") {
      toast.error(`A hub named "${duplicate.hub.name}" already exists in this zone`);
      return;
    }
    if (duplicate?.type === "location") {
      toast.error(
        `Location is too close to existing hub "${duplicate.hub.name}". Pick a different spot.`,
      );
      return;
    }

    const payload = {
      name: form.name.trim(),
      address: form.address.trim(),
      landmark: String(form.landmark || "").trim(),
      instructions: String(form.instructions || "").trim(),
      lat: Number(form.lat),
      lng: Number(form.lng),
      status: form.status,
    };

    setSaving(true);
    try {
      const hubId = getId(editing);
      if (hubId) await bikeRentAdminApi.updateHub(hubId, payload);
      else await bikeRentAdminApi.createHub(zoneId, payload);
      toast.success(editing ? "Hub updated" : "Hub created");
      setOpen(false);
      load();
    } catch (error) {
      toast.error(message(error, "Failed to save hub"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await bikeRentAdminApi.deleteHub(getId(deleting));
      toast.success("Hub deleted");
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(message(error, "Failed to delete hub"));
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Pickup hubs
            <span className="ml-2 text-sm font-medium text-slate-500">({hubs.length})</span>
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            All hubs for this zone appear on the map above. Same hub name or nearby location (~80m) cannot be created twice.
          </p>
        </div>
        <Button size="sm" className="w-full gap-1 sm:w-auto" onClick={() => openForm()}>
          <Plus size={14} /> Add hub
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading hubs…</p>
      ) : hubs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          No hubs yet. Add at least one hub so bikes in this zone have a pickup location.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">Hub</th>
                  <th className="px-3 py-2.5">Address</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {hubs.map((hub, index) => (
                  <tr key={getId(hub)} className="border-t border-slate-100">
                    <td className="px-3 py-3">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-900">{hub.name}</p>
                      {hub.landmark ? (
                        <p className="text-xs text-slate-500">{hub.landmark}</p>
                      ) : null}
                    </td>
                    <td className="max-w-[280px] px-3 py-3 text-slate-600">
                      <p className="line-clamp-2">{hub.address || "—"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={hub.status} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openForm(hub)}>
                          <Pencil size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => setDeleting(hub)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setEditing(null);
            setForm(EMPTY);
          }
        }}
      >
        <DialogContent className="just-order-theme-scope !flex max-h-[92vh] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b border-slate-100 px-4 py-4 pr-12 sm:px-6">
            <DialogTitle>{editing ? "Edit hub" : "Add pickup hub"}</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Hub name *</span>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Vijay Nagar Hub"
              />
            </label>

            {open && mapMountReady ? (
              <HubLocationPicker
                key={getId(editing) || "new-hub"}
                coordinates={zoneCoordinates}
                existingHubs={hubs}
                excludeHubId={getId(editing)}
                value={{
                  lat: form.lat,
                  lng: form.lng,
                  address: form.address,
                }}
                onChange={handleLocationChange}
                disabled={saving}
              />
            ) : open ? (
              <div className="flex h-80 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                Preparing map…
              </div>
            ) : null}

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Landmark</span>
              <Input
                value={form.landmark}
                onChange={(e) => setForm((f) => ({ ...f, landmark: e.target.value }))}
                placeholder="e.g. Opposite C21 Mall gate 2"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Pickup instructions</span>
              <textarea
                className="min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.instructions}
                onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                placeholder="e.g. Show booking code at the counter"
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Status</span>
              <select
                className={BIKE_RENT_ADMIN_SELECT_CLASS}
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-4 py-3 sm:px-6">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save hub"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={() => setDeleting(null)}>
        <DialogContent className="just-order-theme-scope sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete hub</DialogTitle>
          </DialogHeader>
          <p>
            Delete <strong>{deleting?.name}</strong>? Bikes assigned to this hub must be
            reassigned first.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={remove}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
