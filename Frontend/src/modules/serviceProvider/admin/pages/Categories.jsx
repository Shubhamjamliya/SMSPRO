import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FolderTree, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { PageHeader, AdminTable, StatusBadge } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import MediaUploadField from "@/modules/bikeRent/shared/components/MediaUploadField";
import serviceProviderAdminApi from "../services/adminApi";
import { SP_ADMIN_PAGE_CLASS, SP_ADMIN_SELECT_CLASS } from "../utils/adminTheme";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;
const EMPTY = { name: "", icon: "", description: "", status: "active" };

const DIALOG_CONTENT_CLASS =
  "just-order-theme-scope flex w-[calc(100%-1rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 " +
  "max-h-[min(90dvh,680px)] rounded-2xl sm:w-full";

function CategoryThumb({ icon }) {
  return icon ? (
    <img
      src={icon}
      alt=""
      className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 bg-white object-cover"
    />
  ) : (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-300">
      <FolderTree className="h-4.5 w-4.5" />
    </span>
  );
}

export default function Categories() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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
      const categories = await serviceProviderAdminApi.getCategories();
      setRows(categories);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load categories"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) => row.name?.toLowerCase().includes(q) || row.description?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name: row.name || "",
      icon: row.icon || "",
      description: row.description || "",
      status: row.status || "active",
    });
    setErrors({});
    setModalOpen(true);
  };

  const save = async () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Category name is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        icon: form.icon || "",
        description: form.description.trim(),
        status: form.status || "active",
      };
      if (editing) {
        await serviceProviderAdminApi.updateCategory(editing._id, payload);
        toast.success("Category updated");
      } else {
        await serviceProviderAdminApi.createCategory(payload);
        toast.success("Category created");
      }
      setModalOpen(false);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not save category"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await serviceProviderAdminApi.deleteCategory(deleting._id);
      toast.success("Category deleted");
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not delete category"));
    } finally {
      setDeletingBusy(false);
    }
  };

  const columns = [
    {
      key: "name",
      header: "Category",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <CategoryThumb icon={row.icon} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{row.name}</p>
            {row.description ? <p className="truncate text-xs text-gray-500">{row.description}</p> : null}
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => openEdit(row)} title="Edit category">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleting(row)}
            title="Delete category"
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
      <div className="flex items-start gap-3">
        <CategoryThumb icon={row.icon} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-900">{row.name}</p>
              {row.description ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{row.description}</p>
              ) : null}
            </div>
            <StatusBadge status={row.status} />
          </div>
        </div>
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
    <div className={SP_ADMIN_PAGE_CLASS}>
      <PageHeader
        title="Service Categories"
        description="Group services under categories (e.g. Home Repair, Cleaning)."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> Add category
          </Button>
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Search categories…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <AdminTable
        columns={columns}
        data={filteredRows}
        loading={loading}
        skeletonRows={5}
        getRowId={(row) => row._id}
        renderMobileCard={renderMobileCard}
        emptyState={{
          icon: <FolderTree className="h-10 w-10" />,
          title: search ? "No categories match your search" : "No categories yet",
          description: search ? "Try a different search term." : "Add your first category to get started.",
        }}
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className={DIALOG_CONTENT_CLASS}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">{editing ? "Edit category" : "Add category"}</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            <Input
              label={
                <>
                  Name<span className="ml-0.5 text-red-500">*</span>
                </>
              }
              placeholder="e.g. Home Repair"
              value={form.name}
              error={errors.name}
              onChange={(e) => setField("name", e.target.value)}
              disabled={saving}
            />

            <label className="block text-sm">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Status</span>
              <select
                className={SP_ADMIN_SELECT_CLASS}
                value={form.status}
                onChange={(e) => setField("status", e.target.value)}
                disabled={saving}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            <MediaUploadField
              label="Category image"
              helperText="Optional — shown to providers and customers"
              value={form.icon}
              onChange={(next) => setField("icon", next)}
              folder="service-provider/categories"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              disabled={saving}
            />

            <label className="block text-sm">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Description</span>
              <Textarea
                placeholder="Short description (optional)"
                rows={3}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                disabled={saving}
              />
            </label>
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
              {editing ? "Save changes" : "Create category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className={`${DIALOG_CONTENT_CLASS} max-w-md`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete category
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 py-4 sm:px-5">
            <p className="text-sm text-gray-600">
              Delete <strong className="text-gray-900">{deleting?.name}</strong>? Services under this category
              may be affected. This cannot be undone.
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
            <Button variant="danger" className="w-full sm:w-auto" isLoading={deletingBusy} onClick={remove}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
