import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  HardHat,
  ImageIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader, AdminTable, StatusBadge } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import MediaUploadField from "@/modules/bikeRent/shared/components/MediaUploadField";
import constructionAdminApi from "../services/adminApi";
import {
  CN_ADMIN_PAGE_CLASS,
  CN_ADMIN_SELECT_CLASS,
  CN_DIALOG_CONTENT_CLASS,
} from "../utils/adminTheme";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const UNITS = [
  { value: "", label: "Not set" },
  { value: "sqft", label: "Square feet" },
  { value: "sqm", label: "Square metres" },
  { value: "rft", label: "Running feet" },
  { value: "rmt", label: "Running metres" },
  { value: "cuft", label: "Cubic feet" },
  { value: "cum", label: "Cubic metres" },
  { value: "nos", label: "Numbers" },
  { value: "lumpsum", label: "Lump sum" },
  { value: "day", label: "Per day" },
];

const EMPTY = {
  categoryId: "",
  name: "",
  description: "",
  coverImage: "",
  covers: [],
  excludes: [],
  typicalDurationText: "",
  typicalBudgetMin: "",
  typicalBudgetMax: "",
  defaultUnit: "",
  defaultQuoteSections: [],
  defaultStages: [],
  status: "active",
  displayOrder: 0,
};

/** Small editor for a list of short strings (covers, excludes, quote sections). */
function ChipListEditor({ label, helperText, placeholder, values, onChange, disabled }) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (values.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...values, value]);
    setDraft("");
  };

  return (
    <div className="text-sm">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
      {helperText ? <p className="mb-2 text-xs text-gray-500">{helperText}</p> : null}

      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          disabled={disabled}
        />
        <Button type="button" variant="outline" onClick={add} disabled={disabled || !draft.trim()}>
          Add
        </Button>
      </div>

      {values.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {values.map((value, index) => (
            <li
              key={`${value}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 py-1 pl-2.5 pr-1.5 text-xs text-gray-700"
            >
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((_, i) => i !== index))}
                disabled={disabled}
                className="rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                aria-label={`Remove ${value}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Default stage plan editor. Only used when settings.stages.mode is platform_fixed. */
function StagePlanEditor({ stages, onChange, disabled }) {
  const total = stages.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0);
  const rounded = Math.round(total * 100) / 100;
  const isValid = stages.length === 0 || rounded === 100;

  const update = (index, key, value) => {
    onChange(stages.map((s, i) => (i === index ? { ...s, [key]: value } : s)));
  };

  return (
    <div className="text-sm">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">Default stage plan</span>
      <p className="mb-2 text-xs text-gray-500">
        Only used when the module is set to platform-fixed stages. In the default
        contractor-proposed mode this is ignored.
      </p>

      {stages.map((stage, index) => (
        <div key={index} className="mb-2 rounded-lg border border-gray-200 bg-gray-50/60 p-2.5">
          <div className="flex gap-2">
            <Input
              placeholder="Stage name, e.g. Foundation"
              value={stage.name}
              onChange={(e) => update(index, "name", e.target.value)}
              disabled={disabled}
            />
            <div className="w-28 shrink-0">
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                placeholder="%"
                value={stage.percentage}
                onChange={(e) => update(index, "percentage", e.target.value)}
                disabled={disabled}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 border-red-200 px-2.5 text-red-600"
              onClick={() => onChange(stages.filter((_, i) => i !== index))}
              disabled={disabled}
              aria-label="Remove stage"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...stages, { name: "", percentage: "" }])}
          disabled={disabled}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add stage
        </Button>
        {stages.length ? (
          <span
            className={
              "text-xs font-semibold tabular-nums " +
              (isValid ? "text-emerald-600" : "text-red-600")
            }
          >
            Total {rounded}%{isValid ? "" : " — must be 100%"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A thumbnail in the list is the only way an admin can see, at a glance, which of
 * two dozen services still has no picture — the customer app shows a generic hard
 * hat wherever one is missing, and nobody notices that from a form.
 */
function ServiceThumb({ row }) {
  const src = row?.coverImage || row?.icon || "";
  return src ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 bg-white object-cover"
    />
  ) : (
    <span
      title="No image yet"
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-300"
    >
      <ImageIcon className="h-4 w-4" />
    </span>
  );
}

export default function Services() {
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [services, cats] = await Promise.all([
        constructionAdminApi.getServices(),
        constructionAdminApi.getCategories(),
      ]);
      setRows(services);
      setCategories(cats);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load services"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.status === "active"),
    [categories],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (categoryFilter && String(row.categoryId?._id || row.categoryId) !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        row.name?.toLowerCase().includes(q) || row.description?.toLowerCase().includes(q)
      );
    });
  }, [rows, search, categoryFilter]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const openCreate = () => {
    if (!activeCategories.length) {
      toast.error("Add an active category first — every service belongs to one");
      return;
    }
    setEditing(null);
    setForm({ ...EMPTY, categoryId: activeCategories[0]._id });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      categoryId: String(row.categoryId?._id || row.categoryId || ""),
      name: row.name || "",
      description: row.description || "",
      coverImage: row.coverImage || "",
      covers: row.covers || [],
      excludes: row.excludes || [],
      typicalDurationText: row.typicalDurationText || "",
      typicalBudgetMin: row.typicalBudget?.min ?? "",
      typicalBudgetMax: row.typicalBudget?.max ?? "",
      defaultUnit: row.defaultUnit || "",
      defaultQuoteSections: row.defaultQuoteSections || [],
      defaultStages: (row.defaultStages || []).map((s) => ({
        name: s.name,
        percentage: s.percentage,
      })),
      status: row.status || "active",
      displayOrder: row.displayOrder ?? 0,
    });
    setErrors({});
    setModalOpen(true);
  };

  const save = async () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Service name is required";
    if (!form.categoryId) nextErrors.categoryId = "Select a category";

    const min = form.typicalBudgetMin === "" ? null : Number(form.typicalBudgetMin);
    const max = form.typicalBudgetMax === "" ? null : Number(form.typicalBudgetMax);
    if (min != null && max != null && max < min) {
      nextErrors.typicalBudgetMax = "Maximum cannot be less than the minimum";
    }

    const stages = form.defaultStages.filter((s) => s.name.trim());
    if (stages.length) {
      const total =
        Math.round(stages.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0) * 100) / 100;
      if (total !== 100) {
        nextErrors.defaultStages = `Stage percentages must total 100 — currently ${total}`;
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const first = Object.values(nextErrors)[0];
      toast.error(first);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        categoryId: form.categoryId,
        name: form.name.trim(),
        description: form.description.trim(),
        coverImage: form.coverImage || "",
        covers: form.covers,
        excludes: form.excludes,
        typicalDurationText: form.typicalDurationText.trim(),
        typicalBudget: { min, max },
        defaultUnit: form.defaultUnit || "",
        defaultQuoteSections: form.defaultQuoteSections,
        defaultStages: stages.map((s) => ({
          name: s.name.trim(),
          percentage: Number(s.percentage) || 0,
        })),
        status: form.status || "active",
        displayOrder: Number(form.displayOrder) || 0,
      };
      if (editing) {
        await constructionAdminApi.updateService(editing._id, payload);
        toast.success("Service updated");
      } else {
        await constructionAdminApi.createService(payload);
        toast.success("Service created");
      }
      setModalOpen(false);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not save service"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await constructionAdminApi.deleteService(deleting._id);
      toast.success("Service deleted");
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not delete service"));
    } finally {
      setDeletingBusy(false);
    }
  };

  const columns = [
    {
      key: "name",
      header: "Service",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <ServiceThumb row={row} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{row.name}</p>
            <p className="truncate text-xs text-gray-500">
              {row.categoryId?.name || "—"}
              {row.typicalDurationText ? ` · ${row.typicalDurationText}` : ""}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "detail",
      header: "Detail",
      align: "center",
      cell: (row) => {
        // BRD C2 asks for what a service covers and W11 for what it excludes.
        // A service missing both gives the customer nothing to judge by.
        const covers = row.covers?.length || 0;
        const excludes = row.excludes?.length || 0;
        if (!covers && !excludes) {
          return <span className="text-xs font-medium text-amber-600">No detail added</span>;
        }
        return (
          <span className="text-xs text-gray-600 tabular-nums">
            {covers} included · {excludes} excluded
          </span>
        );
      },
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => openEdit(row)} title="Edit service">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleting(row)}
            title="Delete service"
            className="border-red-200 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const renderMobileCard = (row) => (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <ServiceThumb row={row} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{row.name}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500">{row.categoryId?.name || "—"}</p>
          </div>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <div className="mt-3 flex gap-1.5 border-t border-gray-200/80 pt-2">
        <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" onClick={() => openEdit(row)}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 border-red-200 px-2.5 text-red-600"
          onClick={() => setDeleting(row)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <PageHeader
        eyebrow="Construction"
        title="Services"
        description="The kinds of work customers can enquire about. There is no price here — construction is quoted after a site visit, never published as a rate."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> Add service
          </Button>
        }
      />

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Search services…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={`${CN_ADMIN_SELECT_CLASS} sm:w-56`}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category._id} value={category._id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <AdminTable
        columns={columns}
        data={filteredRows}
        loading={loading}
        skeletonRows={6}
        getRowId={(row) => row._id}
        renderMobileCard={renderMobileCard}
        emptyState={{
          icon: <HardHat className="h-10 w-10" />,
          title: search || categoryFilter ? "No services match" : "No services yet",
          description:
            search || categoryFilter
              ? "Try clearing the filters."
              : "Add the kinds of construction work you offer. Customers pick one of these when they send an enquiry.",
        }}
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-2xl`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">
              {editing ? "Edit service" : "Add service"}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  Category<span className="ml-0.5 text-red-500">*</span>
                </span>
                <select
                  className={CN_ADMIN_SELECT_CLASS}
                  value={form.categoryId}
                  onChange={(e) => setField("categoryId", e.target.value)}
                  disabled={saving}
                >
                  {activeCategories.map((category) => (
                    <option key={category._id} value={category._id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label={
                  <>
                    Service name<span className="ml-0.5 text-red-500">*</span>
                  </>
                }
                placeholder="e.g. Full house construction"
                value={form.name}
                error={errors.name}
                onChange={(e) => setField("name", e.target.value)}
                disabled={saving}
              />
            </div>

            <label className="block text-sm">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Description</span>
              <Textarea
                placeholder="What this service is, in plain words"
                rows={3}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                disabled={saving}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Typical duration"
                placeholder="e.g. 8 to 14 months"
                value={form.typicalDurationText}
                onChange={(e) => setField("typicalDurationText", e.target.value)}
                disabled={saving}
              />
              <Input
                label="Budget from (₹)"
                type="number"
                min={0}
                placeholder="Optional"
                value={form.typicalBudgetMin}
                onChange={(e) => setField("typicalBudgetMin", e.target.value)}
                disabled={saving}
              />
              <Input
                label="Budget to (₹)"
                type="number"
                min={0}
                placeholder="Optional"
                value={form.typicalBudgetMax}
                error={errors.typicalBudgetMax}
                onChange={(e) => setField("typicalBudgetMax", e.target.value)}
                disabled={saving}
              />
            </div>

            <ChipListEditor
              label="What this typically covers"
              helperText="Shown before the customer enquires. Setting expectations early is the cheapest way to avoid a scope argument later."
              placeholder="e.g. Excavation and foundation"
              values={form.covers}
              onChange={(next) => setField("covers", next)}
              disabled={saving}
            />

            <ChipListEditor
              label="What it does not cover"
              helperText="Nearly every construction dispute begins with something the customer assumed was included."
              placeholder="e.g. Furniture and fittings"
              values={form.excludes}
              onChange={(next) => setField("excludes", next)}
              disabled={saving}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  Default quote unit
                </span>
                <select
                  className={CN_ADMIN_SELECT_CLASS}
                  value={form.defaultUnit}
                  onChange={(e) => setField("defaultUnit", e.target.value)}
                  disabled={saving}
                >
                  {UNITS.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Status</span>
                <select
                  className={CN_ADMIN_SELECT_CLASS}
                  value={form.status}
                  onChange={(e) => setField("status", e.target.value)}
                  disabled={saving}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <Input
                label="Display order"
                type="number"
                min={0}
                value={form.displayOrder}
                onChange={(e) => setField("displayOrder", e.target.value)}
                disabled={saving}
              />
            </div>

            <ChipListEditor
              label="Default quote sections"
              helperText="Sections a contractor's quote for this service starts with."
              placeholder="e.g. Civil work"
              values={form.defaultQuoteSections}
              onChange={(next) => setField("defaultQuoteSections", next)}
              disabled={saving}
            />

            <StagePlanEditor
              stages={form.defaultStages}
              onChange={(next) => setField("defaultStages", next)}
              disabled={saving}
            />

            <MediaUploadField
              label="Cover image"
              helperText="Optional — shown on the service card"
              value={form.coverImage}
              onChange={(next) => setField("coverImage", next)}
              folder="construction/services"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              disabled={saving}
            />
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-gray-100 px-4 py-3 sm:px-5">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" isLoading={saving} onClick={save}>
              {editing ? "Save changes" : "Create service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-md`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete service
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 py-4 sm:px-5">
            <p className="text-sm text-gray-600">
              Delete <strong className="text-gray-900">{deleting?.name}</strong>? Customers will no
              longer be able to enquire about it. This cannot be undone.
            </p>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-gray-100 px-4 py-3 sm:px-5">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setDeleting(null)}
              disabled={deletingBusy}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              className="w-full sm:w-auto"
              isLoading={deletingBusy}
              onClick={remove}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
