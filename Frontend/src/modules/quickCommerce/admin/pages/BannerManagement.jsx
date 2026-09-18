import React, { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Modal from "@shared/components/ui/Modal";
import { useToast } from "@shared/components/ui/Toast";
import {
  HiOutlinePlus,
  HiOutlinePhoto,
  HiOutlineTrash,
  HiOutlinePencilSquare,
  HiOutlineEye,
  HiOutlineEyeSlash,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { convertToWebP } from "@/shared/utils/imageUploadUtils";
import { adminApi } from "../services/adminApi";
import { useAuth } from "@core/context/AuthContext";
import { getCurrentUser } from "@food/utils/auth";
import {
  canPerformAdminPermissionAction,
  extractAdminPermissions,
  extractAdminRoleId,
  fetchAdminRolePermissions,
} from "@food/utils/adminPermissions";

const PERMISSION_KEY = "quick::core_management::marketing_tools::banners";

const emptyForm = () => ({
  title: "",
  startAt: "",
  endAt: "",
  headerCategoryIds: [],
  zoneMode: "global",
  zoneIds: [],
  isDefault: false,
  isEnabled: true,
  imagePreview: "",
  imageFile: null,
});

const toDatetimeLocal = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatDisplayDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
};

const statusBadgeVariant = (status) => {
  if (status === "active") return "success";
  if (status === "upcoming") return "warning";
  return "error";
};

const BannerManagement = () => {
  const { showToast } = useToast();
  const { user: authUser } = useAuth();
  const currentUser = useMemo(() => authUser || getCurrentUser("admin"), [authUser]);
  const [resolvedPermissions, setResolvedPermissions] = useState({});

  const [banners, setBanners] = useState([]);
  const [headerCategories, setHeaderCategories] = useState([]);
  const [zones, setZones] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [formData, setFormData] = useState(emptyForm());

  useEffect(() => {
    let isMounted = true;
    const resolvePermissions = async () => {
      if (!currentUser || currentUser.role === "ADMIN") {
        if (isMounted) setResolvedPermissions({});
        return;
      }
      const existingPermissions = extractAdminPermissions(currentUser);
      if (Object.keys(existingPermissions).length > 0) {
        if (isMounted) setResolvedPermissions(existingPermissions);
        return;
      }
      const roleId = extractAdminRoleId(currentUser);
      if (!roleId) {
        if (isMounted) setResolvedPermissions({});
        return;
      }
      try {
        const rolePermissions = await fetchAdminRolePermissions(roleId);
        if (isMounted) setResolvedPermissions(rolePermissions);
      } catch {
        if (isMounted) setResolvedPermissions({});
      }
    };
    resolvePermissions();
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const canCreate = canPerformAdminPermissionAction(currentUser, resolvedPermissions, PERMISSION_KEY, "create");
  const canEdit = canPerformAdminPermissionAction(currentUser, resolvedPermissions, PERMISSION_KEY, "edit");
  const canDelete = canPerformAdminPermissionAction(currentUser, resolvedPermissions, PERMISSION_KEY, "delete");

  const loadMeta = useCallback(async () => {
    try {
      const [categoriesRes, zonesRes] = await Promise.all([
        adminApi.getCategories(),
        adminApi.getZones(),
      ]);
      const categories = categoriesRes.data?.results || categoriesRes.data?.result || [];
      const zoneList = zonesRes.data?.data?.zones || zonesRes.data?.results || zonesRes.data?.result || [];
      setHeaderCategories(
        (Array.isArray(categories) ? categories : []).filter((c) => String(c.type || "") === "header"),
      );
      setZones(Array.isArray(zoneList) ? zoneList : []);
    } catch {
      showToast("Failed to load categories or zones", "error");
    }
  }, [showToast]);

  const loadBanners = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.getBanners();
      const list = res.data?.results || res.data?.result || [];
      setBanners(Array.isArray(list) ? list : []);
    } catch (error) {
      showToast(error?.response?.data?.message || "Failed to load banners", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadMeta();
    loadBanners();
  }, [loadMeta, loadBanners]);

  const openCreateModal = () => {
    setEditingBanner(null);
    setFormData(emptyForm());
    setIsModalOpen(true);
  };

  const openEditModal = (banner) => {
    setEditingBanner(banner);
    setFormData({
      title: banner.title || "",
      startAt: toDatetimeLocal(banner.startAt),
      endAt: toDatetimeLocal(banner.endAt),
      headerCategoryIds: (banner.headerCategoryIds || []).map(String),
      zoneMode: banner.isGlobal || !(banner.zoneIds || []).length ? "global" : "specific",
      zoneIds: (banner.zoneIds || []).map(String),
      isDefault: Boolean(banner.isDefault),
      isEnabled: banner.isEnabled !== false,
      imagePreview: banner.imageUrl || "",
      imageFile: null,
    });
    setIsModalOpen(true);
  };

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await convertToWebP(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({
          ...prev,
          imagePreview: reader.result,
          imageFile: compressed,
        }));
      };
      reader.readAsDataURL(compressed);
    } catch {
      showToast("Failed to process image", "error");
    } finally {
      event.target.value = "";
    }
  };

  const toggleHeaderCategory = (id) => {
    const value = String(id);
    setFormData((prev) => {
      const exists = prev.headerCategoryIds.includes(value);
      return {
        ...prev,
        headerCategoryIds: exists
          ? prev.headerCategoryIds.filter((item) => item !== value)
          : [...prev.headerCategoryIds, value],
      };
    });
  };

  const toggleZone = (id) => {
    const value = String(id);
    setFormData((prev) => {
      const exists = prev.zoneIds.includes(value);
      return {
        ...prev,
        zoneIds: exists
          ? prev.zoneIds.filter((item) => item !== value)
          : [...prev.zoneIds, value],
      };
    });
  };

  const handleSave = async () => {
    if (!formData.startAt || !formData.endAt) {
      showToast("Start and end date are required", "error");
      return;
    }
    if (!formData.headerCategoryIds.length) {
      showToast("Select at least one header category", "error");
      return;
    }
    if (formData.zoneMode === "specific" && !formData.zoneIds.length) {
      showToast("Select at least one zone or choose Global Zone", "error");
      return;
    }
    if (!editingBanner && !formData.imageFile) {
      showToast("Banner image is required", "error");
      return;
    }

    const payload = new FormData();
    payload.append("title", formData.title || "");
    payload.append("startAt", new Date(formData.startAt).toISOString());
    payload.append("endAt", new Date(formData.endAt).toISOString());
    payload.append("headerCategoryIds", JSON.stringify(formData.headerCategoryIds));
    payload.append("zoneMode", formData.zoneMode);
    payload.append(
      "zoneIds",
      JSON.stringify(formData.zoneMode === "global" ? [] : formData.zoneIds),
    );
    payload.append("isDefault", String(Boolean(formData.isDefault)));
    payload.append("isEnabled", String(Boolean(formData.isEnabled)));
    if (formData.imageFile) {
      payload.append("image", formData.imageFile);
    }

    setIsSaving(true);
    try {
      if (editingBanner) {
        await adminApi.updateBanner(editingBanner._id || editingBanner.id, payload);
        showToast("Banner updated", "success");
      } else {
        await adminApi.createBanner(payload);
        showToast("Banner created", "success");
      }
      setIsModalOpen(false);
      setEditingBanner(null);
      setFormData(emptyForm());
      await loadBanners();
    } catch (error) {
      showToast(error?.response?.data?.message || "Failed to save banner", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnabled = async (banner) => {
    if (!canEdit) return;
    try {
      const next = !(banner.isEnabled !== false);
      const res = await adminApi.toggleBannerStatus(banner._id || banner.id, next);
      const updated = res.data?.result;
      if (updated) {
        setBanners((prev) =>
          prev.map((item) =>
            String(item._id || item.id) === String(banner._id || banner.id) ? updated : item,
          ),
        );
      } else {
        await loadBanners();
      }
      showToast(next ? "Banner enabled" : "Banner disabled", "success");
    } catch (error) {
      showToast(error?.response?.data?.message || "Failed to update banner", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await adminApi.deleteBanner(deleteTarget._id || deleteTarget.id);
      setBanners((prev) =>
        prev.filter((item) => String(item._id || item.id) !== String(deleteTarget._id || deleteTarget.id)),
      );
      setDeleteTarget(null);
      showToast("Banner deleted", "warning");
    } catch (error) {
      showToast(error?.response?.data?.message || "Failed to delete banner", "error");
    }
  };

  return (
    <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1 mb-6">
        <div>
          <h1 className="ds-h1 bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-500">Banner Management</h1>
          <p className="ds-description mt-2">
            Manage Quick Commerce banners by header category, zone, schedule, and default fallback.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={openCreateModal}
            className="group flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-primary to-orange-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 active:translate-y-0 transition-all"
          >
            <HiOutlinePlus className="h-5 w-5 group-hover:rotate-90 transition-transform duration-300" />
            Add Banner
          </button>
        )}
      </div>

      <Card className="border-none shadow-2xl shadow-slate-200/50 ring-1 ring-slate-100 bg-white/80 backdrop-blur-xl rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm font-semibold text-slate-500">Loading banners...</div>
        ) : banners.length === 0 ? (
          <div className="p-12 text-center">
            <HiOutlinePhoto className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-500">No banners yet</p>
            {canCreate && (
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-4 text-sm font-bold text-primary hover:underline"
              >
                Create your first banner
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left border-collapse">
              <thead className="bg-slate-50/80 border-b border-slate-100 backdrop-blur-sm">
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="px-6 py-5">Banner</th>
                  <th className="px-6 py-5">Header Categories</th>
                  <th className="px-6 py-5">Zones</th>
                  <th className="px-6 py-5">Default</th>
                  <th className="px-6 py-5">Status</th>
                  <th className="px-6 py-5">Start</th>
                  <th className="px-6 py-5">End</th>
                  <th className="px-6 py-5">Created</th>
                  <th className="px-6 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {banners.map((banner) => (
                  <tr key={banner._id || banner.id} className="group hover:bg-slate-50/80 transition-colors duration-200">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <img
                          src={banner.imageUrl}
                          alt={banner.title || "Banner"}
                          className="h-16 w-28 rounded-xl object-cover bg-slate-100 shadow-sm border border-slate-200/60"
                          loading="lazy"
                        />
                        <div className="min-w-[120px]">
                          <p className="text-sm font-bold text-slate-800 line-clamp-2 leading-tight">
                            {banner.title || "Untitled"}
                          </p>
                          <div className="mt-1.5 inline-flex items-center gap-1.5">
                            <span className={cn("h-1.5 w-1.5 rounded-full", banner.isEnabled !== false ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-300")} />
                            <span className={cn(
                              "text-[9px] font-black uppercase tracking-wider",
                              banner.isEnabled !== false ? "text-emerald-600" : "text-slate-500",
                            )}>
                              {banner.isEnabled !== false ? "Active" : "Hidden"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5 max-w-[220px]">
                        {(banner.headerCategories || []).map((cat) => (
                          <span key={cat.id} className="px-2.5 py-1 bg-white border border-slate-200 text-slate-600 rounded-lg text-[10px] font-bold shadow-sm">
                            {cat.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                        {(banner.zones || []).map((zone) => (
                          <span key={zone.id} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold">
                            {zone.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {banner.isDefault ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200/50 shadow-sm">
                          Default
                        </span>
                      ) : (
                        <span className="text-slate-300 font-bold text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={statusBadgeVariant(banner.status)} className="uppercase text-[9px] tracking-wider px-2 py-1 shadow-sm">
                        {banner.status || "expired"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                      {formatDisplayDate(banner.startAt)}
                    </td>
                    <td className="px-6 py-4 text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                      {formatDisplayDate(banner.endAt)}
                    </td>
                    <td className="px-6 py-4 text-[11px] font-semibold text-slate-400 whitespace-nowrap">
                      {formatDisplayDate(banner.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleToggleEnabled(banner)}
                            className={cn(
                              "p-2 rounded-xl transition-all shadow-sm hover:-translate-y-0.5",
                              banner.isEnabled !== false 
                                ? "bg-white text-slate-400 hover:text-amber-600 hover:bg-amber-50 border border-slate-200/60 hover:border-amber-200"
                                : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100"
                            )}
                            title={banner.isEnabled !== false ? "Disable" : "Enable"}
                          >
                            {banner.isEnabled !== false ? (
                              <HiOutlineEyeSlash className="h-4 w-4" />
                            ) : (
                              <HiOutlineEye className="h-4 w-4" />
                            )}
                          </button>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openEditModal(banner)}
                            className="p-2 rounded-xl bg-white border border-slate-200/60 text-slate-500 shadow-sm hover:text-blue-600 hover:bg-blue-50 transition-all hover:-translate-y-0.5 hover:border-blue-200"
                            title="Edit"
                          >
                            <HiOutlinePencilSquare className="h-4 w-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(banner)}
                            className="p-2 rounded-xl bg-white border border-slate-200/60 text-rose-400 shadow-sm hover:text-rose-600 hover:bg-rose-50 transition-all hover:-translate-y-0.5 hover:border-rose-200"
                            title="Delete"
                          >
                            <HiOutlineTrash className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSaving && setIsModalOpen(false)}
        title={editingBanner ? "Edit Banner" : "Add Banner"}
        size="lg"
      >
        <div className="space-y-6">
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 block">
              Banner Image
            </label>
            <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
              <div className="h-36 w-full sm:w-64 rounded-xl overflow-hidden bg-white border-2 border-dashed border-slate-200 flex items-center justify-center shadow-sm relative group transition-all hover:border-primary/50">
                {formData.imagePreview ? (
                  <img src={formData.imagePreview} alt="Preview" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400 group-hover:text-primary transition-colors">
                    <HiOutlinePhoto className="h-8 w-8" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">16:9 Recommended</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center pointer-events-none backdrop-blur-[2px]">
                   <HiOutlinePhoto className="h-8 w-8 text-white mb-1" />
                   <span className="text-[10px] font-bold uppercase tracking-wider text-white">Change Image</span>
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-[11px] font-black uppercase tracking-widest text-white hover:bg-slate-800 hover:-translate-y-0.5 shadow-lg active:translate-y-0 transition-all w-full sm:w-auto justify-center mt-2 sm:mt-0">
                Upload Image
                <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </label>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              className="mt-2 w-full rounded-xl bg-slate-100 border-none px-4 py-2.5 text-sm font-semibold outline-none ring-primary/5 focus:ring-2"
              placeholder="Optional banner title"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Start Date</label>
              <input
                type="datetime-local"
                value={formData.startAt}
                min={toDatetimeLocal(new Date())}
                onChange={(e) => {
                  const newStart = e.target.value;
                  setFormData((prev) => {
                    const updates = { startAt: newStart };
                    if (prev.endAt && new Date(newStart) > new Date(prev.endAt)) {
                      updates.endAt = newStart;
                    }
                    return { ...prev, ...updates };
                  });
                }}
                className="mt-2 w-full rounded-xl bg-slate-100 border-none px-4 py-2.5 text-sm font-semibold outline-none ring-primary/5 focus:ring-2"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">End Date</label>
              <input
                type="datetime-local"
                value={formData.endAt}
                min={formData.startAt || toDatetimeLocal(new Date())}
                onChange={(e) => setFormData((prev) => ({ ...prev, endAt: e.target.value }))}
                className="mt-2 w-full rounded-xl bg-slate-100 border-none px-4 py-2.5 text-sm font-semibold outline-none ring-primary/5 focus:ring-2"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Header Categories
            </label>
            <div className="mt-2 flex flex-wrap gap-2 max-h-40 overflow-y-auto rounded-xl bg-slate-50 p-3">
              {headerCategories.length === 0 ? (
                <p className="text-xs text-slate-500">No header categories found</p>
              ) : (
                headerCategories.map((cat) => {
                  const id = String(cat._id || cat.id);
                  const selected = formData.headerCategoryIds.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleHeaderCategory(id)}
                      className={cn(
                        "rounded-xl px-4 py-2.5 text-[11px] font-bold border-2 transition-all duration-200 shadow-sm hover:-translate-y-0.5 active:translate-y-0",
                        selected
                          ? "bg-primary/10 text-primary border-primary"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      {cat.name}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 block">
              Zone Selection
            </label>
            <div className="flex gap-2 bg-slate-100/70 p-1.5 rounded-2xl w-fit">
              {[
                { id: "global", label: "Global Zone" },
                { id: "specific", label: "Selected Zones" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      zoneMode: opt.id,
                      zoneIds: opt.id === "global" ? [] : prev.zoneIds,
                    }))
                  }
                  className={cn(
                    "rounded-xl px-5 py-2.5 text-[11px] font-black uppercase tracking-wider transition-all duration-300",
                    formData.zoneMode === opt.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {formData.zoneMode === "specific" && (
              <div className="mt-4 flex flex-wrap gap-2 max-h-48 overflow-y-auto rounded-2xl bg-slate-50 p-4 border border-slate-100 shadow-inner">
                {zones.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No zones found</p>
                ) : (
                  zones.map((zone) => {
                    const id = String(zone._id || zone.id);
                    const selected = formData.zoneIds.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleZone(id)}
                        className={cn(
                          "rounded-xl px-4 py-2.5 text-[11px] font-bold border-2 transition-all duration-200 shadow-sm hover:-translate-y-0.5 active:translate-y-0",
                          selected
                            ? "bg-primary/10 text-primary border-primary"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                        )}
                      >
                        {zone.zoneName || zone.name}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Default Banner
              </label>
              <select
                value={formData.isDefault ? "yes" : "no"}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, isDefault: e.target.value === "yes" }))
                }
                className="mt-2 w-full rounded-xl bg-slate-100 border-none px-4 py-2.5 text-sm font-semibold outline-none ring-primary/5 focus:ring-2"
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Enabled
              </label>
              <select
                value={formData.isEnabled ? "yes" : "no"}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, isEnabled: e.target.value === "yes" }))
                }
                className="mt-2 w-full rounded-xl bg-slate-100 border-none px-4 py-2.5 text-sm font-semibold outline-none ring-primary/5 focus:ring-2"
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => setIsModalOpen(false)}
              className="rounded-xl px-6 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="rounded-xl px-6 py-3 text-[11px] font-black uppercase tracking-widest text-white bg-gradient-to-r from-primary to-orange-500 hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {isSaving ? "Saving..." : editingBanner ? "Update Banner" : "Create Banner"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Banner"
        size="sm"
      >
        <div className="p-2">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete this banner? This action cannot be undone.
          </p>
          <div className="mt-8 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-xl px-6 py-2.5 text-[11px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-xl px-6 py-2.5 text-[11px] font-black uppercase tracking-widest bg-rose-600 text-white hover:bg-rose-700 hover:shadow-lg hover:shadow-rose-500/30 transition-all"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default BannerManagement;
