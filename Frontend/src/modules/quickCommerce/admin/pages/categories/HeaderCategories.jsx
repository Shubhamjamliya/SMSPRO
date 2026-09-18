import React, { useState, useEffect, useMemo } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Image,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { adminApi } from "../../services/adminApi";
import { toast } from "sonner";
import IconSelector from "@shared/components/IconSelector";
import Pagination from "@shared/components/ui/Pagination";
import { getIconSvg } from "@shared/constants/categoryIcons";
import { CATEGORY_ICON_COMPONENTS } from "@shared/constants/categoryIconComponents";
import { useAuth } from "@core/context/AuthContext";
import { getCurrentUser } from "@food/utils/auth";
import { canPerformAdminPermissionAction, extractAdminPermissions, extractAdminRoleId, fetchAdminRolePermissions } from "@food/utils/adminPermissions";
import { RETURN_WINDOW_DAY_PRESETS } from "@/shared/utils/returnWindow";

const HeaderCategories = () => {
  const { user: authUser } = useAuth();
  const currentUser = useMemo(() => authUser || getCurrentUser("admin"), [authUser]);
  const [resolvedPermissions, setResolvedPermissions] = useState({});

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

  const permissionKey = "quick::core_management::categories::header";
  const canCreate = canPerformAdminPermissionAction(currentUser, resolvedPermissions, permissionKey, "create");
  const canEdit = canPerformAdminPermissionAction(currentUser, resolvedPermissions, permissionKey, "edit");
  const canDelete = canPerformAdminPermissionAction(currentUser, resolvedPermissions, permissionKey, "delete");

  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isIconSelectorOpen, setIsIconSelectorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    status: "active",
    type: "header",
    parentId: null,
    iconId: "",
    adminCommission: 0,
    gst: 0,
    returnWindowDays: 3,
  });

  const iconComponents = CATEGORY_ICON_COMPONENTS;

  useEffect(() => {
    const timer = setTimeout(() => fetchCategories(1), 400);
    return () => clearTimeout(timer);
  }, [searchTerm, pageSize]);

  const fetchCategories = async (requestedPage = 1) => {
    setIsLoading(true);
    try {
      const params = { type: "header", page: requestedPage, limit: pageSize };
      if (searchTerm) params.search = searchTerm;
      const res = await adminApi.getCategories(params);
      if (res.data.success) {
        const payload = res.data.result || {};
        const list = Array.isArray(payload.items) ? payload.items : [];
        const allCats = res.data.results || [];
        const headers = list.length > 0 ? list : allCats.filter((c) => c.type === "header");
        setCategories(headers);
        setTotal(typeof payload.total === "number" ? payload.total : headers.length);
        setPage(typeof payload.page === "number" ? payload.page : requestedPage);
      }
    } catch (error) {
      toast.error("Failed to fetch header categories");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedItems(categories.map((c) => c._id || c.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelect = (id) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter((item) => item !== id));
    } else {
      setSelectedItems([...selectedItems, id]);
    }
  };

  const handleBulkDelete = () => {
    if (selectedItems.length === 0) return;
    // In a real app, you would have a bulk delete API endpoint
    // For now, we'll just show a toast
    toast.info(
      `Bulk delete functionality for ${selectedItems.length} items would be triggered here.`,
    );
    setSelectedItems([]);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.slug) {
      toast.error("Name and slug are required");
      return;
    }
    if (!String(formData.iconId || "").trim()) {
      toast.error("Icon selection is required");
      return;
    }
    const gst = Number(formData.gst);
    const commission = Number(formData.adminCommission);
    const returnWindowDays = Number(formData.returnWindowDays);
    if (!Number.isFinite(gst) || gst < 0 || gst > 100) {
      toast.error("GST must be between 0 and 100");
      return;
    }
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      toast.error("Commission must be between 0 and 100");
      return;
    }
    if (!Number.isFinite(returnWindowDays) || returnWindowDays < 0 || returnWindowDays > 30) {
      toast.error("Return window days must be between 0 and 30");
      return;
    }

    setIsSaving(true);
    try {
      const data = new FormData();
      data.append("type", "header");
      data.append("name", formData.name);
      data.append("slug", formData.slug);
      data.append("description", formData.description || "");
      data.append("status", formData.status || "active");
      data.append("iconId", formData.iconId);
      data.append("adminCommission", String(commission));
      data.append("gst", String(gst));
      data.append("returnWindowDays", String(returnWindowDays));

      if (editingItem) {
        const res = await adminApi.updateCategory(editingItem._id || editingItem.id, data);
        const productsUpdated = res?.data?.cascade?.productsUpdated || 0;
        toast.success(
          productsUpdated
            ? `Header updated, ${productsUpdated} products set ${formData.status}`
            : "Header category updated",
        );
      } else {
        await adminApi.createCategory(data);
        toast.success("Header category created");
      }
      setIsAddModalOpen(false);
      setEditingItem(null);
      fetchCategories(page);
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.message || (editingItem ? "Failed to update" : "Failed to create"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      const res = await adminApi.deleteCategory(deleteTarget._id || deleteTarget.id);
      const inactivated = res?.data?.result?.productsInactivated || 0;
      const deletedMains = res?.data?.result?.deletedMainCount || 0;
      toast.success(
        `Header deleted${deletedMains ? `, ${deletedMains} main categories removed` : ""}${
          inactivated ? `, ${inactivated} products inactivated` : ""
        }`,
      );
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      fetchCategories(page);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete category");
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({
      name: "",
      slug: "",
      description: "",
      status: "active",
      type: "header",
      parentId: null,
      iconId: "",
      adminCommission: 0,
      gst: 0,
      returnWindowDays: 3,
    });
    setIsAddModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      slug: item.slug,
      description: item.description || "",
      status: item.status,
      type: "header",
      parentId: null,
      iconId: item.iconId || "",
      adminCommission: item.adminCommission || 0,
      gst: Number(item.gst ?? item.gstRate ?? item.handlingFees ?? 0),
      returnWindowDays: Number(item.returnWindowDays ?? 3),
    });
    setIsAddModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Header Categories
          </h1>
          <p className="text-gray-500 mt-1">Manage top-level categories</p>
        </div>
        {canCreate && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
            <Plus className="w-5 h-5" />
            Add New Header
          </button>
        )}
      </div>

      <Card className="border-none shadow-sm">
        <div className="p-4 border-b border-gray-100 flex gap-4 items-center">
          {selectedItems.length > 0 && canDelete && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors text-sm font-medium">
              <Trash2 className="w-4 h-4" />
              Delete ({selectedItems.length})
            </button>
          )}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search header categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="w-12 py-3 px-4 text-left">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                    checked={
                      selectedItems.length > 0 &&
                      categories.length > 0 &&
                      selectedItems.length === categories.length
                    }
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Icon
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Slug
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  GST %
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Commission %
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Return Days
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan="9" className="text-center py-8 text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan="9" className="text-center py-8 text-gray-500">
                    No header categories found
                  </td>
                </tr>
              ) : (
                categories.map((cat) => (
                  <tr
                    key={cat._id || cat.id}
                    className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                        checked={selectedItems.includes(cat._id || cat.id)}
                        onChange={() => handleSelect(cat._id || cat.id)}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200">
                        {cat.iconId && iconComponents[cat.iconId] ? (
                          <div className="w-6 h-6 text-primary flex items-center justify-center">
                            {(() => {
                              const IconComp = iconComponents[cat.iconId];
                              return <IconComp fontSize="medium" />;
                            })()}
                          </div>
                        ) : cat.iconId && getIconSvg(cat.iconId) ? (
                          <div
                            className="w-6 h-6 text-primary"
                            dangerouslySetInnerHTML={{
                              __html: getIconSvg(cat.iconId),
                            }}
                          />
                        ) : (
                          <Image className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium text-gray-900">
                      {cat.name}
                    </td>
                    <td className="py-3 px-4 text-gray-500">{cat.slug}</td>
                    <td className="py-3 px-4 text-gray-700 text-sm font-semibold">
                      {Number(cat.gst ?? cat.gstRate ?? 0)}%
                    </td>
                    <td className="py-3 px-4 text-gray-700 text-sm font-semibold">
                      {Number(cat.adminCommission || 0)}%
                    </td>
                    <td className="py-3 px-4 text-gray-700 text-sm font-semibold">
                      {Number(cat.returnWindowDays ?? 3)} day{Number(cat.returnWindowDays ?? 3) === 1 ? "" : "s"}
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          cat.status === "active" ? "success" : "warning"
                        }>
                        {cat.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      {canEdit && (
                        <button
                          onClick={() => openEditModal(cat)}
                          className="p-1 text-gray-500 hover:text-primary transition-colors">
                          <Edit className="w-5 h-5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => {
                            setDeleteTarget(cat);
                            setIsDeleteModalOpen(true);
                          }}
                          className="p-1 text-gray-500 hover:text-primary transition-colors">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100">
          <Pagination
            page={page}
            totalPages={Math.ceil(total / pageSize) || 1}
            total={total}
            pageSize={pageSize}
            onPageChange={(p) => fetchCategories(p)}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            loading={isLoading}
          />
        </div>
      </Card>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center shrink-0">
                <h2 className="text-lg font-bold text-gray-900">
                  {editingItem ? "Edit Header Category" : "Add Header Category"}
                </h2>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div
                className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 overscroll-contain touch-pan-y"
                tabIndex={0}
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
              >
                {/* Icon Selection (required) */}
                <div className="flex flex-col items-center gap-3">
                  <div className="w-24 h-24 rounded-full bg-linear-to-br from-primary/5 to-primary/5 border-2 border-primary/20 flex items-center justify-center">
                    {formData.iconId && iconComponents[formData.iconId] ? (
                      <div className="w-12 h-12 text-primary flex items-center justify-center">
                        {(() => {
                          const IconComp = iconComponents[formData.iconId];
                          return <IconComp fontSize="large" />;
                        })()}
                      </div>
                    ) : formData.iconId && getIconSvg(formData.iconId) ? (
                      <div
                        className="w-12 h-12 text-primary"
                        dangerouslySetInnerHTML={{
                          __html: getIconSvg(formData.iconId),
                        }}
                      />
                    ) : (
                      <Sparkles className="w-10 h-10 text-primary/40" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsIconSelectorOpen(true)}
                    className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
                    {formData.iconId ? "Change Icon" : "Select Icon *"}
                  </button>
                  <p className="text-xs text-gray-500 text-center">
                    Icon selection is compulsory for header categories
                  </p>
                </div>

                {/* Header Color Picker Removed */}

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="e.g., Electronics"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Slug
                  </label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData({ ...formData, slug: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="e.g., electronics"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      GST (%) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={formData.gst}
                      onChange={(e) =>
                        setFormData({ ...formData, gst: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="e.g. 5"
                    />
                    <p className="text-[11px] text-gray-400">
                      Applied on products under this header
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Commission (%) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={formData.adminCommission}
                      onChange={(e) =>
                        setFormData({ ...formData, adminCommission: e.target.value })
                      }
                      disabled
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                      placeholder="0"
                    />
                    <p className="text-[11px] text-gray-400">
                      Applied on products under this header
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Return Window (Days) <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {RETURN_WINDOW_DAY_PRESETS.map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, returnWindowDays: days })
                        }
                        className={`rounded-xl border px-3 py-1.5 text-sm font-bold transition-colors ${
                          Number(formData.returnWindowDays) === days
                            ? "border-primary bg-primary text-white"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        {days}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Products under this header show this return window to customers.
                  </p>
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 shrink-0">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50 flex items-center gap-2">
                  {isSaving && (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {editingItem ? "Update Header" : "Create Header"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Icon Selector Modal */}
      <AnimatePresence>
        {isIconSelectorOpen && (
          <IconSelector
            selectedIcon={formData.iconId}
            onSelect={(iconId) => {
              setFormData({ ...formData, iconId });
              setIsIconSelectorOpen(false);
            }}
            onClose={() => setIsIconSelectorOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
              <div className="p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Delete Header Category?
                </h3>
                <p className="text-gray-500 text-sm mb-6">
                  Delete{" "}
                  <span className="font-semibold text-gray-900">
                    {deleteTarget?.name}
                  </span>
                  ? Its main categories will also be deleted, and linked products
                  will become inactive (hidden from users).
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HeaderCategories;
