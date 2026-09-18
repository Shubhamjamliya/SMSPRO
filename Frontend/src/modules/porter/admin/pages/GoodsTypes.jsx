import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader, SectionCard, AdminTable, FormField, StatusBadge,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { porterAdminApi } from "../services/adminApi";

const EMPTY = { name: "", description: "", status: "active", displayOrder: 0 };

export default function GoodsTypes() {
  const [rows, setRows] = useState([]);
  const [restrictedText, setRestrictedText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRestricted, setSavingRestricted] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, settings] = await Promise.all([
        porterAdminApi.getGoodsTypes({ limit: 100 }),
        porterAdminApi.getSettings(),
      ]);
      setRows(list.records || []);
      setRestrictedText((settings?.restrictedItems || []).join("\n"));
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load goods types");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = (row = null) => {
    setEditing(row);
    setForm(row ? {
      name: row.name || "",
      description: row.description || "",
      status: row.status || "active",
      displayOrder: row.displayOrder || 0,
    } : EMPTY);
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) {
        await porterAdminApi.updateGoodsType(editing.id, form);
        toast.success("Goods type updated");
      } else {
        await porterAdminApi.createGoodsType(form);
        toast.success("Goods type created");
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.name}"?`)) return;
    try {
      await porterAdminApi.deleteGoodsType(row.id);
      toast.success("Deleted");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete");
    }
  };

  const saveRestricted = async () => {
    setSavingRestricted(true);
    try {
      const items = restrictedText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      await porterAdminApi.updateRestrictedItems(items);
      toast.success("Restricted items saved");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save restricted items");
    } finally {
      setSavingRestricted(false);
    }
  };

  const columns = [
    {
      key: "name",
      header: "Name",
      cell: (row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          {row.description ? <p className="text-xs text-gray-500">{row.description}</p> : null}
        </div>
      ),
    },
    {
      key: "displayOrder",
      header: "Order",
      cell: (row) => row.displayOrder ?? 0,
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
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => openForm(row)}>
            <Pencil size={14} />
          </Button>
          <Button variant="ghost" size="sm" className="text-red-600" onClick={() => remove(row)}>
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="just-order-theme-scope space-y-6 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader
        title="Goods Types"
        description="Types shown when users choose goods on the booking payment screen"
        actions={(
          <Button onClick={() => openForm()}>
            <Plus size={16} className="mr-1" />
            Add type
          </Button>
        )}
      />

      <SectionCard title="Active goods types" flush>
        <div className="p-4">
          <AdminTable
            columns={columns}
            data={rows}
            loading={loading}
            getRowId={(r) => r.id}
            emptyState={{
              title: "No goods types",
              description: "Add types for users to select before booking.",
              icon: Package,
            }}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Restricted items"
        description="Shown in the expandable warning on Select Goods Type. One item per line."
      >
        <textarea
          className="min-h-[180px] w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00] focus:ring-4 focus:ring-[#FF6A00]/10"
          value={restrictedText}
          onChange={(e) => setRestrictedText(e.target.value)}
          placeholder={"Explosives\nFlammables\n..."}
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={saveRestricted} disabled={savingRestricted}>
            {savingRestricted ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save restricted items
          </Button>
        </div>
      </SectionCard>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit goods type" : "Add goods type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <FormField label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </FormField>
            <FormField label="Description">
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </FormField>
            <FormField label="Display order">
              <Input
                type="number"
                value={form.displayOrder}
                onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
              />
            </FormField>
            <FormField label="Status">
              <select
                className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
