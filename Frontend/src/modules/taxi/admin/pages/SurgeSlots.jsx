import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Zap } from "lucide-react";
import {
  PageHeader, SectionCard, StatCard, AdminTable, StatusBadge,
  FormRow, FormField,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { taxiAdminApi } from "../../services/api";
import { formatCurrency } from "../utils/taxiTableHelpers";

const DAY_OPTIONS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const selectCls =
  "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

const EMPTY_FORM = {
  name: "",
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: "17:00",
  endTime: "21:00",
  amount: 50,
  priority: 10,
  isActive: true,
};

const formatDays = (days = []) => {
  const set = new Set(days.map(Number));
  return DAY_OPTIONS.filter((d) => set.has(d.value)).map((d) => d.label).join(", ") || "—";
};

const SurgeSlots = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await taxiAdminApi.getSurgeSlots({ limit: 100, sortBy: "priority" });
      setRows(data.records || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load surge slots");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeCount = useMemo(
    () => rows.filter((r) => r.isActive !== false).length,
    [rows],
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || "",
      daysOfWeek: Array.isArray(row.daysOfWeek) ? [...row.daysOfWeek] : [],
      startTime: row.startTime || "17:00",
      endTime: row.endTime || "21:00",
      amount: Number(row.amount || 0),
      priority: Number(row.priority || 0),
      isActive: row.isActive !== false,
    });
    setModalOpen(true);
  };

  const toggleDay = (day) => {
    setForm((prev) => {
      const set = new Set(prev.daysOfWeek.map(Number));
      if (set.has(day)) set.delete(day);
      else set.add(day);
      return { ...prev, daysOfWeek: [...set].sort((a, b) => a - b) };
    });
  };

  const save = async () => {
    if (!form.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!form.daysOfWeek?.length) {
      toast.error("Select at least one day");
      return;
    }
    if (!form.startTime || !form.endTime) {
      toast.error("Start and end time are required");
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        daysOfWeek: form.daysOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
        amount: Number(form.amount || 0),
        priority: Number(form.priority || 0),
        isActive: form.isActive !== false,
      };
      if (editing?.id) {
        await taxiAdminApi.updateSurgeSlot(editing.id, body);
        toast.success("Surge slot updated");
      } else {
        await taxiAdminApi.createSurgeSlot(body);
        toast.success("Surge slot created");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    const id = deleteTarget?.id;
    if (!id) return;
    setDeleting(true);
    try {
      await taxiAdminApi.deleteSurgeSlot(id);
      setDeleteTarget(null);
      toast.success("Surge slot deleted");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: "name",
      header: "Slot",
      cell: (row) => (
        <div>
          <p className="font-semibold text-gray-900">{row.name}</p>
          <p className="text-[11px] text-gray-500">
            {row.startTime} – {row.endTime} IST
          </p>
        </div>
      ),
    },
    {
      key: "days",
      header: "Days",
      cell: (row) => <span className="text-sm text-gray-700">{formatDays(row.daysOfWeek)}</span>,
    },
    {
      key: "amount",
      header: "Surge",
      cell: (row) => (
        <span className="font-semibold text-emerald-700">+{formatCurrency(row.amount)}</span>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      cell: (row) => <span className="text-sm font-medium">{row.priority}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge status={row.isActive === false ? "inactive" : "active"} />
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(row)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteTarget(row)}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="just-order-theme-scope space-y-6 max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader
        title="Time-slot Surge"
        description="Global weekly surge amounts (flat ₹). Highest priority wins when slots overlap. Locked at quote/booking."
        actions={(
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add slot
          </Button>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Total slots" value={String(rows.length)} icon={<Zap size={18} />} />
        <StatCard title="Active" value={String(activeCount)} />
        <StatCard
          title="Highest amount"
          value={rows.length ? formatCurrency(Math.max(...rows.map((r) => Number(r.amount || 0)))) : "—"}
        />
      </div>

      <SectionCard flush>
        <div className="p-4">
          <AdminTable
            columns={columns}
            data={rows}
            loading={loading}
            getRowId={(r) => r.id}
            emptyState={{
              title: "No surge slots yet",
              description: "Add a weekly time window with a flat surge amount.",
            }}
          />
        </div>
      </SectionCard>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader className="pr-8">
            <DialogTitle>{editing ? "Edit surge slot" : "Add surge slot"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label="Name">
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Evening"
              />
            </FormField>
            <FormField label="Days of week">
              <div className="flex flex-wrap gap-2">
                {DAY_OPTIONS.map((d) => {
                  const on = form.daysOfWeek.map(Number).includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={`h-9 min-w-10 rounded-lg border px-2 text-xs font-semibold ${
                        on
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-gray-200 bg-white text-gray-600"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </FormField>
            <FormRow>
              <FormField label="Start (IST)">
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
                />
              </FormField>
              <FormField label="End (IST)">
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
                />
              </FormField>
            </FormRow>
            <p className="text-[11px] text-muted-foreground">
              Overnight windows are allowed (e.g. 22:00–06:00).
            </p>
            <FormRow>
              <FormField label="Flat amount (₹)">
                <Input
                  type="number"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                />
              </FormField>
              <FormField label="Priority">
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                />
              </FormField>
            </FormRow>
            <FormField label="Status">
              <select
                className={selectCls}
                value={form.isActive ? "active" : "inactive"}
                onChange={(e) =>
                  setForm((p) => ({ ...p, isActive: e.target.value === "active" }))
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
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
            <DialogTitle>Delete surge slot?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Soft-delete “{deleteTarget?.name}”. Existing rides keep their locked surge amount.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SurgeSlots;
