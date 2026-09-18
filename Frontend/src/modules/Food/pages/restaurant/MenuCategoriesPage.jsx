import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  BadgeCheck,
  Clock3,
  Edit2,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react"
import { restaurantAPI, uploadAPI } from "@food/api"
import { toast } from "sonner"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import { isFlutterBridgeAvailable } from "@food/utils/imageUploadUtils"
import { Modal, ModalFooter } from "@food/components/restaurant/Modal"
import RestaurantPageShell, { RESTAURANT_CARD_CLASS } from "@food/components/restaurant/RestaurantPageShell"
import NameSuggestionField from "@food/components/NameSuggestionField"
import useInfiniteList from "@food/hooks/useInfiniteList"
import InfiniteScrollSentinel from "@/shared/components/ui/InfiniteScrollSentinel"
import RefreshButton from "@/shared/components/ui/RefreshButton"

const defaultFormData = {
  name: "",
  type: "",
  image: "",
  isActive: true,
  sortOrder: 0,
  foodTypeScope: "Veg",
}

const approvalBadgeClass = (status) => {
  const value = String(status || "pending").toLowerCase()
  if (value === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (value === "rejected") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-amber-50 text-amber-700 border-amber-200"
}

const scopePillClass = (scope) => {
  if (scope === "Veg") return "bg-green-50 text-green-700 border-green-200"
  if (scope === "Non-Veg") return "bg-red-50 text-red-700 border-red-200"
  return "bg-slate-100 text-slate-700 border-slate-200"
}

export default function MenuCategoriesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const goBack = useRestaurantBackNavigation()
  const [showModal, setShowModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [formData, setFormData] = useState(defaultFormData)
  const [selectedImageFile, setSelectedImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [isPhotoPickerOpen, setIsPhotoPickerOpen] = useState(false)
  const [isNameDuplicate, setIsNameDuplicate] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    const draftCategoryName = String(location.state?.draftCategoryName || "").trim()
    if (!draftCategoryName) return
    setEditingCategory(null)
    setFormData((prev) => ({ ...prev, ...defaultFormData, name: draftCategoryName }))
    setSelectedImageFile(null)
    setImagePreview(null)
    setShowModal(true)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  const {
    items: categories,
    total,
    hasMore,
    loading,
    loadingMore,
    loadMore,
    refresh: fetchCategories,
  } = useInfiniteList(
    async (params, { signal }) => {
      const response = await restaurantAPI.getAllCategories(params, { signal })
      return {
        items: response?.data?.data?.categories || [],
        total: response?.data?.data?.total || 0,
      }
    },
    {
      pageSize: 20,
      cacheKey: "restaurant-menu-categories",
    }
  )

  const ownCategories = useMemo(
    () => categories.filter((category) => category.ownedByRestaurant),
    [categories],
  )

  const resetModal = () => {
    setShowModal(false)
    setEditingCategory(null)
    setFormData(defaultFormData)
    setSelectedImageFile(null)
    setImagePreview(null)
    setUploadingImage(false)
    setIsNameDuplicate(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const openCreateModal = () => {
    setEditingCategory(null)
    setFormData(defaultFormData)
    setSelectedImageFile(null)
    setImagePreview(null)
    setShowModal(true)
  }

  const openEditModal = (category) => {
    if (!category?.canEdit) {
      toast.error("Admin controls this category now")
      return
    }
    setEditingCategory(category)
    setFormData({
      name: category?.name || "",
      type: category?.type || "",
      image: category?.image || "",
      isActive: category?.isActive !== false,
      sortOrder: Number.isFinite(Number(category?.sortOrder)) ? Number(category.sortOrder) : 0,
      foodTypeScope: category?.foodTypeScope || "Veg",
    })
    setSelectedImageFile(null)
    setImagePreview(category?.image || null)
    setShowModal(true)
  }

  const handleImageFileChange = (file) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size exceeds 5MB limit.")
      return
    }
    setSelectedImageFile(file)
    try {
      setImagePreview(URL.createObjectURL(file))
    } catch {
      setImagePreview(null)
    }
  }

  const handleImageClick = () => {
    if (isFlutterBridgeAvailable()) {
      setIsPhotoPickerOpen(true)
    } else {
      fileInputRef.current?.click()
    }
  }

  const handleSaveCategory = async () => {
    if (!String(formData.name || "").trim()) {
      toast.error("Category name is required")
      return
    }
    if (isNameDuplicate) {
      toast.error("A category with this name already exists")
      return
    }

    try {
      setUploadingImage(true)
      let imageUrl = String(formData.image || "").trim()

      if (selectedImageFile) {
        const res = await uploadAPI.uploadMedia(selectedImageFile, { folder: "food/categories" })
        const url = res?.data?.data?.url || res?.data?.url
        if (url) imageUrl = String(url)
      }

      const payload = {
        name: String(formData.name || "").trim(),
        type: String(formData.type || "").trim(),
        image: imageUrl,
        isActive: formData.isActive !== false,
        sortOrder: Number.isFinite(Number(formData.sortOrder)) ? Number(formData.sortOrder) : 0,
        foodTypeScope: formData.foodTypeScope,
      }

      if (editingCategory) {
        await restaurantAPI.updateCategory(editingCategory._id || editingCategory.id, payload)
        toast.success("Category updated and sent for admin approval")
      } else {
        await restaurantAPI.createCategory(payload)
        toast.success("Category created and sent for admin approval")
      }

      resetModal()
      fetchCategories()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save category")
    } finally {
      setUploadingImage(false)
    }
  }

  const handleDeleteCategory = async (category) => {
    if (!category?.canDelete) {
      toast.error("Admin controls this category now, so you can use it but not delete it")
      return
    }
    const itemCount = Number(category?.itemCount || 0)
    const confirmMessage = itemCount > 0
      ? `Delete "${category.name}"? This category has ${itemCount} menu item(s). Deleting it will immediately hide those items from customers and set them to inactive. This action cannot be undone.`
      : `Delete "${category.name}"?`
    if (!window.confirm(confirmMessage)) return

    try {
      const response = await restaurantAPI.deleteCategory(category._id || category.id)
      toast.success(response?.data?.message || "Category deleted successfully")
      fetchCategories()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete category")
    }
  }

  const handleToggleActive = async (category) => {
    if (!category?.canEdit) {
      toast.error("Admin controls this category now")
      return
    }
    try {
      await restaurantAPI.updateCategory(category._id || category.id, {
        isActive: !(category?.isActive !== false),
      })
      toast.success(
        category?.isActive !== false
          ? "Category disabled"
          : "Category enabled and visible to customers"
      )
      fetchCategories()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update category")
    }
  }

  return (
    <RestaurantPageShell
      title="Menu Categories"
      subtitle="Create categories, track approvals, and resubmit edits safely."
      onBack={goBack}
      maxWidth="6xl"
      contentClassName="space-y-4"
    >
        <div className={`${RESTAURANT_CARD_CLASS} p-4`}>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">How this works</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            New categories stay pending until admin approval. Changing the name or image of an approved category sends it back for review.
            Only approved categories can be used for food uploads.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={openCreateModal}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#FF6A00] px-4 py-3 font-semibold text-white"
          >
            <Plus className="h-5 w-5" />
            Add Category
          </button>
          <RefreshButton
            onClick={fetchCategories}
            loading={loading}
            className="h-auto w-auto px-4 py-3 rounded-xl"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : ownCategories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-6 py-12 text-center">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">No restaurant categories yet</p>
            <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
              Start with a category and choose whether it should accept veg, non-veg, or both kinds of dishes.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {ownCategories.map((category) => {
              const status = category?.approvalStatus || "pending"
              const isEditable = category?.canEdit
              const isGlobal = category?.isGlobal

              return (
                <motion.div
                  key={category._id || category.id}
                  layout
                  className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#111] p-4"
                >
                  <div className="flex gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800">
                      {category?.image ? (
                        <img src={category.image} alt={category.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg font-bold text-gray-400 dark:text-gray-500">
                          {String(category?.name || "C").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{category.name}</h3>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${approvalBadgeClass(status)}`}>
                          {status === "approved" ? <BadgeCheck className="mr-1 h-3.5 w-3.5" /> : <Clock3 className="mr-1 h-3.5 w-3.5" />}
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${scopePillClass(category?.foodTypeScope)}`}>
                          {category?.foodTypeScope || "Both"}
                        </span>
                        {isGlobal && (
                          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                            <Globe className="mr-1 h-3.5 w-3.5" />
                            Global
                          </span>
                        )}
                      </div>

                      <div className="mt-2 space-y-1 text-sm text-gray-500 dark:text-gray-400">
                        <p>{category?.itemCount || 0} item(s) linked</p>
                        {isGlobal ? (
                          <p>Admin controls this category now, so you can use it but not rename or delete it.</p>
                        ) : status === "approved" ? (
                          <p>Changing name or image will send it back for admin approval.</p>
                        ) : (
                          <p>Foods can be added only after approval.</p>
                        )}
                        {status === "rejected" && category?.rejectionReason && (
                          <p className="text-rose-600">Reason: {category.rejectionReason}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => handleToggleActive(category)}
                      className="rounded-xl bg-gray-100 dark:bg-gray-800 p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      title={category?.isActive !== false ? "Deactivate" : "Activate"}
                    >
                      {category?.isActive !== false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => openEditModal(category)}
                      className="rounded-xl bg-[#FF6A00]/10 p-2 text-[#FF6A00] hover:bg-[#FF6A00]/20 transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(category)}
                      className="rounded-xl bg-red-50 dark:bg-red-900/20 p-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              )
            })}
            <InfiniteScrollSentinel
              onIntersect={loadMore}
              hasMore={hasMore}
              loading={loadingMore}
              total={total}
              loadedCount={ownCategories.length}
            />
          </div>
        )}


      <Modal
        open={showModal}
        onClose={resetModal}
        title={editingCategory ? "Edit Category" : "Create Category"}
        description={editingCategory
          ? "Changing name or image sends this category back for admin approval."
          : "Choose the diet scope carefully before sending it for approval."}
        icon={Plus}
        size="lg"
        footer={
          <ModalFooter>
            <button onClick={resetModal} className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 py-3 font-semibold text-gray-700 dark:text-gray-300">
              Cancel
            </button>
            <button
              onClick={handleSaveCategory}
              disabled={uploadingImage || isNameDuplicate}
              className="flex-1 rounded-xl bg-[#FF6A00] hover:bg-[#e05e00] py-3 font-semibold text-white disabled:opacity-60"
            >
              {uploadingImage ? "Uploading…" : editingCategory ? "Save & Resubmit" : "Create"}
            </button>
          </ModalFooter>
        }
      >
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Category Name</label>
                  <NameSuggestionField
                    value={formData.name}
                    onChange={(value) => setFormData((prev) => ({ ...prev, name: value }))}
                    items={categories}
                    excludeId={editingCategory?._id || editingCategory?.id}
                    entityLabel="category"
                    placeholder="Enter category name"
                    inputClassName="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00]/30"
                    onDuplicateChange={setIsNameDuplicate}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Diet Scope</label>
                  <select
                    value={formData.foodTypeScope}
                    onChange={(e) => setFormData((prev) => ({ ...prev, foodTypeScope: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none focus:border-[#FF6A00]"
                  >
                    <option value="Veg">Veg</option>
                    <option value="Non-Veg">Non-Veg</option>
                    <option value="Both">Both</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Optional Type Label</label>
                  <input
                    type="text"
                    value={formData.type}
                    onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value }))}
                    placeholder="Examples: Starters, Desserts, Drinks"
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-[#FF6A00]"
                  />
                </div>

                <div className="flex items-center gap-3">
                  {(imagePreview || formData.image) && (
                    <img
                      src={imagePreview || formData.image}
                      alt="Category preview"
                      className="h-16 w-16 rounded-2xl object-cover"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleImageClick}
                    className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Image
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => handleImageFileChange(e.target.files?.[0])}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={() => setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))}
                    className="accent-[#FF6A00]"
                  />
                  Keep category active
                </label>
              </div>
      </Modal>

      <ImageSourcePicker
        isOpen={isPhotoPickerOpen}
        onClose={() => setIsPhotoPickerOpen(false)}
        onFileSelect={handleImageFileChange}
        title="Category Image"
        description="Choose how to upload your category image"
        fileNamePrefix="category-photo"
        galleryInputRef={fileInputRef}
      />
    </RestaurantPageShell>
  )
}
