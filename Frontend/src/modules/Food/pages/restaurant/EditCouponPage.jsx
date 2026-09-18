import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { AlertCircle, Loader2, Save, Truck } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Switch } from "@food/components/ui/switch"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { restaurantAPI } from "@food/api"
import { toast } from "sonner"

const defaultFormData = {
  couponName: "",
  couponCode: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  maxDiscount: "",
  minOrderAmount: "",
  startDate: "",
  endDate: "",
  usageLimit: "",
  perUserLimit: 1,
  applicableCategories: [],
  applicableItems: [],
  termsAndConditions: "",
  freeDelivery: false,
}

const PAGE_WRAP = "px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5 pb-8"
const PANEL_CARD =
  "rounded-2xl border border-white/80 dark:border-gray-800 bg-white dark:bg-[#111] p-4 sm:p-5 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.45)]"

const inputClass =
  "w-full h-11 px-4 border border-slate-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FF6A00]/30 focus:border-[#FF6A00] text-sm sm:text-base transition-colors bg-slate-50 dark:bg-[#1a1a1a] text-slate-900 dark:text-white focus:bg-white dark:focus:bg-[#111]"

const sectionClass = PANEL_CARD

const chipClass = (selected) =>
  `px-3 py-2 sm:py-1.5 rounded-full border text-sm font-medium transition-colors min-h-[40px] sm:min-h-0 ${
    selected
      ? "bg-[#FF6A00]/10 border-[#FF6A00] text-[#FF6A00]"
      : "bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
  }`

export default function EditCouponPage() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const { id } = useParams()
  const isNewCoupon = !id || id === "new"

  const [formData, setFormData] = useState(defaultFormData)
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])

  useEffect(() => {
    let isMounted = true
    const fetchSelectables = async () => {
      try {
        const [catRes, menuRes] = await Promise.all([
          restaurantAPI.getCategories(),
          restaurantAPI.getMenu()
        ])
        if (!isMounted) return

        const catList = catRes?.data?.data?.categories || []
        setCategories(catList.map(c => ({ id: c._id || c.id, name: c.name })))

        const menuData = menuRes?.data?.data?.menu || menuRes?.data?.menu || menuRes?.data?.data || []
        const items = Array.isArray(menuData?.sections)
          ? menuData.sections.flatMap(s => s.items || [])
          : []
        setMenuItems(items.map(i => ({ id: i._id || i.id, name: i.name })))
      } catch (err) {
        console.error("Failed to load selectables:", err)
      }
    }
    fetchSelectables()
    return () => { isMounted = false }
  }, [])

  const [couponData, setCouponData] = useState(null)
  const [isFetching, setIsFetching] = useState(!isNewCoupon)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isNewCoupon) return
    let isMounted = true
    const fetchCoupon = async () => {
      try {
        const res = await restaurantAPI.getCoupons()
        if (!isMounted) return
        const list = res?.data?.data || []
        const coupon = list.find(c => String(c._id) === String(id) || String(c.id) === String(id))
        setCouponData(coupon)
      } catch (err) {
        console.error(err)
      } finally {
        if (isMounted) setIsFetching(false)
      }
    }
    fetchCoupon()
    return () => { isMounted = false }
  }, [id, isNewCoupon])

  useEffect(() => {
    if (!isNewCoupon && couponData) {
      setFormData({
        couponName: couponData.couponName || "",
        couponCode: couponData.couponCode || "",
        description: couponData.description || "",
        discountType: couponData.discountType || "percentage",
        discountValue: couponData.discountValue || "",
        maxDiscount: couponData.maxDiscount || "",
        minOrderAmount: couponData.minOrderAmount || "",
        startDate: couponData.startDate ? new Date(couponData.startDate).toISOString().split("T")[0] : "",
        endDate: (couponData.endDate || couponData.expiryDate)
          ? new Date(couponData.endDate || couponData.expiryDate).toISOString().split("T")[0]
          : "",
        usageLimit: couponData.usageLimit || "",
        perUserLimit: couponData.perUserLimit || 1,
        applicableCategories: couponData.applicableCategories || [],
        applicableItems: couponData.applicableItems || [],
        termsAndConditions: couponData.termsAndConditions || "",
        freeDelivery: Boolean(couponData.freeDelivery),
      })
    }
  }, [isNewCoupon, couponData])

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleMultiSelect = (field, itemId) => {
    setFormData(prev => {
      const arr = prev[field]
      if (arr.includes(itemId)) {
        return { ...prev, [field]: arr.filter(i => i !== itemId) }
      }
      return { ...prev, [field]: [...arr, itemId] }
    })
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    if (!formData.couponName.trim()) return toast.error("Coupon name is required")
    if (!formData.couponCode.trim()) return toast.error("Coupon code is required")
    if (!formData.discountValue || Number(formData.discountValue) <= 0) return toast.error("Discount value must be greater than 0")
    if (!formData.startDate) return toast.error("Start date is required")
    if (!formData.endDate) return toast.error("End date is required")

    const payload = {
      couponName: formData.couponName.trim(),
      couponCode: formData.couponCode.trim().toUpperCase(),
      discountType: formData.discountType,
      discountValue: Number(formData.discountValue),
      maxDiscount: Number(formData.maxDiscount) || 0,
      minOrderAmount: Number(formData.minOrderAmount) || 0,
      startDate: new Date(formData.startDate).toISOString(),
      endDate: new Date(formData.endDate).toISOString(),
      usageLimit: formData.usageLimit ? Number(formData.usageLimit) : null,
      perUserLimit: formData.perUserLimit ? Number(formData.perUserLimit) : 1,
      applicableCategories: formData.applicableCategories,
      applicableItems: formData.applicableItems,
      description: formData.description.trim(),
      termsAndConditions: formData.termsAndConditions.trim(),
      freeDelivery: Boolean(formData.freeDelivery),
    }

    setIsSaving(true)
    try {
      if (isNewCoupon) {
        await restaurantAPI.createCoupon(payload)
      } else {
        await restaurantAPI.updateCoupon(id, payload)
      }
      toast.success(isNewCoupon ? "Coupon created successfully" : "Coupon updated successfully")
      navigate("/food/restaurant/create-coupons")
    } catch (error) {
      toast.error(error?.response?.data?.message || `Failed to ${isNewCoupon ? "create" : "update"} coupon`)
    } finally {
      setIsSaving(false)
    }
  }

  const saveButton = (
    <Button
      type="button"
      onClick={handleSubmit}
      disabled={isSaving}
      className="bg-[#FF6A00] hover:bg-[#e05e00] text-white flex items-center gap-2 rounded-xl"
    >
      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      Save
    </Button>
  )

  if (isFetching) {
    return (
      <RestaurantPageShell
        title={isNewCoupon ? "Create Coupon" : "Edit Coupon"}
        onBack={goBack}
        flush
        maxWidth="full"
        contentClassName={PAGE_WRAP}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF6A00]" />
        </div>
      </RestaurantPageShell>
    )
  }

  return (
    <RestaurantPageShell
      title={isNewCoupon ? "Create Coupon" : "Edit Coupon"}
      subtitle={isNewCoupon ? "Submit a new campaign for admin approval." : "Update coupon details and resubmit for approval."}
      onBack={goBack}
      flush
      maxWidth="full"
      contentClassName={PAGE_WRAP}
      actions={<div className="hidden sm:block">{saveButton}</div>}
    >
      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
        <div className={`${PANEL_CARD} border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/10`}>
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">Campaign Approval</p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
                Coupons stay pending until admin approval. Once approved, customers can apply them at checkout.
              </p>
            </div>
          </div>
        </div>

        {!isNewCoupon && couponData?.approvalStatus === "rejected" && couponData?.rejectionReason && (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-4">
            <p className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider mb-1">Admin Feedback</p>
            <p className="text-sm text-rose-900 dark:text-rose-200">{couponData.rejectionReason}</p>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
        <section className={sectionClass}>
          <h2 className="text-base font-bold text-slate-950 dark:text-white mb-4">Basic Information</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Coupon Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.couponName}
                  onChange={(e) => handleInputChange("couponName", e.target.value)}
                  className={inputClass}
                  placeholder="E.g. Diwali Special"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Coupon Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.couponCode}
                  onChange={(e) => handleInputChange("couponCode", e.target.value.toUpperCase())}
                  className={`${inputClass} uppercase tracking-wider font-semibold`}
                  placeholder="E.g. GET50"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange("description", e.target.value)}
                rows={3}
                className={`${inputClass} h-auto py-3 resize-none`}
                placeholder="Short description of the offer..."
              />
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-base font-bold text-slate-950 dark:text-white mb-4">Discount Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Discount Type</label>
              <select
                value={formData.discountType}
                onChange={(e) => handleInputChange("discountType", e.target.value)}
                className={inputClass}
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Flat (₹)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Discount Value <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.discountValue}
                onChange={(e) => handleInputChange("discountValue", e.target.value)}
                className={inputClass}
                placeholder={formData.discountType === "percentage" ? "10" : "50"}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Maximum Discount (₹)</label>
              <input
                type="number"
                value={formData.maxDiscount}
                onChange={(e) => handleInputChange("maxDiscount", e.target.value)}
                className={inputClass}
                placeholder="Max cap amount"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Minimum Order Amount (₹)</label>
              <input
                type="number"
                value={formData.minOrderAmount}
                onChange={(e) => handleInputChange("minOrderAmount", e.target.value)}
                className={inputClass}
                placeholder="E.g. 199"
              />
            </div>
          </div>
        </section>

        <section
          className={`rounded-2xl border-2 p-4 sm:p-5 transition-all duration-200 xl:col-span-2 ${
            formData.freeDelivery
              ? "border-emerald-400 dark:border-emerald-600 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/40 dark:via-[#111] dark:to-teal-950/30 shadow-[0_8px_30px_-12px_rgba(16,185,129,0.45)]"
              : `${PANEL_CARD} border-slate-200 dark:border-gray-700`
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                  formData.freeDelivery
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                }`}
              >
                <Truck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                    Offers Free Delivery
                  </h2>
                  {formData.freeDelivery ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      Active perk
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Enable this to waive delivery charges when customers apply this coupon. Great for boosting first-time orders.
                </p>
              </div>
            </div>
            <Switch
              checked={formData.freeDelivery}
              onCheckedChange={(checked) => handleInputChange("freeDelivery", checked)}
              className="mt-1 data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-gray-300 dark:data-[state=unchecked]:bg-gray-600"
              aria-label="Offers free delivery"
            />
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-base font-bold text-slate-950 dark:text-white mb-4">Validity & Limits</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => handleInputChange("startDate", e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => handleInputChange("endDate", e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Total Usage Limit</label>
              <input
                type="number"
                value={formData.usageLimit}
                onChange={(e) => handleInputChange("usageLimit", e.target.value)}
                className={inputClass}
                placeholder="Total allowed uses overall"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Limit Per User</label>
              <input
                type="number"
                value={formData.perUserLimit}
                onChange={(e) => handleInputChange("perUserLimit", e.target.value)}
                className={inputClass}
                placeholder="Default 1"
                min="1"
              />
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="text-base font-bold text-slate-950 dark:text-white mb-1">Applicability</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Leave empty to apply to the entire restaurant</p>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Applicable Categories</label>
              <div className="flex flex-wrap gap-2">
                {categories.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleMultiSelect("applicableCategories", c.id)}
                    className={chipClass(formData.applicableCategories.includes(c.id))}
                  >
                    {c.name}
                  </button>
                ))}
                {categories.length === 0 && <span className="text-sm text-gray-400">No categories found</span>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Applicable Items</label>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-[#0a0a0a]/50 p-3">
                {menuItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleMultiSelect("applicableItems", item.id)}
                    className={chipClass(formData.applicableItems.includes(item.id))}
                  >
                    {item.name}
                  </button>
                ))}
                {menuItems.length === 0 && <span className="text-sm text-gray-400">No items found</span>}
              </div>
            </div>
          </div>
        </section>

        <section className={`${sectionClass} xl:col-span-2`}>
          <h2 className="text-base font-bold text-slate-950 dark:text-white mb-4">Terms & Conditions</h2>
          <textarea
            value={formData.termsAndConditions}
            onChange={(e) => handleInputChange("termsAndConditions", e.target.value)}
            rows={4}
            className={`${inputClass} h-auto py-3 resize-none`}
            placeholder="Any special conditions for this coupon..."
          />
        </section>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="w-full bg-[#FF6A00] hover:bg-[#e05e00] disabled:bg-[#FF6A00]/50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl text-base transition-colors flex items-center justify-center gap-2"
        >
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {isSaving ? "Saving..." : isNewCoupon ? "Create Coupon" : "Update Coupon"}
        </button>
      </form>
    </RestaurantPageShell>
  )
}
