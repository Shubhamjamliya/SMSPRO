import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, IndianRupee, Trash2, Loader2, Eye } from "lucide-react";
import {
  PageHeader, SectionCard, StatCard, AdminTable, StatusBadge,
  FormRow, FormField,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import porterAdminApi from "../services/adminApi";
import { formatCurrency } from "../utils/porterTableHelpers";

const selectCls =
  "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

const emptyVehicleRates = () => ({
  baseFare: 50,
  baseDistanceKm: 0,
  perKmRate: 12,
  perKgRate: 5,
  platformFee: 5,
  surgeMultiplier: 1,
});

const buildVehiclesMap = (vehicles = []) => {
  const map = {};
  vehicles.forEach((v) => {
    if (v?.id) map[v.id] = emptyVehicleRates();
  });
  return map;
};

const emptySlab = (fromKm = 0, toKm = 2, vehicles = []) => ({
  fromKm,
  toKm,
  vehicles: buildVehiclesMap(vehicles),
});

const formatSlabRange = (slab) => {
  const from = Number(slab?.fromKm ?? 0);
  const to = slab?.toKm;
  if (to == null || to === "") return `${from}+ km`;
  return `${from}–${to} km`;
};

/** Shared edges OK (0–2 and 2–5). Interior overlap is not. */
const getSlabOverlapError = (slabs = []) => {
  if (!slabs.length) return "Add at least one distance slab";
  const normalized = slabs
    .map((s, i) => ({
      i,
      fromKm: Number(s.fromKm || 0),
      toKm: s.toKm === "" || s.toKm == null ? null : Number(s.toKm),
    }))
    .sort((a, b) => a.fromKm - b.fromKm);

  for (let i = 0; i < normalized.length; i += 1) {
    const s = normalized[i];
    if (s.toKm != null && s.toKm < s.fromKm) {
      return `Slab ${i + 1}: To (km) must be ≥ From (km)`;
    }
    if (i > 0) {
      const prev = normalized[i - 1];
      if (prev.toKm == null) {
        return "Only the last slab can have unlimited To (km)";
      }
      if (s.fromKm < prev.toKm) {
        return `Slabs overlap: ${formatSlabRange(prev)} and ${formatSlabRange(s)}. Shared edges (e.g. 0–2 and 2–5) are OK.`;
      }
    }
  }
  for (let i = 0; i < normalized.length - 1; i += 1) {
    if (normalized[i].toKm == null) {
      return "Only the last slab can have unlimited To (km)";
    }
  }
  return null;
};

const zoneKeyOf = (zoneId) => (zoneId ? String(zoneId) : "global");

const rateFields = [
  { key: "baseFare", label: "Base" },
  { key: "baseDistanceKm", label: "Base km" },
  { key: "perKmRate", label: "₹/km" },
  { key: "perKgRate", label: "₹/kg" },
  { key: "platformFee", label: "Platform" },
];

const vehicleIdOf = (row) => row?.vehicleId || row?.vehicleTypeId || row?.vehicle?.id;

const PricingCommission = () => {
  const [rows, setRows] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [form, setForm] = useState({
    zoneId: "",
    status: "active",
    slabs: [],
    vehicleCommissions: {},
    vehicleLoadingRules: {},
  });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [viewTarget, setViewTarget] = useState(null);

  const buildGroupSlabs = useCallback((group) => {
    if (!group?.rows?.length) return [];
    const templateSlabs =
      group.rows.find((r) => r.slabs?.length)?.slabs || [];
    return templateSlabs.map((range) => {
      const ratesByVehicle = {};
      group.rows.forEach((row) => {
        const vid = vehicleIdOf(row);
        if (!vid) return;
        const match =
          (row.slabs || []).find(
            (s) => Number(s.fromKm) === Number(range.fromKm),
          ) || null;
        if (!match) return;
        const name =
          row.vehicle?.name ||
          vehicles.find((v) => v.id === vid)?.name ||
          "Vehicle";
        ratesByVehicle[vid] = {
          name,
          baseFare: Number(match.baseFare || 0),
          baseDistanceKm: Number(match.baseDistanceKm || 0),
          perKmRate: Number(match.perKmRate || 0),
          perKgRate: Number(match.perKgRate || 0),
          platformFee: Number(match.platformFee || 0),
        };
      });
      return {
        fromKm: Number(range.fromKm || 0),
        toKm: range.toKm == null ? null : Number(range.toKm),
        vehicles: ratesByVehicle,
      };
    });
  }, [vehicles]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pricing, vehicleList, zoneList] = await Promise.all([
        porterAdminApi.getPricingList({ limit: 100 }),
        porterAdminApi.getVehicleDropdown(),
        porterAdminApi.getZoneDropdown(),
      ]);
      setRows(pricing.records || []);
      setVehicles(vehicleList || []);
      setZones(zoneList || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load pricing");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const zoneGroups = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const key = zoneKeyOf(row.zoneId);
      if (!map.has(key)) {
        map.set(key, {
          key,
          zoneId: row.zoneId || null,
          zoneName:
            row.zone?.name ||
            zones.find((z) => z.id === row.zoneId)?.name ||
            "All zones",
          rows: [],
          status: row.status || "active",
        });
      }
      const g = map.get(key);
      g.rows.push(row);
      if (row.status === "inactive") g.status = "inactive";
    });
    return [...map.values()].map((g) => {
      const first = g.rows[0];
      const slabCount = first?.slabs?.length || 0;
      return {
        ...g,
        vehicleCount: g.rows.length,
        slabCount,
        slabLabel: (first?.slabs || []).map(formatSlabRange).join(" · ") || "—",
      };
    });
  }, [rows, zones]);

  const openCreate = () => {
    if (!vehicles.length) {
      toast.error("Configure Porter vehicle capacity first");
      return;
    }
    const vehicleCommissions = {};
    const vehicleLoadingRules = {};
    vehicles.forEach((v) => {
      vehicleCommissions[v.id] = 10;
      vehicleLoadingRules[v.id] = {
        freeLoadingMinutes: 60,
        extraLoadingPerMinCharge: 3,
      };
    });
    setEditingKey(null);
    setForm({
      zoneId: "",
      status: "active",
      slabs: [emptySlab(0, 2, vehicles)],
      vehicleCommissions,
      vehicleLoadingRules,
    });
    setModalOpen(true);
  };

  const openEdit = (group) => {
    setEditingKey(group.key);
    const templateSlabs =
      group.rows.find((r) => r.slabs?.length)?.slabs ||
      [{ fromKm: 0, toKm: 2 }, { fromKm: 2, toKm: 5 }];

    const slabs = templateSlabs.map((range) => {
      const ratesByVehicle = buildVehiclesMap(vehicles);
      group.rows.forEach((row) => {
        const vid = vehicleIdOf(row);
        if (!vid) return;
        const match =
          (row.slabs || []).find(
            (s) => Number(s.fromKm) === Number(range.fromKm),
          ) || row.slabs?.[0];
        if (!match) return;
        ratesByVehicle[vid] = {
          baseFare: Number(match.baseFare || 0),
          baseDistanceKm: Number(match.baseDistanceKm || 0),
          perKmRate: Number(match.perKmRate || 0),
          perKgRate: Number(match.perKgRate || 0),
          platformFee: Number(match.platformFee || 0),
          surgeMultiplier: Number(match.surgeMultiplier ?? 1),
        };
      });
      return {
        fromKm: Number(range.fromKm || 0),
        toKm: range.toKm == null ? "" : Number(range.toKm),
        vehicles: ratesByVehicle,
      };
    });

    const vehicleCommissions = {};
    const vehicleLoadingRules = {};
    vehicles.forEach((v) => {
      const row = group.rows.find((r) => String(vehicleIdOf(r)) === String(v.id));
      vehicleCommissions[v.id] = Number(row?.adminCommissionPercent ?? 10);
      vehicleLoadingRules[v.id] = {
        freeLoadingMinutes: Number(row?.freeLoadingMinutes ?? 60),
        extraLoadingPerMinCharge: Number(row?.extraLoadingPerMinCharge ?? 3),
      };
    });

    setForm({
      zoneId: group.zoneId || "",
      status: group.status || "active",
      slabs,
      vehicleCommissions,
      vehicleLoadingRules,
    });
    setModalOpen(true);
  };

  const updateSlabMeta = (index, patch) => {
    setForm((f) => ({
      ...f,
      slabs: f.slabs.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  };

  const updateVehicleRate = (slabIndex, vehicleId, patch) => {
    setForm((f) => ({
      ...f,
      slabs: f.slabs.map((s, i) => {
        if (i !== slabIndex) return s;
        return {
          ...s,
          vehicles: {
            ...s.vehicles,
            [vehicleId]: {
              ...(s.vehicles?.[vehicleId] || emptyVehicleRates()),
              ...patch,
            },
          },
        };
      }),
    }));
  };

  const addSlab = () => {
    setForm((f) => {
      const last = f.slabs[f.slabs.length - 1];
      const prevTo =
        last?.toKm === "" || last?.toKm == null
          ? Number(last?.fromKm || 0) + 5
          : Number(last.toKm);
      const ratesByVehicle = buildVehiclesMap(vehicles);
      vehicles.forEach((v) => {
        const prev = last?.vehicles?.[v.id];
        if (!prev) return;
        const billableKm = Math.max(0, prevTo - Number(prev.baseDistanceKm || 0));
        ratesByVehicle[v.id] = {
          ...emptyVehicleRates(),
          ...prev,
          baseDistanceKm: prevTo,
          baseFare:
            Number(prev.baseFare || 0) + billableKm * Number(prev.perKmRate || 0),
          perKmRate: Math.max(0, Number(prev.perKmRate || 12) - 2),
        };
      });
      const slabs = f.slabs.map((s, i) =>
        i === f.slabs.length - 1 && (s.toKm === "" || s.toKm == null)
          ? { ...s, toKm: prevTo }
          : s,
      );
      return {
        ...f,
        slabs: [...slabs, { fromKm: prevTo, toKm: prevTo + 5, vehicles: ratesByVehicle }],
      };
    });
  };

  const save = async () => {
    if (!vehicles.length) {
      toast.error("No vehicles configured");
      return;
    }
    if (!form.slabs?.length) {
      toast.error("Add at least one distance slab");
      return;
    }

    const overlapError = getSlabOverlapError(form.slabs);
    if (overlapError) {
      toast.error(overlapError);
      return;
    }

    const vehicleIds = vehicles.map((v) => v.id);
    const slabs = form.slabs.map((s) => {
      const ratesByVehicle = {};
      vehicleIds.forEach((id) => {
        const r = s.vehicles?.[id] || emptyVehicleRates();
        ratesByVehicle[id] = {
          baseFare: Number(r.baseFare || 0),
          baseDistanceKm: Number(r.baseDistanceKm || 0),
          perKmRate: Number(r.perKmRate || 0),
          freeWeightKg: 0,
          perKgRate: Number(r.perKgRate || 0),
          platformFee: Number(r.platformFee || 0),
          surgeMultiplier: Number(r.surgeMultiplier ?? 1),
        };
      });
      return {
        fromKm: Number(s.fromKm || 0),
        toKm: s.toKm === "" || s.toKm == null ? null : Number(s.toKm),
        vehicles: ratesByVehicle,
      };
    });

    setSaving(true);
    try {
      await porterAdminApi.saveZonePricingMatrix({
        zoneId: form.zoneId || null,
        status: form.status,
        vehicleIds,
        vehicleCommissions: Object.fromEntries(
          vehicleIds.map((id) => [
            id,
            Number(form.vehicleCommissions?.[id] ?? 0),
          ]),
        ),
        vehicleLoadingRules: Object.fromEntries(
          vehicleIds.map((id) => [
            id,
            {
              freeLoadingMinutes: Number(
                form.vehicleLoadingRules?.[id]?.freeLoadingMinutes ?? 60,
              ),
              extraLoadingPerMinCharge: Number(
                form.vehicleLoadingRules?.[id]?.extraLoadingPerMinCharge ?? 3,
              ),
            },
          ]),
        ),
        slabs,
      });
      toast.success("Zone pricing saved for all vehicles");
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await porterAdminApi.deleteZonePricingMatrix(deleteTarget.zoneId);
      setDeleteTarget(null);
      toast.success("Zone pricing deleted");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: "zone",
      header: "Zone",
      cell: (row) => <span className="font-semibold">{row.zoneName}</span>,
    },
    {
      key: "vehicles",
      header: "Vehicles",
      cell: (row) => (
        <span className="text-sm text-gray-700">
          {row.vehicleCount} vehicle{row.vehicleCount === 1 ? "" : "s"}
        </span>
      ),
    },
    {
      key: "slabs",
      header: "Distance slabs",
      cell: (row) => (
        <div className="space-y-0.5">
          <p className="text-xs font-bold text-gray-900">
            {row.slabCount} slab{row.slabCount === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] text-gray-500">{row.slabLabel}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge
          status={row.status === "active" ? "success" : "default"}
          label={row.status}
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setViewTarget({
                ...row,
                detailSlabs: buildGroupSlabs(row),
              })
            }
            aria-label="View slab details"
          >
            <Eye size={14} />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(row)} aria-label="Edit zone pricing">
            <Pencil size={14} />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteTarget(row)} aria-label="Delete zone pricing">
            <Trash2 size={14} className="text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="just-order-theme-scope space-y-6 max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader
        title="Pricing / Fare Management"
        description="Pick a zone, define distance slabs, then set distance + weight rates for every vehicle in each slab."
        actions={
          <Button type="button" onClick={openCreate} disabled={!vehicles.length}>
            <Plus className="mr-2 h-4 w-4" /> Add zone pricing
          </Button>
        }
      />

      {!vehicles.length && !loading && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          Configure Porter vehicle capacity before adding pricing.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Zone matrices" value={String(zoneGroups.length)} icon={<IndianRupee size={18} />} />
        <StatCard title="Vehicle pricing rows" value={String(rows.length)} />
        <StatCard title="Vehicles" value={String(vehicles.length)} />
        <StatCard title="Zones" value={String(zones.length)} />
      </div>

      <SectionCard title="Fare Matrix by Zone" flush>
        <div className="p-4">
          <AdminTable
            columns={columns}
            data={zoneGroups}
            loading={loading}
            getRowId={(r) => r.key}
            emptyState={{
              title: "No zone pricing yet",
              description: "Add a zone matrix with distance slabs and weight rates for all vehicles.",
            }}
          />
        </div>
      </SectionCard>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[920px]">
          <DialogHeader className="pr-8">
            <DialogTitle>
              {editingKey ? "Edit zone pricing" : "Create zone pricing"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[75vh] overflow-y-auto">
            <p className="rounded-xl border border-orange-100 bg-orange-50/70 px-3 py-2 text-xs text-gray-700">
              For each distance slab (e.g. 0–2 km), set prices for <strong>all vehicles</strong> at once.
              The matching slab applies to the whole trip. Weight is charged per kg (₹/kg).
            </p>

            <FormRow>
              <FormField label="Zone">
                <select
                  className={`${selectCls} w-full`}
                  value={form.zoneId || ""}
                  disabled={Boolean(editingKey)}
                  onChange={(e) => setForm((f) => ({ ...f, zoneId: e.target.value }))}
                >
                  <option value="">All zones</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Status">
                <select
                  className={`${selectCls} w-full`}
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </FormField>
            </FormRow>

            <div className="rounded-2xl border border-gray-200 bg-white p-3 space-y-3">
              <div>
                <h4 className="text-sm font-extrabold text-gray-900">Admin commission %</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Taken from the trip amount after platform fee. Example: total ₹60, fee ₹0, 10% → admin ₹6, partner ₹54.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {vehicles.map((v) => (
                  <FormField key={v.id} label={v.name}>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      value={form.vehicleCommissions?.[v.id] ?? 0}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          vehicleCommissions: {
                            ...f.vehicleCommissions,
                            [v.id]: e.target.value,
                          },
                        }))
                      }
                    />
                  </FormField>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-3 space-y-3">
              <div>
                <h4 className="text-sm font-extrabold text-gray-900">Loading / unloading time</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Shown on the user Review Booking screen. Free minutes are included in fare; extra time is charged per minute.
                </p>
              </div>
              <div className="space-y-3">
                {vehicles.map((v) => (
                  <div
                    key={`loading-${v.id}`}
                    className="rounded-xl border border-gray-100 bg-gray-50/80 p-3"
                  >
                    <p className="mb-2 text-sm font-semibold text-gray-900">{v.name}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField label="Free loading (mins)">
                        <Input
                          type="number"
                          min={0}
                          step="1"
                          value={form.vehicleLoadingRules?.[v.id]?.freeLoadingMinutes ?? 60}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              vehicleLoadingRules: {
                                ...f.vehicleLoadingRules,
                                [v.id]: {
                                  ...(f.vehicleLoadingRules?.[v.id] || {}),
                                  freeLoadingMinutes: e.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </FormField>
                      <FormField label="Extra loading (₹/min)">
                        <Input
                          type="number"
                          min={0}
                          step="0.5"
                          value={form.vehicleLoadingRules?.[v.id]?.extraLoadingPerMinCharge ?? 3}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              vehicleLoadingRules: {
                                ...f.vehicleLoadingRules,
                                [v.id]: {
                                  ...(f.vehicleLoadingRules?.[v.id] || {}),
                                  extraLoadingPerMinCharge: e.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </FormField>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <div>
                <h4 className="text-sm font-extrabold text-gray-900">Distance slab</h4>
                <p className="text-[11px] text-muted-foreground">
                  {editingKey
                    ? "Configure slabs for this zone. Use Add slab for another range."
                    : "Configure one distance slab for this zone."}
                </p>
              </div>
              {editingKey ? (
                <Button type="button" variant="outline" size="sm" onClick={addSlab}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add slab
                </Button>
              ) : null}
            </div>

            <div className="space-y-4">
              {form.slabs.map((slab, index) => (
                <div
                  key={`slab-${index}`}
                  className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-[#FF6A00]">
                      Slab {index + 1} · {formatSlabRange(slab)}
                    </p>
                  </div>

                  <FormRow>
                    <FormField label="From (km)">
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={slab.fromKm}
                        onChange={(e) => updateSlabMeta(index, { fromKm: e.target.value })}
                      />
                    </FormField>
                    <FormField label="To (km) — blank = unlimited">
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={slab.toKm ?? ""}
                        placeholder="∞"
                        onChange={(e) => updateSlabMeta(index, { toKm: e.target.value })}
                      />
                    </FormField>
                  </FormRow>

                  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-gray-50">
                            Vehicle
                          </th>
                          {rateFields.map((f) => (
                            <th key={f.key} className="px-2 py-2 text-left font-semibold whitespace-nowrap">
                              {f.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {vehicles.map((v) => {
                          const rates = slab.vehicles?.[v.id] || emptyVehicleRates();
                          return (
                            <tr key={v.id} className="border-t border-gray-100">
                              <td className="px-3 py-2 font-semibold text-gray-900 sticky left-0 bg-white whitespace-nowrap">
                                {v.name}
                              </td>
                              {rateFields.map((f) => (
                                <td key={f.key} className="px-1.5 py-1.5">
                                  <Input
                                    type="number"
                                    className="h-8 w-[88px] text-xs"
                                    value={rates[f.key]}
                                    onChange={(e) =>
                                      updateVehicleRate(index, v.id, {
                                        [f.key]: e.target.value,
                                      })
                                    }
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save all vehicles"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(viewTarget)}
        onOpenChange={(open) => {
          if (!open) setViewTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[920px]">
          <DialogHeader className="pr-8">
            <DialogTitle>
              Slab details · {viewTarget?.zoneName || "All zones"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <StatusBadge
                status={viewTarget?.status === "active" ? "success" : "default"}
                label={viewTarget?.status || "—"}
              />
              <span>
                {viewTarget?.vehicleCount || 0} vehicle
                {(viewTarget?.vehicleCount || 0) === 1 ? "" : "s"}
              </span>
              <span>·</span>
              <span>
                {viewTarget?.detailSlabs?.length || 0} distance slab
                {(viewTarget?.detailSlabs?.length || 0) === 1 ? "" : "s"}
              </span>
            </div>

            {(viewTarget?.rows || []).length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Vehicle</th>
                      <th className="px-3 py-2 text-left font-semibold">Admin commission %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewTarget?.rows || []).map((row) => (
                      <tr key={row.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-semibold text-gray-900">
                          {row.vehicle?.name
                            || vehicles.find((v) => v.id === vehicleIdOf(row))?.name
                            || "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-800">
                          {Number(row.adminCommissionPercent || 0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(viewTarget?.detailSlabs || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No slab details found for this zone.
              </p>
            ) : (
              (viewTarget?.detailSlabs || []).map((slab, index) => {
                const vehicleRows = Object.entries(slab.vehicles || {});
                return (
                  <div
                    key={`view-slab-${index}`}
                    className="rounded-2xl border border-gray-200 bg-gray-50/80 p-3 space-y-3"
                  >
                    <p className="text-xs font-bold uppercase tracking-wide text-[#FF6A00]">
                      Slab {index + 1} · {formatSlabRange(slab)}
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 text-gray-600">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-gray-50">
                              Vehicle
                            </th>
                            {rateFields.map((f) => (
                              <th
                                key={f.key}
                                className="px-3 py-2 text-left font-semibold whitespace-nowrap"
                              >
                                {f.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {vehicleRows.map(([vid, rates]) => (
                            <tr key={vid} className="border-t border-gray-100">
                              <td className="px-3 py-2.5 font-semibold text-gray-900 sticky left-0 bg-white whitespace-nowrap">
                                {rates.name}
                              </td>
                              {rateFields.map((f) => (
                                <td key={f.key} className="px-3 py-2.5 text-gray-800 whitespace-nowrap">
                                  {f.key === "baseDistanceKm"
                                    ? Number(rates[f.key] || 0)
                                    : formatCurrency(rates[f.key])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setViewTarget(null)}>
              Close
            </Button>
            <Button
              type="button"
              onClick={() => {
                const group = viewTarget;
                setViewTarget(null);
                if (group) openEdit(group);
              }}
            >
              Edit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader className="pr-8">
            <DialogTitle>Delete zone pricing?</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600">
            Remove fare matrix for{" "}
            <span className="font-semibold text-gray-900">
              {deleteTarget?.zoneName || "All zones"}
            </span>{" "}
            (all vehicles in this zone)?
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" disabled={deleting} onClick={confirmDelete}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PricingCommission;
