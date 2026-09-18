import { useState, useMemo, useEffect, useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { Search, Trash2, Loader2, Eye, Pencil, Plus, ChevronDown } from "lucide-react"
import { adminAPI, uploadAPI } from "@food/api"
import useInfiniteList from "@food/hooks/useInfiniteList"
import AdminTable from "@/shared/components/admin/AdminTable"
import RefreshButton from "@/shared/components/ui/RefreshButton"
import FormSection from "@/shared/components/admin/FormSection"
import FormField, { formInputClass } from "@/shared/components/admin/FormField"
import FormActions from "@/shared/components/admin/FormActions"
import { toast } from "sonner"
import { useAuth } from "@core/context/AuthContext"
import { getCurrentUser } from "@food/utils/auth"
import { canPerformAdminPermissionAction, extractAdminPermissions, extractAdminRoleId, fetchAdminRolePermissions } from "@food/utils/adminPermissions"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@food/components/ui/popover"
import { getFoodDisplayPrice, getFoodVariants } from "@food/utils/foodVariants"
import ApprovalAuditCard from "@food/components/admin/ApprovalAuditCard"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const createFoodForm = () => ({
  restaurantId: "",
  categoryId: "",
  categoryName: "",
  name: "",
  price: "",
  variants: [],
  description: "",
  image: "",
  foodType: "Non-Veg",
  isAvailable: true,
  preparationTime: "",
  minOrderQuantity: "",
  maxOrderQuantity: "",
})

const createVariantDraft = (variant = {}) => ({
  id: String(variant?.id || variant?._id || `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
  name: String(variant?.name || ""),
  price: variant?.price != null ? String(variant.price) : "",
})

export default function FoodsList() {
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
    return canPerformAdminPermissionAction(currentUser, resolvedPermissions, "food::food_management::foods::list", "create")
  }, [currentUser, resolvedPermissions])

  const canEdit = useMemo(() => {
    return canPerformAdminPermissionAction(currentUser, resolvedPermissions, "food::food_management::foods::list", "edit")
  }, [currentUser, resolvedPermissions])

  const canDelete = useMemo(() => {
    return canPerformAdminPermissionAction(currentUser, resolvedPermissions, "food::food_management::foods::list", "delete")
  }, [currentUser, resolvedPermissions])

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedRestaurant, setSelectedRestaurant] = useState("all")
  const [restaurantsForFilter, setRestaurantsForFilter] = useState([])
  const [deleting, setDeleting] = useState(false)
  const [selectedFood, setSelectedFood] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showFoodFormModal, setShowFoodFormModal] = useState(false)
  const [foodFormMode, setFoodFormMode] = useState("add")
  const [foodForm, setFoodForm] = useState(() => createFoodForm())
  const [editingFood, setEditingFood] = useState(null)
  const [submittingFood, setSubmittingFood] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState([])
  const [categorySearch, setCategorySearch] = useState("")
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false)
  const [selectedImageFile, setSelectedImageFile] = useState(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState("")
  const [imageVersion, setImageVersion] = useState(() => Date.now())

  const getItemCreatedMs = (item = {}) => {
    const direct = [item.createdAt, item.addedAt, item.requestedAt, item.updatedAt]
      .map((v) => new Date(v).getTime())
      .find((ms) => Number.isFinite(ms) && ms > 0)
    if (direct) return direct

    const rawId = String(item.id || "")
    const match = rawId.match(/\d{10,}/)
    if (match) {
      const fromId = Number(match[0])
      if (Number.isFinite(fromId) && fromId > 0) return fromId
    }
    return 0
  }

  const toArray = (value) => (Array.isArray(value) ? value : [])
  const withImageVersion = (url) => {
    if (!url || typeof url !== "string") return "https://via.placeholder.com/40"
    return `${url}${url.includes("?") ? "&" : "?"}v=${imageVersion}`
  }

  const fetchRestaurantOptions = useCallback(async () => {
    try {
      const [activeRestaurantsResponse, inactiveRestaurantsResponse] = await Promise.all([
        adminAPI.getRestaurants({ limit: 1000 }),
        adminAPI.getRestaurants({ limit: 1000, status: "inactive" }),
      ])

      const activeRestaurants = activeRestaurantsResponse?.data?.data?.restaurants ||
        activeRestaurantsResponse?.data?.restaurants ||
        []
      const inactiveRestaurants = inactiveRestaurantsResponse?.data?.data?.restaurants ||
        inactiveRestaurantsResponse?.data?.restaurants ||
        []

      const restaurantsMap = new Map()
      ;[...activeRestaurants, ...inactiveRestaurants].forEach((restaurant) => {
        const restaurantId = String(restaurant?._id || restaurant?.id || "")
        if (!restaurantId) return
        if (!restaurantsMap.has(restaurantId)) {
          restaurantsMap.set(restaurantId, restaurant)
        }
      })
      const restaurants = Array.from(restaurantsMap.values())
      setRestaurantsForFilter(
        restaurants
          .map((restaurant) => ({
            id: String(restaurant?._id || restaurant?.id || ""),
            name: restaurant?.name || restaurant?.restaurantName || "Unknown Restaurant",
          }))
          .filter((restaurant) => restaurant.id)
          .sort((a, b) => a.name.localeCompare(b.name))
      )

      setImageVersion(Date.now())
    } catch (error) {
      debugError("Error fetching restaurants for food filter:", error)
      setRestaurantsForFilter([])
    }
  }, [])

  useEffect(() => {
    fetchRestaurantOptions()
  }, [fetchRestaurantOptions])

  const foodQueryFilters = useMemo(() => ({
    approvalStatus: "approved",
    ...(selectedRestaurant !== "all" && { restaurantId: selectedRestaurant }),
  }), [selectedRestaurant])

  const {
    items: foods,
    setItems: setFoods,
    total: totalFoods,
    hasMore,
    loading,
    loadingMore,
    loadMore,
    search: cachedSearchQuery,
    setSearch: setCachedSearchQuery,
    refresh: refreshFoods,
  } = useInfiniteList(
    async (params, config) => {
      const foodsRes = await adminAPI.getFoods(params, config)
      const data = foodsRes?.data?.data || foodsRes?.data
      const list = data?.foods || []
      const mappedFoods = Array.isArray(list)
        ? list.map((f) => ({
            id: String(f.id || f._id || ""),
            _id: f._id || f.id,
            name: f.name || "Unnamed Item",
            image: f.image || "https://via.placeholder.com/40",
            status: f.isAvailable !== false && String(f.approvalStatus || "").toLowerCase() !== "rejected",
            restaurantId: String(f.restaurantId || ""),
            restaurantName: f.restaurantName || "Unknown Restaurant",
            categoryId: String(f.categoryId || ""),
            categoryName: f.categoryName || "",
            basePrice: f.price != null ? Number(f.price) : null,
            price: getFoodDisplayPrice(f),
            otherPrice: f.otherPrice || 0,
            variants: getFoodVariants(f),
            foodType: f.foodType || "Non-Veg",
            approvalStatus: f.approvalStatus || "approved",
            rejectionReason: f.rejectionReason || "",
            approvedAt: f.approvedAt || null,
            rejectedAt: f.rejectedAt || null,
            approvedBy: f.approvedBy || null,
            rejectedBy: f.rejectedBy || null,
            description: f.description || "",
            preparationTime: f.preparationTime || "",
            minOrderQuantity: Number(f.minOrderQuantity) > 0 ? Number(f.minOrderQuantity) : 1,
            maxOrderQuantity: Number(f.maxOrderQuantity) > 0 ? Number(f.maxOrderQuantity) : 0,
            isAvailable: f.isAvailable !== false,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
          }))
        : []
      return {
        items: mappedFoods,
        total: data?.total || data?.pagination?.total || mappedFoods.length,
      }
    },
    {
      pageSize: 20,
      filters: foodQueryFilters,
      cacheKey: "admin-foods",
    },
  )

  useEffect(() => {
    setSearchQuery(cachedSearchQuery)
  }, [cachedSearchQuery])

  const fetchAllFoods = useCallback(() => {
    refreshFoods()
    fetchRestaurantOptions()
  }, [fetchRestaurantOptions, refreshFoods])

  const [searchParams] = useSearchParams()
  const productIdFromUrl = searchParams.get("productId")

  useEffect(() => {
    if (productIdFromUrl && foods.length > 0) {
      const food = foods.find(f => f.id === productIdFromUrl || f._id === productIdFromUrl)
      if (food) {
        handleViewDetails(food)
      }
    }
  }, [productIdFromUrl, foods])

  // Format ID to FOOD format (e.g., FOOD519399)
  const formatFoodId = (id) => {
    if (!id) return "FOOD000000"
    
    const idString = String(id)
    // Extract last 6 digits from the ID
    // Handle formats like "1768285554154-0.703896654519399" or "item-1768285554154-0.703896654519399"
    const parts = idString.split(/[-.]/)
    let lastDigits = ""
    
    // Get the last part and extract digits
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1]
      // Extract only digits from the last part
      const digits = lastPart.match(/\d+/g)
      if (digits && digits.length > 0) {
        // Get last 6 digits from all digits found
        const allDigits = digits.join("")
        lastDigits = allDigits.slice(-6).padStart(6, "0")
      }
    }
    
    // If no digits found, use a hash of the ID
    if (!lastDigits) {
      const hash = idString.split("").reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0) | 0
      }, 0)
      lastDigits = Math.abs(hash).toString().slice(-6).padStart(6, "0")
    }
    
    return `FOOD${lastDigits}`
  }

  const filteredFoods = useMemo(() => {
    return [...foods].sort((a, b) => getItemCreatedMs(b) - getItemCreatedMs(a))
  }, [foods])

  const restaurantOptions = useMemo(() => {
    return restaurantsForFilter
  }, [restaurantsForFilter])

  const openAddFoodModal = () => {
    if (!canCreate) {
      toast.error("Permission denied")
      return
    }
    setFoodFormMode("add")
    setEditingFood(null)
    setFoodForm({
      ...createFoodForm(),
      restaurantId: selectedRestaurant !== "all" ? selectedRestaurant : "",
    })
    setSelectedImageFile(null)
    setImagePreviewUrl("")
    setCategorySearch("")
    setCategoryPopoverOpen(false)
    setShowFoodFormModal(true)
  }

  const openEditFoodModal = (food) => {
    if (!canEdit) {
      toast.error("Permission denied")
      return
    }
    setFoodFormMode("edit")
    setEditingFood(food)
    setFoodForm({
      restaurantId: String(food.restaurantId || ""),
      categoryId: String(food.categoryId || ""),
      categoryName: String(food.categoryName || ""),
      name: String(food.name || ""),
      price: String(food.basePrice ?? food.price ?? ""),
      variants: getFoodVariants(food).map(createVariantDraft),
      description: String(food.description || ""),
      image: String(food.image || ""),
      foodType: String(food.foodType || "Non-Veg"),
      isAvailable: food.isAvailable !== false,
      preparationTime: String(food.preparationTime || ""),
      minOrderQuantity: Number(food.minOrderQuantity) > 1 ? String(food.minOrderQuantity) : "",
      maxOrderQuantity: Number(food.maxOrderQuantity) > 0 ? String(food.maxOrderQuantity) : "",
    })
    setSelectedImageFile(null)
    setImagePreviewUrl(String(food.image || ""))
    setCategorySearch("")
    setCategoryPopoverOpen(false)
    setShowFoodFormModal(true)
  }

  useEffect(() => {
    if (!showFoodFormModal) {
      setCategoryOptions([])
      return
    }

    let cancelled = false

    const loadCategoryOptions = async () => {
      try {
        const res = await adminAPI.getCategories({ limit: 1000 })
        const list = res?.data?.data?.categories || []
        const options = Array.isArray(list)
          ? list
              .map((c) => ({ id: String(c.id || c._id || c.name), name: String(c.name || "").trim() }))
              .filter((c) => c.name)
          : []
        if (!cancelled) setCategoryOptions(options)
      } catch (error) {
        if (!cancelled) {
          setCategoryOptions([])
        }
      }
    }

    loadCategoryOptions()

    return () => {
      cancelled = true
    }
  }, [showFoodFormModal])

  const handleVariantChange = (variantId, field, value) => {
    setFoodForm((prev) => ({
      ...prev,
      variants: (Array.isArray(prev.variants) ? prev.variants : []).map((variant) =>
        variant.id === variantId ? { ...variant, [field]: value } : variant,
      ),
    }))
  }

  const handleAddVariant = () => {
    setFoodForm((prev) => ({
      ...prev,
      variants: [...(Array.isArray(prev.variants) ? prev.variants : []), createVariantDraft()],
    }))
  }

  const handleRemoveVariant = (variantId) => {
    setFoodForm((prev) => ({
      ...prev,
      variants: (Array.isArray(prev.variants) ? prev.variants : []).filter((variant) => variant.id !== variantId),
    }))
  }

  const handleFoodFormSubmit = async () => {
    if (foodFormMode === "edit" && !canEdit) {
      toast.error("Permission denied")
      return
    }
    if (foodFormMode === "add" && !canCreate) {
      toast.error("Permission denied")
      return
    }
    if (!foodForm.restaurantId) {
      toast.error("Please select a restaurant")
      return
    }
    if (!String(foodForm.categoryName || "").trim()) {
      toast.error("Please select or enter a category")
      return
    }
    if (!foodForm.name.trim()) {
      toast.error("Food name is required")
      return
    }

    const normalizedVariants = (Array.isArray(foodForm.variants) ? foodForm.variants : [])
      .map((variant) => ({
        id: String(variant?.id || variant?._id || "").trim(),
        name: String(variant?.name || "").trim(),
        price: Number(variant?.price),
      }))
      .filter((variant) => variant.id || variant.name || variant.price)

    const hasVariants = normalizedVariants.length > 0
    const parsedPrice = Number(foodForm.price)

    if (normalizedVariants.some((variant) => !variant.name)) {
      toast.error("Each variant must have a name")
      return
    }

    if (normalizedVariants.some((variant) => !Number.isFinite(variant.price) || variant.price <= 0)) {
      toast.error("Each variant price must be greater than 0")
      return
    }

    if (!hasVariants && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
      toast.error("Base price must be greater than 0")
      return
    }

    // Order quantity limits: blank min = 1, blank max = no cap.
    const parsedMinQty = foodForm.minOrderQuantity === "" ? 1 : Number(foodForm.minOrderQuantity)
    const parsedMaxQty = foodForm.maxOrderQuantity === "" ? 0 : Number(foodForm.maxOrderQuantity)
    if (!Number.isInteger(parsedMinQty) || parsedMinQty < 1 || parsedMinQty > 99) {
      toast.error("Minimum order quantity must be a whole number between 1 and 99")
      return
    }
    if (!Number.isInteger(parsedMaxQty) || parsedMaxQty < 0 || parsedMaxQty > 99) {
      toast.error("Maximum order quantity must be a whole number between 0 and 99")
      return
    }
    if (parsedMaxQty > 0 && parsedMaxQty < parsedMinQty) {
      toast.error("Maximum order quantity cannot be less than the minimum")
      return
    }

    try {
      setSubmittingFood(true)
      let imageUrl = foodForm.image.trim()

      if (selectedImageFile) {
        const uploadResponse = await uploadAPI.uploadMedia(selectedImageFile, {
          folder: "foods",
        })
        imageUrl =
          uploadResponse?.data?.data?.url ||
          uploadResponse?.data?.url ||
          imageUrl
      }

      const payload = {
        restaurantId: foodForm.restaurantId,
        categoryId: foodForm.categoryId || undefined,
        categoryName: String(foodForm.categoryName || "").trim(),
        name: foodForm.name.trim(),
        price: parsedPrice,
        otherPrice: 0,
        variants: normalizedVariants.map((variant) => ({
          ...(variant.id && !variant.id.startsWith("variant-") ? { _id: variant.id } : {}),
          name: variant.name,
          price: variant.price,
          otherPrice: 0,
        })),
        description: foodForm.description.trim(),
        image: imageUrl,
        foodType: foodForm.foodType === "Veg" ? "Veg" : "Non-Veg",
        isAvailable: foodForm.isAvailable !== false,
        preparationTime: String(foodForm.preparationTime || "").trim(),
        minOrderQuantity: parsedMinQty,
        maxOrderQuantity: parsedMaxQty,
      }

      if (foodFormMode === "edit") {
        await adminAPI.updateFood(editingFood?._id || editingFood?.id, payload)
      } else {
        await adminAPI.createFood(payload)
      }
      toast.success(foodFormMode === "edit" ? "Food updated successfully" : "Food added successfully")
      setShowFoodFormModal(false)
      setEditingFood(null)
      setFoodForm(createFoodForm())
      setSelectedImageFile(null)
      setImagePreviewUrl("")
      await fetchAllFoods()
    } catch (error) {
      debugError("Error saving food:", error)
      toast.error(error?.response?.data?.message || "Failed to save food")
    } finally {
      setSubmittingFood(false)
    }
  }

  const handleDelete = async (id) => {
    if (!canDelete) {
      toast.error("Permission denied")
      return
    }
    const food = foods.find(f => f.id === id)
    if (!food) return

    if (!window.confirm(`Are you sure you want to delete "${food.name}"? This action cannot be undone.`)) {
      return
    }

    try {
      setDeleting(true)
      await adminAPI.deleteFood(food?._id || food?.id)
      setFoods((prev) => prev.filter((f) => String(f.id) !== String(id)))
      toast.success("Food item deleted successfully")
    } catch (error) {
      debugError("Error deleting food:", error)
      toast.error(error?.response?.data?.message || "Failed to delete food item")
    } finally {
      setDeleting(false)
    }
  }

  const handleViewDetails = (food) => {
    setSelectedFood(food)
    setShowDetailModal(true)
  }

  const handleToggleAvailability = async (id, currentStatus) => {
    if (!canEdit) {
      toast.error("Permission denied")
      return
    }
    try {
      await adminAPI.updateFood(id, { isAvailable: !currentStatus })
      setFoods((prev) => prev.map((f) => (String(f.id || f._id) === String(id) ? { ...f, isAvailable: !currentStatus } : f)))
      toast.success("Food availability updated")
    } catch (error) {
      debugError("Error updating availability:", error)
      toast.error(error?.response?.data?.message || "Failed to update availability")
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Food</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Food List</h2>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {totalFoods}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {canCreate && (
              <button
                type="button"
                onClick={openAddFoodModal}
                className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Food</span>
              </button>
            )}
            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <input
                type="text"
                placeholder="Ex : Foods"
                value={searchQuery}
                onChange={(e) => setCachedSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
            <select
              value={selectedRestaurant}
              onChange={(e) => setSelectedRestaurant(e.target.value)}
              className="px-4 py-2.5 min-w-[220px] text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            >
              <option value="all">All Restaurants</option>
              {restaurantOptions.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
            <RefreshButton onClick={fetchAllFoods} loading={loading} />
          </div>
        </div>
        {!loading && totalFoods > 0 && (
          <div className="mt-4 border-t border-slate-200 pt-3">
            <p className="text-sm text-slate-500">
              Loaded <span className="font-semibold text-slate-800">{filteredFoods.length}</span>
              {" "}of <span className="font-semibold text-slate-800">{totalFoods}</span> foods
            </p>
          </div>
        )}
      </div>

      {/* Table */}
      <AdminTable
        loading={loading}
        skeletonRows={6}
        data={filteredFoods}
        getRowId={(food) => food.id}
        columns={[
          {
            key: "sl",
            header: "SL",
            width: "6%",
            cell: (food, index) => (
              <span className="text-sm font-medium text-slate-700">{index + 1}</span>
            ),
          },
          {
            key: "image",
            header: "Image",
            width: "10%",
            cell: (food) => (
              <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
                <img
                  src={withImageVersion(food.image)}
                  alt={food.name}
                  className="w-full h-full object-cover"
                  key={`${food.id}-${imageVersion}`}
                  loading="lazy"
                  onError={(e) => {
                    e.target.src = "https://via.placeholder.com/40"
                  }}
                />
              </div>
            ),
          },
          {
            key: "title",
            header: "Title",
            width: "22%",
            cell: (food) => (
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-900">{food.name}</span>
              </div>
            ),
          },
          {
            key: "restaurant",
            header: "Restaurant",
            width: "20%",
            cell: (food) => (
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-800">{food.restaurantName || "-"}</span>
              </div>
            ),
          },
          {
            key: "category",
            header: "Category",
            width: "16%",
            cell: (food) => (
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-800">{food.categoryName || "-"}</span>
              </div>
            ),
          },
          {
            key: "status",
            header: "Status",
            align: "center",
            width: "12%",
            cell: (food) => (
              <div className="flex items-center justify-center">
                <label className="relative inline-flex items-center cursor-pointer" title="Toggle active status">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={food.isAvailable !== false}
                    onChange={() => handleToggleAvailability(food.id, food.isAvailable !== false)}
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#FF6A00]"></div>
                </label>
              </div>
            ),
          },
          {
            key: "actions",
            header: "Action",
            align: "center",
            width: "14%",
            cell: (food) => (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => handleViewDetails(food)}
                  className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                  title="View"
                >
                  <Eye className="w-4 h-4" />
                </button>
                {canEdit && (
                  <button
                    onClick={() => openEditFoodModal(food)}
                    className="p-1.5 rounded text-amber-600 hover:bg-amber-50 transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => handleDelete(food.id)}
                    disabled={deleting}
                    className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete"
                  >
                    {deleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            ),
          },
        ]}
        emptyState={{
          title: "No Data Found",
          description: "No food items match your search or restaurant filter",
        }}
        infiniteScroll={{ onLoadMore: loadMore, hasMore, loadingMore, total: totalFoods }}
        renderMobileCard={(food) => (
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                <img
                  src={withImageVersion(food.image)}
                  alt={food.name}
                  className="h-full w-full object-cover"
                  key={`${food.id}-${imageVersion}-m`}
                  loading="lazy"
                  onError={(e) => {
                    e.target.src = "https://via.placeholder.com/40"
                  }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{food.name || "-"}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{food.restaurantName || "-"} • {food.categoryName || "-"}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                    {food.foodType || "Non-Veg"}
                  </span>
                </div>
              </div>
              <label className="relative inline-flex h-6 w-11 shrink-0 items-center cursor-pointer" title="Toggle active status">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={food.isAvailable !== false}
                  onChange={() => handleToggleAvailability(food.id, food.isAvailable !== false)}
                />
                <div className="absolute inset-0 rounded-full bg-gray-200 peer-checked:bg-[#FF6A00] transition-colors" />
                <span className="relative inline-block h-4 w-4 translate-x-1 transform rounded-full bg-white transition-transform peer-checked:translate-x-6" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-2">
              <button onClick={() => handleViewDetails(food)} className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"><Eye className="h-4 w-4" /></button>
              {canEdit && (
                <button onClick={() => openEditFoodModal(food)} className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50"><Pencil className="h-4 w-4" /></button>
              )}
              {canDelete && (
                <button onClick={() => handleDelete(food.id)} disabled={deleting} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50">
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>
        )}
      />

      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-lg font-semibold text-slate-900">Food Details</DialogTitle>
          </DialogHeader>
          {selectedFood && (
            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center gap-4">
                <img
                          src={withImageVersion(selectedFood.image)}
                          alt={selectedFood.name}
                          className="w-20 h-20 rounded-xl object-cover border border-slate-200"
                  onError={(e) => {
                    e.target.src = "https://via.placeholder.com/64"
                  }}
                />
                <div>
                  <p className="text-lg font-semibold text-slate-900">{selectedFood.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">ID #{formatFoodId(selectedFood.id)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p><span className="font-semibold text-slate-700">Restaurant:</span> <span className="text-slate-900">{selectedFood.restaurantName || "-"}</span></p>
                <div className="flex flex-col">
                  <p>
                    <span className="font-semibold text-slate-700">Price:</span>{" "}
                    <span className="text-slate-900">
                      {selectedFood.variants?.length ? `Starting from \u20B9${selectedFood.price}` : `\u20B9${selectedFood.price}`}
                    </span>
                  </p>
                  {selectedFood.otherPrice > 0 && (
                    <p className="mt-1">
                      <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                        Other: ₹{selectedFood.otherPrice}
                      </span>
                    </p>
                  )}
                </div>
                <p><span className="font-semibold text-slate-700">Category:</span> <span className="text-slate-900">{selectedFood.categoryName || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Food Type:</span> <span className="text-slate-900">{selectedFood.foodType || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Approval:</span> <span className="text-slate-900 capitalize">{selectedFood.approvalStatus || "-"}</span></p>
              </div>
              {selectedFood.variants?.length ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Variants</p>
                  <div className="space-y-3">
                    {selectedFood.variants.map((variant) => (
                      <div key={variant.id || variant._id} className="flex items-center justify-between text-sm text-slate-700 border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                        <span>{variant.name}</span>
                        <div className="text-right flex flex-col items-end gap-1">
                          <span className="font-semibold text-slate-900">{"\u20B9"}{variant.price}</span>
                          {variant.otherPrice > 0 && (
                            <span className="text-[9px] font-medium text-gray-500 bg-gray-100 px-1 py-0.5 rounded border border-gray-200">
                              Other: ₹{variant.otherPrice}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedFood.description && (
                <p className="text-sm text-slate-700 leading-relaxed">
                  <span className="font-semibold text-slate-800">Description:</span> {selectedFood.description}
                </p>
              )}
              <ApprovalAuditCard
                approvedBy={selectedFood.approvedBy}
                rejectedBy={selectedFood.rejectedBy}
                rejectionReason={selectedFood.rejectionReason}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showFoodFormModal}
        onOpenChange={(open) => {
          setShowFoodFormModal(open)
          if (!open) {
            setEditingFood(null)
            setFoodForm(createFoodForm())
            setCategoryOptions([])
            setCategorySearch("")
            setCategoryPopoverOpen(false)
            setSelectedImageFile(null)
            setImagePreviewUrl("")
          }
        }}
      >
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-lg font-semibold text-slate-900">
              {foodFormMode === "edit" ? "Edit Food" : "Add Food"}
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
            <FormSection title="Item Details">
              <FormField label="Restaurant" htmlFor="food-restaurant">
                <select
                  id="food-restaurant"
                  value={foodForm.restaurantId}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, restaurantId: e.target.value, categoryId: "", categoryName: "" }))}
                  disabled={foodFormMode === "edit"}
                  className={formInputClass}
                >
                  <option value="">Select restaurant</option>
                  {restaurantOptions.map((restaurant) => (
                    <option key={restaurant.id} value={restaurant.id}>
                      {restaurant.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Category">
                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={`${formInputClass} text-left flex items-center justify-between`}
                    >
                      <span className={foodForm.categoryName ? "text-slate-900" : "text-slate-400"}>
                        {foodForm.categoryName || "Select category"}
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
                    <input
                      type="text"
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white mb-2"
                      placeholder="Search category..."
                      autoFocus
                    />
                    <div className="max-h-56 overflow-y-auto">
                      {categoryOptions
                        .filter((c) => {
                          const q = String(categorySearch || "").trim().toLowerCase()
                          if (!q) return true
                          return String(c.name || "").toLowerCase().includes(q)
                        })
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setFoodForm((prev) => ({ ...prev, categoryId: c.id, categoryName: c.name }))
                              setCategoryPopoverOpen(false)
                            }}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-slate-100 ${
                              String(foodForm.categoryName || "") === String(c.name) ? "bg-slate-100 font-medium" : ""
                            }`}
                          >
                            {c.name}
                          </button>
                        ))}
                      {categoryOptions.length === 0 && (
                        <div className="px-3 py-2 text-sm text-slate-500">No categories found</div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </FormField>
              <FormField label="Food Name" htmlFor="food-name">
                <input
                  id="food-name"
                  type="text"
                  value={foodForm.name}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, name: e.target.value }))}
                  className={formInputClass}
                />
              </FormField>
              <FormField label="Base Price">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={foodForm.price}
                    onChange={(e) => setFoodForm((prev) => ({ ...prev, price: e.target.value }))}
                    placeholder="Price"
                    className={formInputClass}
                  />
                </div>
              </FormField>
              <FormField label="Food Type" htmlFor="food-type">
                <select
                  id="food-type"
                  value={foodForm.foodType}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, foodType: e.target.value }))}
                  className={formInputClass}
                >
                  <option value="Veg">Veg</option>
                  <option value="Non-Veg">Non-Veg</option>
                </select>
              </FormField>
              <FormField label="Timing" htmlFor="food-timing">
                <div className="relative">
                  <select
                    id="food-timing"
                    value={foodForm.preparationTime}
                    onChange={(e) => setFoodForm((prev) => ({ ...prev, preparationTime: e.target.value }))}
                    className={`${formInputClass} pr-10 appearance-none`}
                  >
                    <option value="">Select timing</option>
                    <option value="10-20 mins">10-20 mins</option>
                    <option value="20-25 mins">20-25 mins</option>
                    <option value="25-35 mins">25-35 mins</option>
                    <option value="35-45 mins">35-45 mins</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </FormField>
              <FormField label="Min Order Qty" htmlFor="food-min-qty">
                <input
                  id="food-min-qty"
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  value={foodForm.minOrderQuantity}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, minOrderQuantity: e.target.value }))}
                  placeholder="1"
                  className={formInputClass}
                />
              </FormField>
              <FormField label="Max Order Qty" htmlFor="food-max-qty">
                <input
                  id="food-max-qty"
                  type="number"
                  min="0"
                  max="99"
                  step="1"
                  value={foodForm.maxOrderQuantity}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, maxOrderQuantity: e.target.value }))}
                  placeholder="No limit"
                  className={formInputClass}
                />
              </FormField>
              <FormField label="Upload Image" htmlFor="food-image" span="full">
                <input
                  id="food-image"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    setSelectedImageFile(file)
                    if (file) {
                      setImagePreviewUrl(URL.createObjectURL(file))
                    } else {
                      setImagePreviewUrl(foodForm.image.trim())
                    }
                  }}
                  className={`${formInputClass} file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm`}
                />
              </FormField>
              {imagePreviewUrl ? (
                <FormField label="Image Preview" span="full">
                  <div className="w-28 h-28 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                    <img
                      src={imagePreviewUrl}
                      alt="Food preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </FormField>
              ) : null}
              <FormField span="full">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={foodForm.isAvailable}
                    onChange={(e) => setFoodForm((prev) => ({ ...prev, isAvailable: e.target.checked }))}
                  />
                  Available
                </label>
              </FormField>
            </FormSection>

            <FormSection title="Description">
              <FormField label="Description" htmlFor="food-description" span="full">
                <textarea
                  id="food-description"
                  rows={4}
                  value={foodForm.description}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, description: e.target.value }))}
                  className={`${formInputClass} resize-none`}
                />
              </FormField>
            </FormSection>

            <FormSection
              title="Variants"
              description="Optional. Add multiple names and prices such as Half, Full, Small, or Large."
              actions={
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add variant
                </button>
              }
            >
              {(foodForm.variants || []).length ? (
                <div className="md:col-span-2 space-y-3">
                  {(foodForm.variants || []).map((variant, index) => (
                    <div key={variant.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-slate-200 bg-white p-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <FormField label="Variant name" className="text-xs">
                          <input
                            type="text"
                            value={variant.name}
                            onChange={(e) => handleVariantChange(variant.id, "name", e.target.value)}
                            placeholder={index === 0 ? "Full" : "Half"}
                            className={formInputClass}
                          />
                        </FormField>
                        <div className="grid grid-cols-1 gap-2">
                          <FormField label="Price">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={variant.price}
                              onChange={(e) => handleVariantChange(variant.id, "price", e.target.value)}
                              className={formInputClass}
                            />
                          </FormField>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(variant.id)}
                        className="self-start rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-500"
                        aria-label="Remove variant"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="md:col-span-2 text-sm text-slate-500">No variants added. This food will use the single base price.</p>
              )}
            </FormSection>

            <FormActions
              onCancel={() => {
                setShowFoodFormModal(false)
                setEditingFood(null)
                setFoodForm(createFoodForm())
                setCategoryOptions([])
                setCategorySearch("")
                setCategoryPopoverOpen(false)
                setSelectedImageFile(null)
                setImagePreviewUrl("")
              }}
              onSubmit={handleFoodFormSubmit}
              submitType="button"
              submitting={submittingFood}
              submitDisabled={foodFormMode === "edit" ? !canEdit : !canCreate}
              submitLabel={foodFormMode === "edit" ? "Update Food" : "Add Food"}
              sticky
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

