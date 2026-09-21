import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Building2, Home, Pencil, Plus, Trash2 } from "lucide-react";
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
import constructionAdminApi from "../services/adminApi";
import ChipListEditor from "../components/ChipListEditor";
import {
  PACKAGE_ICONS,
  PACKAGE_THEME_OPTIONS,
  formatRupees,
  toDisplayPackage,
} from "../../shared/packageTheme";
import {
  CN_ADMIN_PAGE_CLASS,
  CN_ADMIN_SELECT_CLASS,
  CN_DIALOG_CONTENT_CLASS,
} from "../utils/adminTheme";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const SEGMENTS = {
  residential: {
    title: "Residential Packages",
    description:
      "The home construction packages customers see under Residential in the app — Silver, Gold and so on. The rate is a headline figure to size a budget, not a quote.",
    noun: "residential",
    Icon: Home,
    defaultTheme: "slate",
    defaultIcon: "shield",
  },
  commercial: {
    title: "Commercial Packages",
    description:
      "The office, retail and industrial offerings customers see under Commercial in the app. The rate is a headline figure to size a budget, not a quote.",
    noun: "commercial",
    Icon: Building2,
    defaultTheme: "blue",
    defaultIcon: "building",
  },
};

const emptyForm = (segment) => ({
  name: "",
  tagline: "",
  price: "",
  unit: "per sq.ft",
  visitingFee: "",
  badge: "",
  theme: SEGMENTS[segment].defaultTheme,
  icon: SEGMENTS[segment].defaultIcon,
  isPopular: false,
  features: [],
  description: "",
  status: "active",
  displayOrder: 0,
});

/** The icon tile in the list, tinted the way the customer app will tint it. */
function PackageThumb({ row }) {
  const display = toDisplayPackage(row);
  const Icon = display.icon;
  return (
    <span
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
        display.iconBg || "bg-gray-100 text-gray-600"
      }`}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

export default function Packages({ segment }) {
  const config = SEGMENTS[segment];
  const isResidential = segment === "residential";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(() => emptyForm(segment));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await constructionAdminApi.getPackages({ segment }));
    } catch (error) {
      toast.error(errorMessage(error, "Could not load packages"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setModalOpen(false);
    setDeleting(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm(segment), displayOrder: rows.length });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || "",
      tagline: row.tagline || "",
      price: row.price ?? "",
      unit: row.unit || "per sq.ft",
      visitingFee: row.visitingFee ? row.visitingFee : "",
      badge: row.badge || "",
      theme: row.theme || config.defaultTheme,
      icon: row.icon || config.defaultIcon,
      isPopular: Boolean(row.isPopular),
      features: row.features || [],
      description: row.description || "",
      status: row.status || "active",
      displayOrder: row.displayOrder ?? 0,
    });
    setErrors({});
    setModalOpen(true);
  };

  const save = async () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Package name is required";
    if (form.price === "" || Number.isNaN(Number(form.price))) {
      nextErrors.price = "Enter the rate in rupees";
    } else if (!Number.isInteger(Number(form.price)) || Number(form.price) < 0) {
      nextErrors.price = "Use a whole number of rupees, zero or more";
    }
    if (form.visitingFee !== "") {
      const fee = Number(form.visitingFee);
      if (Number.isNaN(fee) || !Number.isInteger(fee) || fee < 0) {
        nextErrors.visitingFee = "Use a whole number of rupees, or leave it empty for a free visit";
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error(Object.values(nextErrors)[0]);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        tagline: form.tagline.trim(),
        price: Number(form.price),
        unit: form.unit.trim() || "per sq.ft",
        visitingFee: form.visitingFee === "" ? 0 : Number(form.visitingFee),
        badge: form.badge.trim(),
        theme: form.theme,
        icon: form.icon,
        status: form.status || "active",
        displayOrder: Number(form.displayOrder) || 0,
        ...(isResidential
          ? { isPopular: form.isPopular, features: form.features }
          : { description: form.description.trim() }),
      };
      if (editing) {
        await constructionAdminApi.updatePackage(editing._id, payload);
        toast.success("Package updated");
      } else {
        await constructionAdminApi.createPackage({ ...payload, segment });
        toast.success("Package created");
      }
      setModalOpen(false);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not save package"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await constructionAdminApi.deletePackage(deleting._id);
      toast.success("Package deleted");
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not delete package"));
    } finally {
      setDeletingBusy(false);
    }
  };

  const loadDefaults = async () => {
    setLoadingDefaults(true);
    try {
      await constructionAdminApi.loadDefaultPackages(segment);
      toast.success("Default packages loaded");
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not load the default packages"));
    } finally {
      setLoadingDefaults(false);
    }
  };

  const columns = [
    {
      key: "name",
      header: "Package",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <PackageThumb row={row} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">
              {row.name}
              {row.isPopular ? (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                  Popular
                </span>
              ) : null}
            </p>
            <p className="truncate text-xs text-gray-500">{row.tagline || "—"}</p>
          </div>
        </div>
      ),
    },
    {
      key: "price",
      header: "Rate",
      cell: (row) => (
        <span className="text-sm font-semibold tabular-nums text-gray-900">
          {formatRupees(row.price)}{" "}
          <span className="text-xs font-normal text-gray-500">{row.unit}</span>
        </span>
      ),
    },
    {
      key: "visitingFee",
      header: "Visit fee",
      cell: (row) =>
        row.visitingFee > 0 ? (
          <span className="text-sm tabular-nums text-gray-900">{formatRupees(row.visitingFee)}</span>
        ) : (
          <span className="text-xs text-gray-500">Free</span>
        ),
    },
    {
      key: "detail",
      header: "Detail",
      align: "center",
      cell: (row) =>
        isResidential ? (
          row.features?.length ? (
            <span className="text-xs tabular-nums text-gray-600">
              {row.features.length} inclusions
            </span>
          ) : (
            <span className="text-xs font-medium text-amber-600">No inclusions listed</span>
          )
        ) : row.description ? (
          <span className="text-xs text-gray-600">Described</span>
        ) : (
          <span className="text-xs font-medium text-amber-600">No description</span>
        ),
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => openEdit(row)} title="Edit package">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleting(row)}
            title="Delete package"
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
          <PackageThumb row={row} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{row.name}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {formatRupees(row.price)} {row.unit}
            </p>
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
        eyebrow="Construction · End to End"
        title={config.title}
        description={config.description}
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> Add package
          </Button>
        }
      />

      <AdminTable
        columns={columns}
        data={rows}
        loading={loading}
        skeletonRows={4}
        getRowId={(row) => row._id}
        renderMobileCard={renderMobileCard}
        emptyState={{
          icon: <config.Icon className="h-10 w-10" />,
          title: `No ${config.noun} packages yet`,
          description:
            "Customers see nothing under this heading until you add a package. You can start from the ones the app originally showed, or add your own.",
          action: (
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" isLoading={loadingDefaults} onClick={loadDefaults}>
                Load default packages
              </Button>
              <Button onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" /> Add package
              </Button>
            </div>
          ),
        }}
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-2xl`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">
              {editing ? "Edit package" : `Add ${config.noun} package`}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={
                  <>
                    Package name<span className="ml-0.5 text-red-500">*</span>
                  </>
                }
                placeholder={isResidential ? "e.g. Gold Package" : "e.g. Corporate Office Fitouts"}
                value={form.name}
                error={errors.name}
                onChange={(e) => setField("name", e.target.value)}
                disabled={saving}
              />
              <Input
                label="Tagline"
                placeholder={isResidential ? "e.g. Premium Quality & Finish" : "e.g. Modern Workspaces"}
                value={form.tagline}
                onChange={(e) => setField("tagline", e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label={
                  <>
                    Rate (₹)<span className="ml-0.5 text-red-500">*</span>
                  </>
                }
                type="number"
                min={0}
                step={1}
                placeholder="1950"
                value={form.price}
                error={errors.price}
                onChange={(e) => setField("price", e.target.value)}
                disabled={saving}
              />
              <Input
                label="Per"
                placeholder="per sq.ft"
                value={form.unit}
                onChange={(e) => setField("unit", e.target.value)}
                disabled={saving}
              />
              <Input
                label="Badge"
                placeholder={isResidential ? "e.g. Most Popular" : "e.g. Office"}
                value={form.badge}
                onChange={(e) => setField("badge", e.target.value)}
                disabled={saving}
              />
            </div>

            <Input
              label="Site visiting fee (₹)"
              type="number"
              min={0}
              step={1}
              placeholder="e.g. 500 — leave empty for a free visit"
              helperText="What the customer pays before their request is sent to contractors. With a fee, nothing is sent until the payment succeeds."
              value={form.visitingFee}
              error={errors.visitingFee}
              onChange={(e) => setField("visitingFee", e.target.value)}
              disabled={saving}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Colour</span>
                <select
                  className={CN_ADMIN_SELECT_CLASS}
                  value={form.theme}
                  onChange={(e) => setField("theme", e.target.value)}
                  disabled={saving}
                >
                  {PACKAGE_THEME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Icon</span>
                <select
                  className={CN_ADMIN_SELECT_CLASS}
                  value={form.icon}
                  onChange={(e) => setField("icon", e.target.value)}
                  disabled={saving}
                >
                  {Object.entries(PACKAGE_ICONS).map(([value, { label }]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {isResidential ? (
              <>
                <ChipListEditor
                  label="What's included"
                  helperText="Each line becomes a tick on the package card. Press Enter to add."
                  placeholder="e.g. 15-Year Structural Warranty"
                  values={form.features}
                  onChange={(next) => setField("features", next)}
                  disabled={saving}
                />
                <label className="flex items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300"
                    checked={form.isPopular}
                    onChange={(e) => setField("isPopular", e.target.checked)}
                    disabled={saving}
                  />
                  <span>
                    <span className="font-medium text-gray-800">Mark as most popular</span>
                    <span className="block text-xs text-gray-500">
                      Shows the badge as a ribbon above the card.
                    </span>
                  </span>
                </label>
              </>
            ) : (
              <label className="block text-sm">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Description</span>
                <Textarea
                  placeholder="What this covers, in a sentence or two"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  disabled={saving}
                />
              </label>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Status</span>
                <select
                  className={CN_ADMIN_SELECT_CLASS}
                  value={form.status}
                  onChange={(e) => setField("status", e.target.value)}
                  disabled={saving}
                >
                  <option value="active">Active — shown in the app</option>
                  <option value="inactive">Inactive — hidden</option>
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
              {editing ? "Save changes" : "Create package"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-md`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete package
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 py-4 sm:px-5">
            <p className="text-sm text-gray-600">
              Delete <strong className="text-gray-900">{deleting?.name}</strong>? It will disappear
              from the customer app straight away. This cannot be undone.
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
