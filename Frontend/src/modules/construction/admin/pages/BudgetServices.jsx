import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ImageIcon, Link2, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
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

const EMPTY = {
  name: "",
  tagline: "",
  badge: "",
  price: "",
  unit: "per sq.ft",
  visitingFee: 0,
  typicalDurationText: "",
  description: "",
  features: [],
  image: "",
  catalogueServiceId: "",
  status: "active",
  displayOrder: 0,
};

function Thumb({ row }) {
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

/**
 * The optional catalogue service linked for reference. Every card is bookable on
 * its own regardless of this — it no longer gates anything customer-facing.
 */
function LinkStatus({ row }) {
  const linked = row.catalogueServiceId;
  if (!linked) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const live = !linked.isDeleted && linked.status === "active";
  return (
    <span
      className={
        "inline-flex items-center gap-1 text-xs font-medium " +
        (live ? "text-gray-600" : "text-red-600")
      }
      title={live ? linked.name : "The linked service is switched off"}
    >
      <Link2 className="h-3 w-3 shrink-0" />
      <span className="truncate">{live ? linked.name : `${linked.name} (unavailable)`}</span>
    </span>
  );
}

export default function BudgetServices() {
  const [rows, setRows] = useState([]);
  const [catalogue, setCatalogue] = useState([]);
  const [loading, setLoading] = useState(true);
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
      const [cards, services] = await Promise.all([
        constructionAdminApi.getBudgetServices(),
        constructionAdminApi.getServices(),
      ]);
      setRows(cards);
      setCatalogue(services);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load budget friendly services"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /** Active catalogue services to link to, plus the current link even if it has since been switched off. */
  const linkOptions = useMemo(() => {
    const currentId = editing?.catalogueServiceId?._id;
    return catalogue.filter((s) => s.status === "active" || s._id === currentId);
  }, [catalogue, editing]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY, displayOrder: rows.length });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || "",
      tagline: row.tagline || "",
      badge: row.badge || "",
      price: row.price ?? "",
      unit: row.unit || "",
      visitingFee: row.visitingFee ?? 0,
      typicalDurationText: row.typicalDurationText || "",
      description: row.description || "",
      features: row.features || [],
      image: row.image || "",
      catalogueServiceId: row.catalogueServiceId?._id || "",
      status: row.status || "active",
      displayOrder: row.displayOrder ?? 0,
    });
    setErrors({});
    setModalOpen(true);
  };

  const save = async () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Service name is required";
    if (form.price !== "") {
      const n = Number(form.price);
      if (Number.isNaN(n) || !Number.isInteger(n) || n < 0) {
        nextErrors.price = "Use a whole number of rupees, or leave it empty";
      }
    }
    const fee = Number(form.visitingFee);
    if (Number.isNaN(fee) || !Number.isInteger(fee) || fee < 0) {
      nextErrors.visitingFee = "Use a whole number of rupees";
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
        badge: form.badge.trim(),
        price: form.price === "" ? null : Number(form.price),
        unit: form.unit.trim(),
        visitingFee: Number(form.visitingFee) || 0,
        typicalDurationText: form.typicalDurationText.trim(),
        description: form.description.trim(),
        features: form.features,
        image: form.image || "",
        catalogueServiceId: form.catalogueServiceId || null,
        status: form.status || "active",
        displayOrder: Number(form.displayOrder) || 0,
      };
      if (editing) {
        await constructionAdminApi.updateBudgetService(editing._id, payload);
        toast.success("Service updated");
      } else {
        await constructionAdminApi.createBudgetService(payload);
        toast.success("Service added");
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
      await constructionAdminApi.deleteBudgetService(deleting._id);
      toast.success("Service deleted");
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not delete service"));
    } finally {
      setDeletingBusy(false);
    }
  };

  const priceCell = (row) =>
    row.price != null ? (
      <span className="text-sm font-semibold tabular-nums text-gray-900">
        From {fullMoney(row.price)}{" "}
        {row.unit ? <span className="text-xs font-normal text-gray-500">{row.unit}</span> : null}
      </span>
    ) : (
      <span className="text-xs text-gray-500">Quoted after a site visit</span>
    );

  const columns = [
    {
      key: "name",
      header: "Service",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <Thumb row={row} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">
              {row.name}
              {row.badge ? (
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                  {row.badge}
                </span>
              ) : null}
            </p>
            <p className="truncate text-xs text-gray-500">{row.tagline || "—"}</p>
          </div>
        </div>
      ),
    },
    { key: "price", header: "Price", cell: priceCell },
    {
      key: "link",
      header: "Catalogue service",
      cell: (row) => <LinkStatus row={row} />,
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
          <Thumb row={row} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{row.name}</p>
            <div className="mt-0.5">{priceCell(row)}</div>
          </div>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <div className="mt-2">
        <LinkStatus row={row} />
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
        eyebrow="Construction · Budget Friendly"
        title="Budget Friendly Services"
        description="The offerings shown under Budget Friendly in the app. Customers book them the same way as a Residential/Commercial package: fill in the site details, pay the visiting fee if there is one, and the request goes to contractors near the site."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> Add service
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
          icon: <Receipt className="h-10 w-10" />,
          title: "No budget friendly services yet",
          description:
            "Add the value-focused work you offer. Customers see these under Budget Friendly in the app.",
        }}
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-2xl`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">
              {editing ? "Edit service" : "Add budget friendly service"}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label={
                  <>
                    Service name<span className="ml-0.5 text-red-500">*</span>
                  </>
                }
                placeholder="e.g. Budget Home Construction"
                value={form.name}
                error={errors.name}
                onChange={(e) => setField("name", e.target.value)}
                disabled={saving}
              />
              <Input
                label="Tagline"
                placeholder="e.g. Quality building, smart spending"
                value={form.tagline}
                onChange={(e) => setField("tagline", e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Starting price (₹)"
                type="number"
                min={0}
                step={1}
                placeholder="Optional"
                helperText="Leave empty to show “Quoted after a site visit”"
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
                placeholder="e.g. Popular"
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
              helperText="Charged before the request is sent to contractors. 0 means the visit is free."
              value={form.visitingFee}
              error={errors.visitingFee}
              onChange={(e) => setField("visitingFee", e.target.value)}
              disabled={saving}
            />

            <Input
              label="Typical duration"
              placeholder="e.g. 8 to 12 months"
              value={form.typicalDurationText}
              onChange={(e) => setField("typicalDurationText", e.target.value)}
              disabled={saving}
            />

            <label className="block text-sm">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Description</span>
              <Textarea
                placeholder="What this is, in plain words"
                rows={3}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                disabled={saving}
              />
            </label>

            <ChipListEditor
              label="What's included"
              helperText="Each line becomes a tick on the card. Press Enter to add."
              placeholder="e.g. Foundation to finishing"
              values={form.features}
              onChange={(next) => setField("features", next)}
              disabled={saving}
            />

            <label className="block text-sm">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Related catalogue service (optional)
              </span>
              <select
                className={CN_ADMIN_SELECT_CLASS}
                value={form.catalogueServiceId}
                onChange={(e) => setField("catalogueServiceId", e.target.value)}
                disabled={saving}
              >
                <option value="">None</option>
                {linkOptions.map((service) => (
                  <option key={service._id} value={service._id}>
                    {service.name}
                    {service.categoryId?.name ? ` · ${service.categoryId.name}` : ""}
                    {service.status !== "active" ? " (inactive)" : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-gray-500">
                Customers book this card directly — the site visit is offered to contractors the
                same way as a Residential/Commercial package. Linking a catalogue service here is
                just for your own reference and does not affect the booking.
              </span>
            </label>

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

            <MediaUploadField
              label="Image"
              helperText="Optional — shown on the card"
              value={form.image}
              onChange={(next) => setField("image", next)}
              folder="construction/budget-services"
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
              {editing ? "Save changes" : "Add service"}
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
              Delete <strong className="text-gray-900">{deleting?.name}</strong>? It disappears from
              the customer app straight away. The catalogue service it was linked to is not affected.
              This cannot be undone.
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
