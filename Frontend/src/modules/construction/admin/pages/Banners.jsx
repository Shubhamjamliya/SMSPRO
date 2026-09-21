import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ImageIcon, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader, AdminTable, StatusBadge } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import MediaUploadField from "@/modules/bikeRent/shared/components/MediaUploadField";
import constructionAdminApi from "../services/adminApi";
import { shortDate } from "../../shared/format";
import {
  CN_ADMIN_PAGE_CLASS,
  CN_ADMIN_SELECT_CLASS,
  CN_DIALOG_CONTENT_CLASS,
} from "../utils/adminTheme";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

/** Offered as suggestions on the link field; any in-app path or https:// address works. */
const LINK_SUGGESTIONS = [
  "/construction/enquiries",
  "/construction/quotations",
  "/construction/projects",
  "/construction/contractors",
];

const EMPTY = {
  image: "",
  title: "",
  subtitle: "",
  link: "",
  startDate: "",
  endDate: "",
  status: "active",
  displayOrder: 0,
};

/** yyyy-mm-dd in the admin's own timezone, which is what a date input expects. */
const toDateInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** A start date means the beginning of that day, an end date the very end of it. */
const startOfDayIso = (v) => (v ? new Date(`${v}T00:00:00`).toISOString() : null);
const endOfDayIso = (v) => (v ? new Date(`${v}T23:59:59.999`).toISOString() : null);

/**
 * What customers actually see for this banner right now. "Active" alone would
 * mislead: an active banner whose end date has passed is not on screen.
 */
const liveState = (row) => {
  if (row.status !== "active") return { label: "Inactive", tone: "neutral" };
  const now = Date.now();
  if (row.startDate && new Date(row.startDate).getTime() > now) return { label: "Scheduled", tone: "info" };
  if (row.endDate && new Date(row.endDate).getTime() < now) return { label: "Expired", tone: "danger" };
  return { label: "Live", tone: "success" };
};

const scheduleText = (row) => {
  if (!row.startDate && !row.endDate) return "Always";
  if (row.startDate && row.endDate) return `${shortDate(row.startDate)} – ${shortDate(row.endDate)}`;
  return row.startDate ? `From ${shortDate(row.startDate)}` : `Until ${shortDate(row.endDate)}`;
};

function BannerThumb({ row }) {
  return row?.image ? (
    <img
      src={row.image}
      alt=""
      loading="lazy"
      className="h-12 w-24 shrink-0 rounded-lg border border-gray-200 bg-white object-cover"
    />
  ) : (
    <span className="inline-flex h-12 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-300">
      <ImageIcon className="h-4 w-4" />
    </span>
  );
}

export default function Banners() {
  const [rows, setRows] = useState([]);
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
      setRows(await constructionAdminApi.getBanners());
    } catch (error) {
      toast.error(errorMessage(error, "Could not load banners"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

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
      image: row.image || "",
      title: row.title || "",
      subtitle: row.subtitle || "",
      link: row.link || "",
      startDate: toDateInput(row.startDate),
      endDate: toDateInput(row.endDate),
      status: row.status || "active",
      displayOrder: row.displayOrder ?? 0,
    });
    setErrors({});
    setModalOpen(true);
  };

  const save = async () => {
    const nextErrors = {};
    if (!form.image) nextErrors.image = "Upload the banner image";
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      nextErrors.endDate = "The end date cannot be before the start date";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error(Object.values(nextErrors)[0]);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        image: form.image,
        title: form.title.trim(),
        subtitle: form.subtitle.trim(),
        link: form.link.trim(),
        startDate: startOfDayIso(form.startDate),
        endDate: endOfDayIso(form.endDate),
        status: form.status || "active",
        displayOrder: Number(form.displayOrder) || 0,
      };
      if (editing) {
        await constructionAdminApi.updateBanner(editing._id, payload);
        toast.success("Banner updated");
      } else {
        await constructionAdminApi.createBanner(payload);
        toast.success("Banner added");
      }
      setModalOpen(false);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not save banner"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await constructionAdminApi.deleteBanner(deleting._id);
      toast.success("Banner deleted");
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not delete banner"));
    } finally {
      setDeletingBusy(false);
    }
  };

  const stateChip = (row) => {
    const state = liveState(row);
    return <StatusBadge tone={state.tone} label={state.label} />;
  };

  const linkCell = (row) =>
    row.link ? (
      <span className="inline-flex max-w-[16rem] items-center gap-1 text-xs text-gray-600" title={row.link}>
        <Link2 className="h-3 w-3 shrink-0" />
        <span className="truncate">{row.link}</span>
      </span>
    ) : (
      <span className="text-xs text-gray-400">Not tappable</span>
    );

  const columns = [
    {
      key: "banner",
      header: "Banner",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <BannerThumb row={row} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{row.title || "Untitled banner"}</p>
            {row.subtitle ? <p className="truncate text-xs text-gray-500">{row.subtitle}</p> : null}
          </div>
        </div>
      ),
    },
    { key: "link", header: "Opens", cell: linkCell },
    { key: "schedule", header: "Runs", cell: (row) => <span className="text-xs text-gray-600">{scheduleText(row)}</span> },
    { key: "order", header: "Order", align: "center", cell: (row) => <span className="tabular-nums">{row.displayOrder}</span> },
    { key: "status", header: "Status", cell: stateChip },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => openEdit(row)} title="Edit banner">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleting(row)}
            title="Delete banner"
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
      {row.image ? (
        <img src={row.image} alt="" loading="lazy" className="mb-2.5 h-28 w-full rounded-lg object-cover" />
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{row.title || "Untitled banner"}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {scheduleText(row)} · order {row.displayOrder}
          </p>
        </div>
        {stateChip(row)}
      </div>
      <div className="mt-2">{linkCell(row)}</div>
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
        eyebrow="Construction · Catalogue"
        title="Banners"
        description="The banners shown at the top of the construction home screen in the app. They play in order, and a schedule lets you set one up ahead of time and have it appear and disappear on its own."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> Add banner
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
          icon: <ImageIcon className="h-10 w-10" />,
          title: "No banners yet",
          description:
            "Add a banner and it appears at the top of the construction home screen. Without any, that space stays empty.",
        }}
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-2xl`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">{editing ? "Edit banner" : "Add banner"}</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            <div>
              <MediaUploadField
                label={
                  <>
                    Banner image<span className="ml-0.5 text-red-500">*</span>
                  </>
                }
                helperText="Wide pictures work best — about 1200 × 500 pixels. Keep the important part away from the bottom edge, where the title sits."
                value={form.image}
                onChange={(next) => setField("image", next)}
                folder="construction/banners"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                disabled={saving}
              />
              {errors.image ? <p className="mt-1 text-xs text-red-600">{errors.image}</p> : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Title"
                placeholder="Optional — shown over the image"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                disabled={saving}
              />
              <Input
                label="Subtitle"
                placeholder="Optional"
                value={form.subtitle}
                onChange={(e) => setField("subtitle", e.target.value)}
                disabled={saving}
              />
            </div>

            <div>
              <Input
                label="Opens when tapped"
                list="banner-links"
                placeholder="/construction/enquiries or https://…"
                helperText="An in-app page or a full web address. Leave empty and the banner is just a picture."
                value={form.link}
                onChange={(e) => setField("link", e.target.value)}
                disabled={saving}
              />
              <datalist id="banner-links">
                {LINK_SUGGESTIONS.map((path) => (
                  <option key={path} value={path} />
                ))}
              </datalist>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Show from"
                type="date"
                helperText="Leave empty to start straight away"
                value={form.startDate}
                onChange={(e) => setField("startDate", e.target.value)}
                disabled={saving}
              />
              <Input
                label="Show until (inclusive)"
                type="date"
                helperText="Leave empty to run until you switch it off"
                value={form.endDate}
                error={errors.endDate}
                onChange={(e) => setField("endDate", e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Status</span>
                <select
                  className={CN_ADMIN_SELECT_CLASS}
                  value={form.status}
                  onChange={(e) => setField("status", e.target.value)}
                  disabled={saving}
                >
                  <option value="active">Active — shown while inside its dates</option>
                  <option value="inactive">Inactive — hidden</option>
                </select>
              </label>
              <Input
                label="Display order"
                type="number"
                min={0}
                helperText="Lower numbers play first"
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
              {editing ? "Save changes" : "Add banner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-md`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete banner
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 py-4 sm:px-5">
            <p className="text-sm text-gray-600">
              Delete <strong className="text-gray-900">{deleting?.title || "this banner"}</strong>? It
              disappears from the app straight away. To hide it for now and bring it back later, set it
              to Inactive instead. This cannot be undone.
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
