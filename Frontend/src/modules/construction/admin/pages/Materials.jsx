import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ImageIcon, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import ChipListEditor from "../components/ChipListEditor";
import { fullMoney } from "../../shared/format";
import {
  CN_ADMIN_PAGE_CLASS,
  CN_ADMIN_SELECT_CLASS,
  CN_DIALOG_CONTENT_CLASS,
} from "../utils/adminTheme";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

/** Offered as suggestions only — anything can be typed, and categories already in use are added. */
const SUGGESTED_CATEGORIES = [
  "Cement",
  "Steel",
  "Bricks & Blocks",
  "Sand & Aggregates",
  "Tiles",
  "Paint",
  "Plumbing",
  "Electrical",
  "Wood & Plywood",
  "Hardware",
];

const SUGGESTED_UNITS = [
  "per bag (50 kg)",
  "per kg",
  "per tonne",
  "per piece",
  "per sq.ft",
  "per cu.ft",
  "per bundle",
  "per litre",
  "per metre",
];

const EMPTY = {
  name: "",
  brand: "",
  category: "",
  description: "",
  image: "",
  price: "",
  unit: "per bag (50 kg)",
  minOrderQty: 1,
  inStock: true,
  specifications: [],
  status: "active",
  displayOrder: 0,
};

/** A thumbnail matters here: a category of forty grey rows is hard to scan without one. */
function MaterialThumb({ row }) {
  return row?.image ? (
    <img
      src={row.image}
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

export default function Materials() {
  const [rows, setRows] = useState([]);
  const [usedCategories, setUsedCategories] = useState([]);
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
  const [togglingId, setTogglingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { materials, categories } = await constructionAdminApi.getMaterials();
      setRows(materials);
      setUsedCategories(categories);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load materials"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const categoryOptions = useMemo(() => {
    const seen = new Map();
    [...usedCategories, ...SUGGESTED_CATEGORIES].forEach((name) => {
      if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
    });
    return [...seen.values()];
  }, [usedCategories]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (categoryFilter && row.category?.toLowerCase() !== categoryFilter.toLowerCase()) {
        return false;
      }
      if (!q) return true;
      return [row.name, row.brand, row.category].some((v) => v?.toLowerCase().includes(q));
    });
  }, [rows, search, categoryFilter]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY, category: categoryFilter, displayOrder: rows.length });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || "",
      brand: row.brand || "",
      category: row.category || "",
      description: row.description || "",
      image: row.image || "",
      price: row.price ?? "",
      unit: row.unit || "per unit",
      minOrderQty: row.minOrderQty ?? 1,
      inStock: row.inStock !== false,
      specifications: row.specifications || [],
      status: row.status || "active",
      displayOrder: row.displayOrder ?? 0,
    });
    setErrors({});
    setModalOpen(true);
  };

  const save = async () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Material name is required";
    if (!form.category.trim()) nextErrors.category = "Choose or type a category";
    if (form.price === "" || Number.isNaN(Number(form.price)) || Number(form.price) < 0) {
      nextErrors.price = "Enter the price in rupees";
    }
    if (!(Number(form.minOrderQty) > 0)) {
      nextErrors.minOrderQty = "Must be more than zero";
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
        brand: form.brand.trim(),
        category: form.category.trim(),
        description: form.description.trim(),
        image: form.image || "",
        price: Number(form.price),
        unit: form.unit.trim() || "per unit",
        minOrderQty: Number(form.minOrderQty),
        inStock: form.inStock,
        specifications: form.specifications,
        status: form.status || "active",
        displayOrder: Number(form.displayOrder) || 0,
      };
      if (editing) {
        await constructionAdminApi.updateMaterial(editing._id, payload);
        toast.success("Material updated");
      } else {
        await constructionAdminApi.createMaterial(payload);
        toast.success("Material added");
      }
      setModalOpen(false);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not save material"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await constructionAdminApi.deleteMaterial(deleting._id);
      toast.success("Material deleted");
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not delete material"));
    } finally {
      setDeletingBusy(false);
    }
  };

  /** Stock changes daily, so it gets its own one-click control instead of an edit form. */
  const toggleStock = async (row) => {
    setTogglingId(row._id);
    try {
      await constructionAdminApi.updateMaterial(row._id, { inStock: row.inStock === false });
      setRows((prev) =>
        prev.map((r) => (r._id === row._id ? { ...r, inStock: r.inStock === false } : r)),
      );
    } catch (error) {
      toast.error(errorMessage(error, "Could not update stock"));
    } finally {
      setTogglingId(null);
    }
  };

  const stockChip = (row) => {
    const inStock = row.inStock !== false;
    return (
      <button
        type="button"
        onClick={() => toggleStock(row)}
        disabled={togglingId === row._id}
        title={inStock ? "Click to mark out of stock" : "Click to mark back in stock"}
        className={
          "rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-opacity disabled:opacity-50 " +
          (inStock
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100")
        }
      >
        {inStock ? "In stock" : "Out of stock"}
      </button>
    );
  };

  const columns = [
    {
      key: "name",
      header: "Material",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <MaterialThumb row={row} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{row.name}</p>
            <p className="truncate text-xs text-gray-500">
              {[row.brand, row.category].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "price",
      header: "Price",
      cell: (row) => (
        <span className="text-sm font-semibold tabular-nums text-gray-900">
          {fullMoney(row.price)}{" "}
          <span className="text-xs font-normal text-gray-500">{row.unit}</span>
        </span>
      ),
    },
    { key: "stock", header: "Stock", align: "center", cell: stockChip },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => openEdit(row)} title="Edit material">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleting(row)}
            title="Delete material"
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
          <MaterialThumb row={row} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{row.name}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {fullMoney(row.price)} {row.unit}
            </p>
          </div>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <span className="truncate">{[row.brand, row.category].filter(Boolean).join(" · ")}</span>
        {stockChip(row)}
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

  const filtered = Boolean(search || categoryFilter);

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <PageHeader
        eyebrow="Construction · Material Services"
        title="Materials"
        description="Construction materials customers can browse and request a quote for. Unlike services, materials have a list price. Customers see it, and a request keeps the price it was made at."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> Add material
          </Button>
        }
      />

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Search materials, brands…"
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
          {usedCategories.map((name) => (
            <option key={name} value={name}>
              {name}
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
          icon: <Package className="h-10 w-10" />,
          title: filtered ? "No materials match" : "No materials yet",
          description: filtered
            ? "Try clearing the filters."
            : "Add cement, steel, tiles and the other materials you supply. They appear under Material Services in the customer app.",
        }}
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-2xl`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">
              {editing ? "Edit material" : "Add material"}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={
                  <>
                    Material name<span className="ml-0.5 text-red-500">*</span>
                  </>
                }
                placeholder="e.g. OPC 53 Grade Cement"
                value={form.name}
                error={errors.name}
                onChange={(e) => setField("name", e.target.value)}
                disabled={saving}
              />
              <Input
                label="Brand"
                placeholder="e.g. UltraTech"
                value={form.brand}
                onChange={(e) => setField("brand", e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={
                  <>
                    Category<span className="ml-0.5 text-red-500">*</span>
                  </>
                }
                list="material-categories"
                placeholder="Pick one or type a new one"
                value={form.category}
                error={errors.category}
                onChange={(e) => setField("category", e.target.value)}
                disabled={saving}
              />
              <datalist id="material-categories">
                {categoryOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <Input
                label="Sold as"
                list="material-units"
                placeholder="e.g. per bag (50 kg)"
                value={form.unit}
                onChange={(e) => setField("unit", e.target.value)}
                disabled={saving}
              />
              <datalist id="material-units">
                {SUGGESTED_UNITS.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label={
                  <>
                    Price (₹)<span className="ml-0.5 text-red-500">*</span>
                  </>
                }
                type="number"
                min={0}
                step="0.01"
                placeholder="385"
                value={form.price}
                error={errors.price}
                onChange={(e) => setField("price", e.target.value)}
                disabled={saving}
              />
              <Input
                label="Minimum quantity"
                type="number"
                min={0}
                step="any"
                value={form.minOrderQty}
                error={errors.minOrderQty}
                onChange={(e) => setField("minOrderQty", e.target.value)}
                disabled={saving}
              />
              <Input
                label="Display order"
                type="number"
                min={0}
                value={form.displayOrder}
                onChange={(e) => setField("displayOrder", e.target.value)}
                disabled={saving}
              />
            </div>

            <label className="block text-sm">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Description</span>
              <Textarea
                placeholder="What it is and what it is good for"
                rows={3}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                disabled={saving}
              />
            </label>

            <ChipListEditor
              label="Specifications"
              helperText="Short facts a buyer compares on — grade, size, strength. Press Enter to add."
              placeholder="e.g. 53 Grade, 50 kg bag"
              values={form.specifications}
              onChange={(next) => setField("specifications", next)}
              disabled={saving}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Availability</span>
                <select
                  className={CN_ADMIN_SELECT_CLASS}
                  value={form.inStock ? "yes" : "no"}
                  onChange={(e) => setField("inStock", e.target.value === "yes")}
                  disabled={saving}
                >
                  <option value="yes">In stock</option>
                  <option value="no">Out of stock — visible, cannot be requested</option>
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
                  <option value="active">Active — shown in the app</option>
                  <option value="inactive">Inactive — hidden</option>
                </select>
              </label>
            </div>

            <MediaUploadField
              label="Image"
              helperText="Optional — shown on the material card"
              value={form.image}
              onChange={(next) => setField("image", next)}
              folder="construction/materials"
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
              {editing ? "Save changes" : "Add material"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-md`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete material
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 py-4 sm:px-5">
            <p className="text-sm text-gray-600">
              Delete <strong className="text-gray-900">{deleting?.name}</strong>? It disappears from
              the customer app straight away. Requests already made keep their copy of it. This
              cannot be undone.
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
