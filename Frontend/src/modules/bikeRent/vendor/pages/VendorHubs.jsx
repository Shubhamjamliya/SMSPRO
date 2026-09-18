import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, MapPin } from "lucide-react";
import VendorLayout from "../components/VendorLayout";
import VendorModal from "../components/VendorModal";
import HubLocationPicker from "../../shared/components/HubLocationPicker";
import { bikeVendorApi } from "../services/vendorApi";

const emptyForm = {
  zoneId: "",
  name: "",
  address: "",
  landmark: "",
  instructions: "",
  lat: null,
  lng: null,
  maxBikes: "",
};

export default function VendorHubs() {
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(""); // "" = All zones
  const [hubs, setHubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [mapMountReady, setMapMountReady] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [modalHubs, setModalHubs] = useState([]);

  const loadZones = useCallback(async () => {
    try {
      const list = await bikeVendorApi.getPublicZones();
      setZones(Array.isArray(list) ? list : []);
    } catch {
      toast.error("Could not load zones");
    }
  }, []);

  const loadHubs = useCallback(async (zoneId) => {
    setLoading(true);
    try {
      const list = zoneId
        ? await bikeVendorApi.getHubsByZone(zoneId)
        : await bikeVendorApi.getAllHubs();
      setHubs(Array.isArray(list) ? list : []);
    } catch {
      toast.error("Could not load hubs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  useEffect(() => {
    loadHubs(selectedZone);
  }, [selectedZone, loadHubs]);

  // Existing-hub markers/duplicate checks must track whichever zone is selected inside the modal,
  // which can differ from the page-level `selectedZone` filter when creating a new hub.
  useEffect(() => {
    if (!modalOpen || !form.zoneId) {
      setModalHubs([]);
      return;
    }
    if (form.zoneId === selectedZone) {
      setModalHubs(hubs);
      return;
    }
    let cancelled = false;
    bikeVendorApi
      .getHubsByZone(form.zoneId)
      .then((list) => {
        if (!cancelled) setModalHubs(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setModalHubs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [modalOpen, form.zoneId, selectedZone, hubs]);

  useEffect(() => {
    if (!modalOpen) {
      setMapMountReady(false);
      return undefined;
    }
    const timer = setTimeout(() => setMapMountReady(true), 220);
    return () => clearTimeout(timer);
  }, [modalOpen]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, zoneId: selectedZone || zones[0]?.id || "" });
    setModalOpen(true);
  };

  const openEdit = (hub) => {
    setEditingId(hub.id);
    setForm({
      zoneId: hub.zoneId || selectedZone,
      name: hub.name || "",
      address: hub.address || "",
      landmark: hub.landmark || "",
      instructions: hub.instructions || "",
      lat: hub.lat == null ? null : Number(hub.lat),
      lng: hub.lng == null ? null : Number(hub.lng),
      maxBikes: hub.maxBikes ?? "",
    });
    setModalOpen(true);
  };

  const handleLocationChange = (location) => {
    setForm((f) => ({
      ...f,
      lat: location.lat == null ? null : Number(location.lat),
      lng: location.lng == null ? null : Number(location.lng),
      address: location.address || "",
    }));
  };

  const save = async () => {
    if (!form.zoneId) return toast.error("Select a zone");
    if (!form.name.trim()) return toast.error("Hub name is required");
    if (!Number.isFinite(Number(form.lat)) || !Number.isFinite(Number(form.lng))) {
      return toast.error("Please select a pickup location on the map within this zone");
    }
    if (!form.address.trim()) {
      return toast.error("Please select a location on the map so the address can be captured");
    }

    const payload = {
      name: form.name.trim(),
      address: form.address.trim(),
      landmark: form.landmark.trim(),
      instructions: form.instructions.trim(),
      lat: Number(form.lat),
      lng: Number(form.lng),
      maxBikes: form.maxBikes === "" ? null : Number(form.maxBikes),
    };

    setSaving(true);
    try {
      if (editingId) {
        await bikeVendorApi.updateHub(editingId, payload);
        toast.success("Hub updated");
      } else {
        await bikeVendorApi.createHub(form.zoneId, payload);
        toast.success("Hub created");
      }
      setModalOpen(false);
      loadHubs(selectedZone);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not save hub");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (hub) => {
    try {
      await bikeVendorApi.updateHubStatus(hub.id, {
        status: hub.status === "active" ? "inactive" : "active",
      });
      loadHubs(selectedZone);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not update status");
    }
  };

  const removeHub = async (hub) => {
    if (!window.confirm(`Delete hub "${hub.name}"?`)) return;
    try {
      await bikeVendorApi.deleteHub(hub.id);
      toast.success("Hub deleted");
      loadHubs(selectedZone);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not delete hub");
    }
  };

  const zoneCoordinates = zones.find((z) => z.id === form.zoneId)?.coordinates || [];

  return (
    <VendorLayout
      title="Pickup hubs"
      subtitle="Manage where riders pick up and return your bikes."
      actions={
        <button
          type="button"
          onClick={openCreate}
          disabled={zones.length === 0}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF6A00] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          New hub
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={selectedZone}
          onChange={(e) => setSelectedZone(e.target.value)}
          className="min-w-0 max-w-full truncate rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700"
        >
          <option value="">All zones</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        {!selectedZone ? (
          <span className="text-xs font-semibold text-gray-400">
            Showing hubs across all zones — pick a zone to narrow it down
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading hubs…</p>
      ) : hubs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          {selectedZone
            ? "No hubs yet in this zone. Create one to start listing bikes there."
            : "No hubs yet. Create one to start listing bikes."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {hubs.map((hub) => (
            <div key={hub.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6A00]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-900">{hub.name}</p>
                    <p className="text-xs text-gray-500">{hub.address}</p>
                    {!selectedZone && hub.zoneName ? (
                      <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500">
                        {hub.zoneName}
                      </span>
                    ) : null}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    hub.status === "active"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {hub.status}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>
                  Bikes: {hub.bikeCount || 0}
                  {hub.maxBikes ? ` / ${hub.maxBikes}` : ""}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleStatus(hub)}
                    className="rounded-lg border border-gray-200 px-2 py-1 font-bold text-gray-600 hover:bg-gray-50"
                  >
                    {hub.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(hub)}
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeHub(hub)}
                    className="rounded-lg border border-red-100 p-1.5 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <VendorModal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit hub" : "New hub"} wide>
        <div className="space-y-3">
          {!editingId && (
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-600">Zone</label>
              <select
                value={form.zoneId}
                onChange={(e) => setForm((f) => ({ ...f, zoneId: e.target.value, lat: null, lng: null, address: "" }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Field label="Hub name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />

          {modalOpen && mapMountReady ? (
            <HubLocationPicker
              key={editingId || "new-hub"}
              coordinates={zoneCoordinates}
              existingHubs={modalHubs}
              excludeHubId={editingId}
              value={{ lat: form.lat, lng: form.lng, address: form.address }}
              onChange={handleLocationChange}
              disabled={saving}
            />
          ) : modalOpen ? (
            <div className="flex h-80 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
              Preparing map…
            </div>
          ) : null}

          <Field label="Landmark" value={form.landmark} onChange={(v) => setForm((f) => ({ ...f, landmark: v }))} required={false} />
          <Field
            label="Pickup instructions"
            value={form.instructions}
            onChange={(v) => setForm((f) => ({ ...f, instructions: v }))}
            required={false}
          />
          <Field
            label="Max bikes (blank = unlimited)"
            value={form.maxBikes}
            onChange={(v) => setForm((f) => ({ ...f, maxBikes: v }))}
            required={false}
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="mt-2 w-full rounded-xl bg-[#FF6A00] py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save hub"}
          </button>
        </div>
      </VendorModal>
    </VendorLayout>
  );
}

function Field({ label, value, onChange, required = true }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-gray-600">
        {label}
        {required && <span className="text-[#FF6A00]"> *</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
      />
    </div>
  );
}
