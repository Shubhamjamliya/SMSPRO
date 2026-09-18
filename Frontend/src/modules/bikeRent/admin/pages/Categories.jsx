import { useCallback, useEffect, useState } from "react";
import { FolderTree, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/shared/components/admin";
import bikeRentAdminApi from "../services/adminApi";
import { BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS } from "../utils/adminTheme";
import MediaUploadField from "../../shared/components/MediaUploadField";

const EMPTY_FORM = {
  name: "",
  description: "",
  status: "active",
  icon: "",
};

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const DIALOG_CONTENT_CLASS =
  "just-order-theme-scope flex w-[calc(100%-1rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 " +
  "max-h-[min(90dvh,640px)] rounded-2xl sm:w-full";

export default function Categories() {
  const [records, setRecords] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const result = await bikeRentAdminApi.getCategories({
        page: meta.page,
        limit: meta.limit,
        search: search.trim() || undefined,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      setRecords(result.records || []);
      setMeta((current) => ({
        ...current,
        page: result.page || current.page,
        pages: result.pages || 1,
        total: result.total || 0,
        limit: result.limit || current.limit,
      }));
    } catch (error) {
      toast.error(errorMessage(error, "Failed to load categories"));
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, search]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const openForm = (category) => {
    setEditing(category || null);
    setForm(
      category
        ? {
            name: category.name || "",
            description: category.description || "",
            status: category.status || "active",
            icon: category.icon || "",
          }
        : EMPTY_FORM,
    );
    setErrors({});
    setFormOpen(true);
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
        description: String(form.description || "").trim(),
        status: form.status || "active",
        icon: form.icon || "",
      };
      if (editing?.id) await bikeRentAdminApi.updateCategory(editing.id, payload);
      else await bikeRentAdminApi.createCategory(payload);
      toast.success(editing ? "Category updated" : "Category created");
      setFormOpen(false);
      loadCategories();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to save category"));
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (row) => {
    try {
      await bikeRentAdminApi.updateCategoryStatus(
        row.id,
        row.status === "active" ? "inactive" : "active",
      );
      toast.success("Category status updated");
      loadCategories();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to update status"));
    }
  };

  const remove = async () => {
    try {
      await bikeRentAdminApi.deleteCategory(deleting.id);
      toast.success("Category deleted");
      setDeleting(null);
      loadCategories();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to delete category"));
    }
  };

  const activeCount = records.filter((item) => item.status === "active").length;

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-4 lg:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00] text-white">
              <FolderTree className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-black text-slate-900 sm:text-xl truncate">
                Bike Categories
              </h1>
              <p className="text-xs text-slate-500 sm:text-sm">
                {meta.total} total · {activeCount} active on this page
              </p>
            </div>
          </div>
          <Button className="w-full gap-2 sm:w-auto" onClick={() => openForm()}>
            <Plus size={16} /> Add Category
          </Button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-3 sm:p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-10 pl-9"
                placeholder="Search categories…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setMeta((value) => ({ ...value, page: 1 }));
                }}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-14 text-sm text-slate-500">
              <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-[#FF6A00] border-t-transparent" />
              Loading…
            </div>
          ) : records.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <FolderTree className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="font-semibold text-slate-800">No categories found</p>
              <p className="mt-1 text-sm text-slate-500">
                {search ? "Try a different search." : "Create a category to start your fleet."}
              </p>
              {!search ? (
                <Button className="mt-4 gap-2" onClick={() => openForm()}>
                  <Plus size={16} /> Add Category
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="space-y-2 p-3 md:hidden">
                {records.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                  >
                    <div className="flex items-start gap-3">
                      {row.icon ? (
                        <img
                          src={row.icon}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover bg-white"
                        />
                      ) : (
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400">
                          <FolderTree className="h-4 w-4" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate">{row.name}</p>
                            {row.description ? (
                              <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{row.description}</p>
                            ) : null}
                          </div>
                          <StatusBadge status={row.status} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-1.5 border-t border-slate-200/80 pt-2">
                      <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => updateStatus(row)}>
                        {row.status === "active" ? "Disable" : "Enable"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 px-2.5" onClick={() => openForm(row)}>
                        <Pencil size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2.5 text-red-600 border-red-200"
                        onClick={() => setDeleting(row)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {row.icon ? (
                              <img
                                src={row.icon}
                                alt=""
                                className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 object-cover"
                              />
                            ) : (
                              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                                <FolderTree className="h-4 w-4" />
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 truncate">{row.name}</p>
                              {row.description ? (
                                <p className="text-xs text-slate-500 line-clamp-1">{row.description}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => updateStatus(row)}>
                              {row.status === "active" ? "Disable" : "Enable"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openForm(row)}>
                              <Pencil size={15} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600"
                              onClick={() => setDeleting(row)}
                            >
                              <Trash2 size={15} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {meta.pages > 1 ? (
                <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2.5 sm:px-4">
                  <p className="text-xs text-slate-500">
                    Page {meta.page} of {meta.pages}
                  </p>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={meta.page <= 1}
                      onClick={() => setMeta((v) => ({ ...v, page: Math.max(1, v.page - 1) }))}
                    >
                      Prev
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={meta.page >= meta.pages}
                      onClick={() => setMeta((v) => ({ ...v, page: Math.min(v.pages, v.page + 1) }))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className={DIALOG_CONTENT_CLASS}>
          <DialogHeader className="shrink-0 border-b border-slate-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">
              {editing ? "Edit Category" : "Add Category"}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-700">
                Name <span className="text-red-500">*</span>
              </span>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Scooter"
              />
              {errors.name ? <p className="mt-1 text-xs text-red-600">{errors.name}</p> : null}
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Status</span>
              <select
                className={BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            <MediaUploadField
              label="Category icon"
              helperText="Optional image"
              value={form.icon}
              onChange={(next) => setForm((current) => ({ ...current, icon: next }))}
              folder="bike-rent/categories"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              disabled={saving}
            />

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Description</span>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Short description"
              />
            </label>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setFormOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={() => setDeleting(null)}>
        <DialogContent className={`${DIALOG_CONTENT_CLASS} max-w-md`}>
          <DialogHeader className="shrink-0 border-b border-slate-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">Delete Category</DialogTitle>
          </DialogHeader>
          <div className="px-4 py-4 sm:px-5">
            <p className="text-sm text-slate-600">
              Delete <strong className="text-slate-900">{deleting?.name}</strong>? This cannot be undone.
            </p>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto bg-red-600 hover:bg-red-700" onClick={remove}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
