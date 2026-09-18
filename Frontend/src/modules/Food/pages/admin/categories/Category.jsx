import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import {
  BadgeCheck,
  Download,
  Eye,
  Globe,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { adminAPI, uploadAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import { toast } from "sonner"
import { useAuth } from "@core/context/AuthContext"
import useInfiniteList from "@food/hooks/useInfiniteList"
import AdminTable from "@/shared/components/admin/AdminTable"
import RefreshButton from "@/shared/components/ui/RefreshButton"
import FormField, { formInputClass } from "@/shared/components/admin/FormField"
import FormActions from "@/shared/components/admin/FormActions"
import { getCurrentUser } from "@food/utils/auth"
import { canPerformAdminPermissionAction, extractAdminPermissions, extractAdminRoleId, fetchAdminRolePermissions } from "@food/utils/adminPermissions"
import NameSuggestionField from "@food/components/NameSuggestionField"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

const defaultFormData = {
  name: "",
  image: "",
  status: true,
  type: "",
  zoneId: "global",
  foodTypeScope: "Both",
}

const approvalBadgeClass = (status) => {
  const value = String(status || "pending").toLowerCase()
  if (value === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (value === "rejected") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-amber-50 text-amber-700 border-amber-200"
}

const scopeBadgeClass = (scope) => {
  if (scope === "Veg") return "bg-green-50 text-green-700 border-green-200"
  if (scope === "Non-Veg") return "bg-red-50 text-red-700 border-red-200"
  return "bg-slate-100 text-slate-700 border-slate-200"
}

const zoneLabel = (zone) => {
  if (!zone) return "Global"
  if (typeof zone === "string") {
    const value = zone.trim()
    if (/^[a-f0-9]{24}$/i.test(value)) return `Zone ID ${value.slice(-6)}`
    return value
  }
  return zone?.name || zone?.zoneName || zone?.serviceLocation || "Zone"
}

const categoryFieldLabel = (field) => {
  if (field === "foodTypeScope") return "Diet type"
  if (field === "image") return "Image"
  if (field === "type") return "Category type"
  return String(field || "").charAt(0).toUpperCase() + String(field || "").slice(1)
}

const formatDateTime = (value) => {
  if (!value) return "—"
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

const DetailRow = ({ label, value, className = "" }) => (
  <div className={`rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-4 ${className}`}>
    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-medium text-slate-900 break-words">{value ?? "—"}</p>
  </div>
)

const CategoryChangesPanel = ({ category }) => {
  const changedFields = Array.isArray(category?.changedFields) ? category.changedFields : []
  if (!changedFields.length) return null

  return (
    <div className="mt-3 w-full max-w-full rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
        {category?.isResubmission ? "Restaurant resubmitted with updates" : "Pending changes"}
      </p>
      <p className="mt-1 text-xs text-amber-700">
        Review what the restaurant changed before approving.
      </p>
      <ul className="mt-3 space-y-3">
        {changedFields.map(({ field, before, after }) => (
          <li key={field} className="rounded-lg border border-amber-200/80 bg-white/80 p-3">
            <p className="text-xs font-semibold text-slate-700">{categoryFieldLabel(field)}</p>
            {field === "image" ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="text-center">
                  <img src={before || "https://via.placeholder.com/64"} alt="Before" className="h-14 w-14 rounded-lg border border-slate-200 object-cover" />
                  <p className="mt-1 text-[10px] text-slate-500">Before</p>
                </div>
                <span className="text-slate-400">→</span>
                <div className="text-center">
                  <img src={after || "https://via.placeholder.com/64"} alt="After" className="h-14 w-14 rounded-lg border border-amber-300 object-cover" />
                  <p className="mt-1 text-[10px] font-semibold text-amber-800">After</p>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-1 text-sm sm:flex-row sm:flex-wrap sm:items-center">
                <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600 line-through">{before || "(empty)"}</span>
                <span className="hidden text-slate-400 sm:inline">→</span>
                <span className="rounded-md bg-amber-100 px-2 py-1 font-semibold text-amber-900">{after || "(empty)"}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

const CategoryViewDetails = ({ category }) => {
  if (!category) return null

  const approvalStatus = category?.approvalStatus || "pending"
  const creatorName = category?.createdByRestaurant?.name || category?.restaurant?.name || "Admin"
  const isRestaurantCategory = Boolean(category?.createdByRestaurantId || category?.restaurantId)
  const zoneText = zoneLabel(category?.zoneId)
  const changedFields = Array.isArray(category?.changedFields) ? category.changedFields : []
  const previousApproved = category?.previousApproved || null

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="mx-auto h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:mx-0">
          {category?.image ? (
            <img src={category.image} alt={category.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-slate-500">
              {String(category?.name || "C").slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h3 className="text-xl font-bold text-slate-900">{category?.name || "—"}</h3>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${approvalBadgeClass(approvalStatus)}`}>
              {approvalStatus === "approved" && <BadgeCheck className="mr-1 h-3.5 w-3.5" />}
              {approvalStatus.charAt(0).toUpperCase() + approvalStatus.slice(1)}
            </span>
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${scopeBadgeClass(category?.foodTypeScope)}`}>
              {category?.foodTypeScope || "Both"}
            </span>
            {category?.isGlobal && (
              <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                <Globe className="mr-1 h-3.5 w-3.5" />
                Global
              </span>
            )}
          </div>
          {category?.isNewSubmission && (
            <p className="mt-2 text-sm text-amber-700">New restaurant category awaiting first approval.</p>
          )}
          {category?.isResubmission && (
            <p className="mt-2 text-sm text-sky-700">Restaurant edited and resubmitted this category for approval.</p>
          )}
        </div>
      </div>

      {changedFields.length > 0 ? (
        <CategoryChangesPanel category={category} />
      ) : isRestaurantCategory && approvalStatus === "pending" ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Submitted details</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailRow label="Category name" value={category?.name} />
            <DetailRow label="Category type" value={category?.type || "—"} />
            <DetailRow label="Diet type" value={category?.foodTypeScope || "Both"} />
            <DetailRow label="Zone" value={zoneText} />
          </div>
        </div>
      ) : null}

      {previousApproved && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Previous version</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailRow label="Name" value={previousApproved?.name || "—"} />
            <DetailRow label="Type" value={previousApproved?.type || "—"} />
            <DetailRow label="Diet type" value={previousApproved?.foodTypeScope || "—"} />
            {previousApproved?.image ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Image</p>
                <img src={previousApproved.image} alt="Previous" className="mt-2 h-16 w-16 rounded-lg border border-slate-200 object-cover" />
              </div>
            ) : (
              <DetailRow label="Image" value="No image" />
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DetailRow label="Owner" value={creatorName} />
        <DetailRow label="Zone" value={zoneText} />
        <DetailRow label="Category type" value={category?.type || "—"} />
        <DetailRow label="Diet scope" value={category?.foodTypeScope || "Both"} />
        <DetailRow label="Items linked" value={String(category?.itemCount ?? 0)} />
        <DetailRow label="Visibility" value={category?.isGlobal ? "Global" : isRestaurantCategory ? "Restaurant private" : "Admin"} />
        <DetailRow label="Active status" value={category?.status !== false ? "Active" : "Inactive"} />
        <DetailRow label="Category ID" value={String(category?.id || category?._id || "—")} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DetailRow label="Requested at" value={formatDateTime(category?.requestedAt)} />
        <DetailRow label="Approved at" value={formatDateTime(category?.approvedAt)} />
        <DetailRow label="Rejected at" value={formatDateTime(category?.rejectedAt)} />
        <DetailRow label="Last updated" value={formatDateTime(category?.updatedAt)} />
        <DetailRow label="Created at" value={formatDateTime(category?.createdAt)} />
      </div>

      {category?.rejectionReason && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-rose-700">Rejection reason</p>
          <p className="mt-2 text-sm leading-6 text-rose-800 whitespace-pre-wrap">{category.rejectionReason}</p>
        </div>
      )}
    </div>
  )
}

export default function Category() {
  const { user: authUser } = useAuth()
  const currentUser = useMemo(() => authUser || getCurrentUser("admin"), [authUser])
  const [resolvedPermissions, setResolvedPermissions] = useState({})

  useEffect(() => {
    let isMounted = true

    const resolvePermissions = async () => {
      if (!currentUser || currentUser.role === "ADMIN") {
        if (isMounted) setResolvedPermissions({})
        return
      }

      const existingPermissions = extractAdminPermissions(currentUser)
      if (Object.keys(existingPermissions).length > 0) {
        if (isMounted) setResolvedPermissions(existingPermissions)
        return
      }

      const roleId = extractAdminRoleId(currentUser)
      if (!roleId) {
        if (isMounted) setResolvedPermissions({})
        return
      }

      try {
        const rolePermissions = await fetchAdminRolePermissions(roleId)
        if (isMounted) setResolvedPermissions(rolePermissions)
      } catch {
        if (isMounted) setResolvedPermissions({})
      }
    }

    resolvePermissions()

    return () => {
      isMounted = false
    }
  }, [currentUser])

  const canCreate = useMemo(() => {
    return canPerformAdminPermissionAction(currentUser, resolvedPermissions, "food::food_management::categories::list", "create")
  }, [currentUser, resolvedPermissions])

  const canEdit = useMemo(() => {
    return canPerformAdminPermissionAction(currentUser, resolvedPermissions, "food::food_management::categories::list", "edit")
  }, [currentUser, resolvedPermissions])

  const canDelete = useMemo(() => {
    return canPerformAdminPermissionAction(currentUser, resolvedPermissions, "food::food_management::categories::list", "delete")
  }, [currentUser, resolvedPermissions])

  const [searchQuery, setSearchQuery] = useState("")
  const [showPendingOnly, setShowPendingOnly] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [zones, setZones] = useState([])
  const [zonesLoading, setZonesLoading] = useState(false)
  const [formData, setFormData] = useState(defaultFormData)
  const [selectedImageFile, setSelectedImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isNameDuplicate, setIsNameDuplicate] = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState("")
  const [isRejecting, setIsRejecting] = useState(false)
  const [viewCategory, setViewCategory] = useState(null)
  const fileInputRef = useRef(null)

  const categoryQueryFilters = useMemo(
    () => (showPendingOnly ? { approvalStatus: "pending" } : {}),
    [showPendingOnly],
  )

  const {
    items: categories,
    total: totalCategories,
    hasMore,
    loading,
    loadingMore,
    loadMore,
    search: cachedSearchQuery,
    setSearch: setCachedSearchQuery,
    refresh: refreshCategories,
  } = useInfiniteList(
    async (params, config) => {
      const response = await adminAPI.getCategories(params, config)
      const data = response?.data?.data || response?.data
      const list = data?.categories || data?.data?.categories || data?.categories || []
      return {
        items: Array.isArray(list) ? list : [],
        total: data?.total || data?.pagination?.total || list.length || 0,
      }
    },
    {
      pageSize: 20,
      filters: categoryQueryFilters,
      cacheKey: "admin-categories",
    },
  )

  useEffect(() => {
    setSearchQuery(cachedSearchQuery)
  }, [cachedSearchQuery])

  useEffect(() => {
    const adminToken = localStorage.getItem("admin_accessToken")
    if (!adminToken) {
      toast.error("Please login to access categories")
      return
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setZonesLoading(true)
    adminAPI
      .getZones({ limit: 1000 })
      .then((res) => {
        const list =
          res?.data?.data?.zones ||
          res?.data?.data?.data?.zones ||
          res?.data?.data ||
          []
        if (!cancelled) setZones(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setZones([])
      })
      .finally(() => {
        if (!cancelled) setZonesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const filteredCategories = useMemo(() => {
    return categories
  }, [categories])

  const fetchCategories = async () => {
    refreshCategories()
  }

  const resetModal = () => {
    setIsModalOpen(false)
    setEditingCategory(null)
    setFormData(defaultFormData)
    setSelectedImageFile(null)
    setImagePreview(null)
    setIsNameDuplicate(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleAddNew = () => {
    if (!canCreate) {
      toast.error("Permission denied")
      return
    }
    setEditingCategory(null)
    setFormData(defaultFormData)
    setSelectedImageFile(null)
    setImagePreview(null)
    setIsModalOpen(true)
  }

  const handleEdit = (category) => {
    if (!canEdit) {
      toast.error("Permission denied")
      return
    }
    setEditingCategory(category)
    const zoneIdValue =
      typeof category?.zoneId === "string"
        ? category.zoneId
        : category?.zoneId?._id || category?.zoneId?.id || "global"

    setFormData({
      name: category?.name || "",
      image: category?.image || "",
      status: category?.status !== false,
      type: category?.type || "",
      zoneId: zoneIdValue || "global",
      foodTypeScope: category?.foodTypeScope || "Both",
    })
    setSelectedImageFile(null)
    setImagePreview(category?.image || null)
    setIsModalOpen(true)
  }

  const handleImageSelect = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size exceeds 5MB limit.")
      return
    }

    setSelectedImageFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const handleToggleStatus = async (id) => {
    if (!canEdit) {
      toast.error("Permission denied")
      return
    }
    try {
      const response = await adminAPI.toggleCategoryStatus(String(id))
      if (response?.data?.success) {
        toast.success("Category status updated successfully")
        fetchCategories()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update category status")
    }
  }

  const handleApprove = async (id) => {
    if (!canEdit) {
      toast.error("Permission denied")
      return
    }
    try {
      const response = await adminAPI.approveCategory(String(id))
      if (response?.data?.success) {
        toast.success("Category approved successfully")
        fetchCategories()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to approve category")
    }
  }

  const resetRejectModal = () => {
    setRejectTarget(null)
    setRejectReason("")
    setIsRejecting(false)
  }

  const openRejectModal = (category) => {
    if (!canEdit) {
      toast.error("Permission denied")
      return
    }
    setRejectTarget(category)
    setRejectReason("")
  }

  const handleReject = async (event) => {
    event?.preventDefault?.()
    if (!rejectTarget) return
    const reason = String(rejectReason || "").trim()
    if (!reason) {
      toast.error("Rejection reason is required")
      return
    }

    try {
      setIsRejecting(true)
      const response = await adminAPI.rejectCategory(
        String(rejectTarget?.id || rejectTarget?._id),
        reason,
      )
      if (response?.data?.success) {
        toast.success("Category rejected successfully")
        resetRejectModal()
        fetchCategories()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to reject category")
    } finally {
      setIsRejecting(false)
    }
  }

  const handleMakeGlobal = async (category) => {
    if (!canEdit) {
      toast.error("Permission denied")
      return
    }
    if (!window.confirm(`Make "${category?.name}" global for every restaurant?`)) return

    try {
      const response = await adminAPI.makeCategoryGlobal(String(category?.id || category?._id))
      if (response?.data?.success) {
        toast.success("Category is now global")
        fetchCategories()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to make category global")
    }
  }

  const handleDelete = async (id) => {
    if (!canDelete) {
      toast.error("Permission denied")
      return
    }
    const category = categories.find((c) => String(c?.id || c?._id) === String(id))
    const categoryName = category?.name || "this category"
    const itemCount = Number(category?.itemCount || 0)

    const confirmMessage = itemCount > 0
      ? `Delete "${categoryName}"? This category has ${itemCount} menu item(s) across one or more restaurants. Deleting it will immediately hide those items from customers and set them to inactive. This action cannot be undone.`
      : `Delete "${categoryName}"? This action cannot be undone.`
    if (!window.confirm(confirmMessage)) return

    try {
      const response = await adminAPI.deleteCategory(String(id))
      if (response?.data?.success) {
        toast.success(response?.data?.message || "Category deleted successfully")
        fetchCategories()
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete category")
    }
  }

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF()
      doc.setFontSize(18)
      doc.setTextColor(30, 30, 30)
      doc.text("Category List", 14, 20)
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(`Generated on: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, 14, 28)

      const tableData = filteredCategories.map((category, index) => [
        index + 1,
        category?.name || "N/A",
        category?.foodTypeScope || "Both",
        category?.isGlobal ? "Global" : "Private",
        zoneLabel(category?.zoneId),
        category?.approvalStatus || "pending",
      ])

      autoTable(doc, {
        startY: 35,
        head: [["SL", "Category", "Diet Scope", "Visibility", "Zone", "Approval"]],
        body: tableData,
        theme: "striped",
        headStyles: {
          fillColor: [59, 130, 246],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 10,
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [30, 30, 30],
        },
      })

      doc.save(`Categories_${new Date().toISOString().split("T")[0]}.pdf`)
      toast.success("PDF exported successfully!")
    } catch {
      toast.error("Failed to export PDF")
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (editingCategory && !canEdit) {
      toast.error("Permission denied")
      return
    }
    if (!editingCategory && !canCreate) {
      toast.error("Permission denied")
      return
    }
    if (isNameDuplicate) {
      toast.error("A category with this name already exists")
      return
    }

    try {
      setIsSubmitting(true)
      let imageUrl = String(formData.image || "").trim()

      if (selectedImageFile) {
        const uploadRes = await uploadAPI.uploadMedia(selectedImageFile, { folder: "appzeto/categories" })
        const payload = uploadRes?.data?.data || uploadRes?.data
        imageUrl = payload?.url || imageUrl
      }

      const payload = {
        name: String(formData.name || "").trim(),
        type: String(formData.type || "").trim(),
        status: Boolean(formData.status),
        image: imageUrl || undefined,
        zoneId: formData.zoneId || "global",
        foodTypeScope: formData.foodTypeScope,
      }

      if (editingCategory) {
        const response = await adminAPI.updateCategory(editingCategory.id, payload)
        if (response?.data?.success) toast.success("Category updated successfully")
      } else {
        const response = await adminAPI.createCategory(payload)
        if (response?.data?.success) toast.success("Category created successfully")
      }

      resetModal()
      fetchCategories()
    } catch (error) {
      if (error?.code === "ERR_NETWORK" || error?.message === "Network Error") {
        toast.error("Cannot connect to server. Please check if backend is running on " + API_BASE_URL.replace("/api", ""))
      } else {
        toast.error(error?.response?.data?.message || "Failed to save category")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Categories</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Restaurant-created categories now move through approval, rejection, and optional globalization before every
              restaurant can use them.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 p-1">
              <button
                type="button"
                onClick={() => setShowPendingOnly(false)}
                className={`rounded-full px-3 py-2 text-xs font-semibold ${!showPendingOnly ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setShowPendingOnly(true)}
                className={`rounded-full px-3 py-2 text-xs font-semibold ${showPendingOnly ? "bg-amber-600 text-white" : "text-slate-600"}`}
              >
                Pending
              </button>
            </div>

            <div className="relative min-w-[220px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search categories"
                value={searchQuery}
                onChange={(event) => setCachedSearchQuery(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <RefreshButton onClick={fetchCategories} loading={loading} />

            <button
              onClick={handleExportPDF}
              disabled={filteredCategories.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>

            {canCreate && (
              <button
                onClick={handleAddNew}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white"
              >
                <Plus className="h-4 w-4" />
                Add Category
              </button>
            )}
          </div>
        </div>
        {!loading && totalCategories > 0 && (
          <div className="border-t border-slate-200 px-5 py-3">
            <p className="text-sm text-slate-500">
              Loaded <span className="font-semibold text-slate-800">{filteredCategories.length}</span>
              {" "}of <span className="font-semibold text-slate-800">{totalCategories}</span> categories
            </p>
          </div>
        )}
      </div>

      <AdminTable
        loading={loading}
        skeletonRows={6}
        data={filteredCategories}
        getRowId={(category) => category.id}
        columns={[
          {
            key: "category",
            header: "Category",
            width: "25%",
            cell: (category) => (
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 overflow-hidden rounded-2xl bg-slate-100">
                  {category?.image ? (
                    <img src={category.image} alt={category.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">
                      {String(category?.name || "C").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold leading-6 text-slate-900">{category?.name || "-"}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{category?.type || "No type"}</span>
                    <span className="text-slate-300">•</span>
                    <span>Items linked: {category?.itemCount || 0}</span>
                  </div>
                  {category?.isNewSubmission && (
                    <span className="mt-2 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                      New — awaiting approval
                    </span>
                  )}
                  {category?.isResubmission && (
                    <span className="mt-2 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700">
                      Resubmitted
                    </span>
                  )}
                </div>
              </div>
            ),
          },
          {
            key: "owner",
            header: "Owner",
            width: "17%",
            cell: (category) => {
              const creatorName = category?.createdByRestaurant?.name || category?.restaurant?.name || "Admin"
              return (
                <div className="space-y-1">
                  <p className="font-medium leading-6 text-slate-800">{creatorName}</p>
                  <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${category?.isGlobal ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-purple-50 text-purple-700 border-purple-200"}`}>
                    {category?.isGlobal ? (
                      <>
                        <Globe className="mr-1 h-3 w-3" /> Global
                      </>
                    ) : "Self"}
                  </span>
                </div>
              )
            },
          },
          {
            key: "zone",
            header: "Zone",
            width: "15%",
            cell: (category) => {
              const zoneText = zoneLabel(category?.zoneId)
              return (
                <p className="max-w-[180px] truncate text-sm font-medium text-slate-700" title={zoneText}>
                  {zoneText}
                </p>
              )
            },
          },
          {
            key: "diet",
            header: "Diet",
            align: "center",
            width: "10%",
            cell: (category) => (
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${scopeBadgeClass(category?.foodTypeScope)}`}>
                {category?.foodTypeScope || "Both"}
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            align: "center",
            width: "10%",
            cell: (category) => (
              <button
                onClick={() => handleToggleStatus(category.id)}
                disabled={!canEdit}
                className={`relative inline-flex h-6 w-11 items-center rounded-full ${category?.status ? "bg-blue-600" : "bg-slate-300"} ${!canEdit ? "opacity-50 cursor-not-allowed" : ""}`}
                title={category?.status ? "Deactivate" : "Activate"}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${category?.status ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            ),
          },
          {
            key: "approval",
            header: "Approval",
            width: "13%",
            cell: (category) => {
              const approvalStatus = category?.approvalStatus || "pending"
              return (
                <div className="space-y-2">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${approvalBadgeClass(approvalStatus)}`}>
                    {approvalStatus === "approved" && <BadgeCheck className="mr-1 h-3.5 w-3.5" />}
                    {approvalStatus.charAt(0).toUpperCase() + approvalStatus.slice(1)}
                  </span>
                  {category?.rejectionReason && approvalStatus === "rejected" && (
                    <p className="max-w-[220px] text-xs leading-5 text-rose-600">
                      Last rejection: {category.rejectionReason}
                    </p>
                  )}
                </div>
              )
            },
          },
          {
            key: "actions",
            header: "Actions",
            align: "right",
            width: "20%",
            cell: (category) => {
              const approvalStatus = category?.approvalStatus || "pending"
              const isRestaurantCategory = Boolean(category?.createdByRestaurantId || category?.restaurantId)
              return (
                <div className="flex flex-col items-end gap-2">
                  <div className="flex flex-wrap justify-end gap-2">
                    {canEdit && approvalStatus !== "approved" && (
                      <button
                        onClick={() => handleApprove(category.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                      >
                        Approve
                      </button>
                    )}
                    {canEdit && isRestaurantCategory && approvalStatus === "pending" && (
                      <button
                        onClick={() => openRejectModal(category)}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                      >
                        Reject
                      </button>
                    )}
                    {canEdit && isRestaurantCategory && !category?.isGlobal && approvalStatus === "approved" && (
                      <button
                        onClick={() => handleMakeGlobal(category)}
                        className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                      >
                        Make Global
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setViewCategory(category)}
                      className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {canEdit && (
                      <button
                        onClick={() => handleEdit(category)}
                        className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(category._id || category.id)}
                        className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              )
            },
          },
        ]}
        emptyState={{
          title: "No categories found",
          description: "Try a different search or create a new category.",
        }}
        infiniteScroll={{ onLoadMore: loadMore, hasMore, loadingMore, total: totalCategories }}
        renderMobileCard={(category) => {
          const creatorName = category?.createdByRestaurant?.name || category?.restaurant?.name || "Admin"
          const approvalStatus = category?.approvalStatus || "pending"
          const isRestaurantCategory = Boolean(category?.createdByRestaurantId || category?.restaurantId)
          const zoneText = zoneLabel(category?.zoneId)
          return (
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {category?.image ? (
                    <img src={category.image} alt={category.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">
                      {String(category?.name || "C").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{category?.name || "-"}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{creatorName} • {zoneText}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${scopeBadgeClass(category?.foodTypeScope)}`}>
                      {category?.foodTypeScope || "Both"}
                    </span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${approvalBadgeClass(approvalStatus)}`}>
                      {approvalStatus.charAt(0).toUpperCase() + approvalStatus.slice(1)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleStatus(category.id)}
                  disabled={!canEdit}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ${category?.status ? "bg-blue-600" : "bg-slate-300"} ${!canEdit ? "opacity-50" : ""}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${category?.status ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-2">
                {canEdit && approvalStatus !== "approved" && (
                  <button onClick={() => handleApprove(category.id)} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">Approve</button>
                )}
                {canEdit && isRestaurantCategory && approvalStatus === "pending" && (
                  <button onClick={() => openRejectModal(category)} className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white">Reject</button>
                )}
                <button onClick={() => setViewCategory(category)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"><Eye className="h-4 w-4" /></button>
                {canEdit && (
                  <button onClick={() => handleEdit(category)} className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"><Pencil className="h-4 w-4" /></button>
                )}
                {canDelete && (
                  <button onClick={() => handleDelete(category._id || category.id)} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            </div>
          )
        }}
      />

      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isModalOpen && (
              <div className="fixed inset-0 z-[200]">
                <div className="absolute inset-0 bg-black/50" onClick={resetModal} />
                <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl max-h-[min(720px,calc(100vh-32px))]"
                  >
                    <div className="flex items-center justify-between border-b px-6 py-4">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">{editingCategory ? "Edit Category" : "Add Category"}</h2>
                        <p className="text-xs text-slate-500">
                          Admin categories are approved immediately. Restaurant-created categories can also be updated here.
                        </p>
                      </div>
                      <button onClick={resetModal} className="rounded-lg p-1 hover:bg-slate-100">
                        <X className="h-5 w-5 text-slate-500" />
                      </button>
                    </div>

                    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                        <FormField label="Zone" htmlFor="category-zone">
                          <select
                            id="category-zone"
                            value={formData.zoneId}
                            onChange={(event) => setFormData((prev) => ({ ...prev, zoneId: event.target.value }))}
                            className={formInputClass}
                          >
                            <option value="global">Global (all zones)</option>
                            {zonesLoading && <option value="" disabled>Loading zones...</option>}
                            {zones.map((zone) => {
                              const id = String(zone?._id || zone?.id || "")
                              const label = zone?.name || zone?.zoneName || zone?.serviceLocation || id
                              return (
                                <option key={id} value={id}>
                                  {label}
                                </option>
                              )
                            })}
                          </select>
                        </FormField>

                        <FormField label="Diet Scope" htmlFor="category-diet-scope">
                          <select
                            id="category-diet-scope"
                            value={formData.foodTypeScope}
                            onChange={(event) => setFormData((prev) => ({ ...prev, foodTypeScope: event.target.value }))}
                            className={formInputClass}
                          >
                            <option value="Veg">Veg</option>
                            <option value="Non-Veg">Non-Veg</option>
                            <option value="Both">Both</option>
                          </select>
                        </FormField>

                        <FormField label="Category Type" htmlFor="category-type">
                          <input
                            id="category-type"
                            type="text"
                            value={formData.type}
                            onChange={(event) => setFormData((prev) => ({ ...prev, type: event.target.value }))}
                            className={formInputClass}
                            placeholder="Examples: Starters, Desserts, Drinks"
                          />
                        </FormField>

                        <FormField label="Category Name" htmlFor="category-name" required>
                          <NameSuggestionField
                            required
                            value={formData.name}
                            onChange={(value) => setFormData((prev) => ({ ...prev, name: value }))}
                            items={categories}
                            excludeId={editingCategory?.id}
                            entityLabel="category"
                            placeholder="Enter category name"
                            inputClassName={formInputClass}
                            onDuplicateChange={setIsNameDuplicate}
                          />
                        </FormField>

                        <FormField label="Category Image">
                          <div className="space-y-3">
                            {(imagePreview || formData.image) && (
                              <div className="relative h-32 w-32 overflow-hidden rounded-2xl border border-slate-300">
                                <img
                                  src={imagePreview || formData.image}
                                  alt="Category preview"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            )}
                            <div className="flex items-center gap-3">
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                onChange={handleImageSelect}
                                className="hidden"
                                id="category-image-upload"
                              />
                              <label
                                htmlFor="category-image-upload"
                                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700"
                              >
                                <Upload className="h-4 w-4" />
                                {imagePreview ? "Change Image" : "Upload Image"}
                              </label>
                            </div>
                          </div>
                        </FormField>

                        <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={formData.status}
                            onChange={(event) => setFormData((prev) => ({ ...prev, status: event.target.checked }))}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Active Status
                        </label>
                      </div>

                      <FormActions
                        onCancel={resetModal}
                        submitting={isSubmitting}
                        submitDisabled={isNameDuplicate}
                        submitLabel={editingCategory ? "Update" : "Create"}
                        className="border-t bg-white px-6 py-4"
                      />
                    </form>
                  </motion.div>
                </div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {viewCategory && (
              <div className="fixed inset-0 z-[205]">
                <div className="absolute inset-0 bg-black/50" onClick={() => setViewCategory(null)} />
                <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl max-h-[min(90vh,calc(100vh-32px))]"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Category Details</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Full submission details and restaurant updates
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewCategory(null)}
                        className="shrink-0 rounded-lg p-1.5 hover:bg-slate-100"
                        aria-label="Close"
                      >
                        <X className="h-5 w-5 text-slate-500" />
                      </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                      <CategoryViewDetails category={viewCategory} />
                    </div>

                    <div className="flex flex-col-reverse gap-3 border-t bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                      <button
                        type="button"
                        onClick={() => setViewCategory(null)}
                        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 sm:w-auto"
                      >
                        Close
                      </button>
                      {canEdit && String(viewCategory?.approvalStatus || "") === "pending" && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const id = viewCategory?.id || viewCategory?._id
                              setViewCategory(null)
                              openRejectModal(viewCategory)
                            }}
                            className="w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white sm:w-auto"
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const id = viewCategory?.id || viewCategory?._id
                              setViewCategory(null)
                              handleApprove(id)
                            }}
                            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white sm:w-auto"
                          >
                            Approve
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>
                </div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {rejectTarget && (
              <div className="fixed inset-0 z-[210]">
                <div className="absolute inset-0 bg-black/50" onClick={resetRejectModal} />
                <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl max-h-[min(90vh,calc(100vh-32px))]"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="border-b px-5 py-4 sm:px-6">
                      <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Reject Category</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Tell the restaurant why <span className="font-semibold text-slate-800">{rejectTarget?.name}</span> was rejected.
                      </p>
                    </div>

                    <form onSubmit={handleReject} className="flex min-h-0 flex-1 flex-col">
                      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          Rejection reason <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          value={rejectReason}
                          onChange={(event) => setRejectReason(event.target.value)}
                          rows={5}
                          required
                          autoFocus
                          placeholder="Explain what needs to be fixed before approval..."
                          className="w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                        />
                        {Array.isArray(rejectTarget?.changedFields) && rejectTarget.changedFields.length > 0 && (
                          <div className="mt-4">
                            <CategoryChangesPanel category={rejectTarget} />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col-reverse gap-3 border-t bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                        <button
                          type="button"
                          onClick={resetRejectModal}
                          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 sm:w-auto"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isRejecting || !rejectReason.trim()}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                        >
                          {isRejecting && <Loader2 className="h-4 w-4 animate-spin" />}
                          Reject Category
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}
