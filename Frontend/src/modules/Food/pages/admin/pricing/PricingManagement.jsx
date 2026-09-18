import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  IndianRupee,
  Loader2,
  Percent,
  Save,
  Trash2,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import { Button } from "@food/components/ui/button"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const RUPEE = "\u20B9"

const emptyRuleForm = {
  type: "PERCENTAGE",
  value: "10",
  status: "active",
}

function formatRuleLabel(rule) {
  if (!rule) return ""
  const value = Number(rule.value) || 0
  return rule.type === "FIXED" ? `+${RUPEE}${value}` : `+${value}%`
}

function formatShortDate(value) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function PreviewCard({ type, value }) {
  const base = 200
  const num = Number(value) || 0
  const other =
    type === "FIXED"
      ? base + num
      : Math.round((base + (base * num) / 100) * 100) / 100

  return (
    <div className="rounded-xl border border-dashed border-[#FF6A00]/40 bg-[#fff7ed] px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#FF6A00]">Preview</p>
      <p className="mt-1 text-sm text-gray-700">
        Base {RUPEE}
        {base} → Other {RUPEE}
        {other.toFixed(0)}
        <span className="ml-2 text-xs text-gray-500">
          ({type === "FIXED" ? `+${RUPEE}${num}` : `+${num}%`})
        </span>
      </p>
    </div>
  )
}

function RuleEditor({ title, form, setForm, onSave, saving, onClear, canClear }) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {canClear ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove override
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setForm((p) => ({ ...p, type: "PERCENTAGE" }))}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
            form.type === "PERCENTAGE"
              ? "bg-[#FF6A00] text-white"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          <Percent className="h-3.5 w-3.5" /> Percentage
        </button>
        <button
          type="button"
          onClick={() => setForm((p) => ({ ...p, type: "FIXED" }))}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
            form.type === "FIXED"
              ? "bg-[#FF6A00] text-white"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          <IndianRupee className="h-3.5 w-3.5" /> Fixed amount
        </button>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-500">
          {form.type === "FIXED" ? "Increase by (₹)" : "Increase by (%)"}
        </label>
        <input
          type="number"
          min="0"
          max={form.type === "PERCENTAGE" ? 500 : undefined}
          step="0.01"
          value={form.value}
          onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
          className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#FF6A00]"
        />
      </div>

      <PreviewCard type={form.type} value={form.value} />

      <Button
        type="button"
        disabled={saving}
        onClick={onSave}
        className="h-11 w-full rounded-xl bg-[#FF6A00] font-bold text-white hover:bg-[#e85d04]"
      >
        {saving ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Saving...
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <Save className="h-4 w-4" /> Save rule
          </span>
        )}
      </Button>
    </div>
  )
}

function PricingStatusBadge({ rule, globalRule }) {
  if (rule) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15">
        {formatRuleLabel(rule)}
      </span>
    )
  }
  if (globalRule) {
    const scopeLabel =
      globalRule.scope === "RESTAURANT"
        ? "Restaurant"
        : globalRule.scope === "GLOBAL"
          ? "Global"
          : "Inherited"
    return (
      <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-600/15">
        {scopeLabel} · {formatRuleLabel(globalRule)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
      No Rule
    </span>
  )
}

function ConfirmBulkModal({ open, count, type, value, onCancel, onConfirm, saving, entityLabel = "restaurant" }) {
  if (!open) return null
  const label = type === "FIXED" ? `+${RUPEE}${Number(value) || 0}` : `+${Number(value) || 0}%`
  const plural = count === 1 ? entityLabel : `${entityLabel}s`
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4">
      <div
        className="absolute inset-0"
        onClick={saving ? undefined : onCancel}
        aria-hidden
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-bold text-slate-900">Confirm bulk apply</h3>
        <p className="mt-2 text-sm text-slate-600">
          You are about to apply <span className="font-semibold text-slate-900">{label}</span> pricing
          to <span className="font-semibold text-slate-900">{count}</span> {plural}.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="rounded-xl">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="rounded-xl bg-[#FF6A00] font-bold text-white hover:bg-[#e85d04]"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Applying...
              </span>
            ) : (
              "Apply"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDeleteModal({ open, label, onCancel, onConfirm, saving }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4">
      <div className="absolute inset-0" onClick={saving ? undefined : onCancel} aria-hidden />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-bold text-slate-900">Remove override?</h3>
        <p className="mt-2 text-sm text-slate-600">
          {label || "This restaurant will inherit Global pricing (if configured)."}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="rounded-xl">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="rounded-xl bg-rose-600 font-bold text-white hover:bg-rose-700"
          >
            {saving ? "Removing..." : "Remove"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function RestaurantPricingPanel({
  restaurants,
  rules,
  globalRule,
  saving,
  onRemoveOverride,
  onBulkApply,
}) {
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkType, setBulkType] = useState("PERCENTAGE")
  const [bulkValue, setBulkValue] = useState("10")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const applyLockRef = useRef(false)

  const restaurantRuleMap = useMemo(() => {
    const map = new Map()
    for (const rule of rules) {
      if (rule.scope !== "RESTAURANT" || rule.status !== "active") continue
      const rid = String(rule.restaurantId || "")
      if (!rid) continue
      const prev = map.get(rid)
      if (!prev) {
        map.set(rid, rule)
        continue
      }
      const prevTime = new Date(prev.updatedAt || 0).getTime()
      const nextTime = new Date(rule.updatedAt || 0).getTime()
      if (nextTime >= prevTime) map.set(rid, rule)
    }
    return map
  }, [rules])

  const filteredRestaurants = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return restaurants
    const tokens = q.split(/\s+/).filter(Boolean)
    return restaurants.filter((r) => {
      const haystack = [r.name, r.id, r.code, r.ownerName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return tokens.every((token) => haystack.includes(token))
    })
  }, [restaurants, search])

  const visibleIds = useMemo(
    () => filteredRestaurants.map((r) => r.id),
    [filteredRestaurants],
  )

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      visibleIds.forEach((id) => next.add(id))
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const selectAllRestaurants = () => {
    setSelectedIds(new Set(restaurants.map((r) => r.id)))
  }

  const toggleVisibleHeader = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        visibleIds.forEach((id) => next.delete(id))
        return next
      })
      return
    }
    selectVisible()
  }

  const selectedCount = selectedIds.size
  const selectedList = useMemo(() => [...selectedIds], [selectedIds])

  const openConfirm = () => {
    if (!selectedCount) {
      toast.error("Select at least one restaurant")
      return
    }
    const num = Number(bulkValue)
    if (!Number.isFinite(num) || num < 0) {
      toast.error("Enter a valid value")
      return
    }
    if (bulkType === "PERCENTAGE" && num > 500) {
      toast.error("Percentage cannot exceed 500%")
      return
    }
    setConfirmOpen(true)
  }

  const handleConfirmApply = async () => {
    if (applyLockRef.current || saving) return
    applyLockRef.current = true
    try {
      await onBulkApply({
        restaurantIds: selectedList,
        type: bulkType,
        value: Number(bulkValue),
      })
      setConfirmOpen(false)
      clearSelection()
    } catch {
      // parent shows toast
    } finally {
      applyLockRef.current = false
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.id || applyLockRef.current || saving) return
    applyLockRef.current = true
    try {
      await onRemoveOverride(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      // parent toast
    } finally {
      applyLockRef.current = false
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID, or owner"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm outline-none focus:border-[#FF6A00]"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={selectAllRestaurants}
            className="rounded-lg px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-100"
          >
            Select all ({restaurants.length})
          </button>
          <button
            type="button"
            onClick={selectVisible}
            className="rounded-lg px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-100"
          >
            Select visible ({filteredRestaurants.length})
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded-lg px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-100"
          >
            Clear selection
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="max-h-[min(62vh,640px)] overflow-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleVisibleHeader}
                    aria-label="Select visible restaurants"
                    className="h-4 w-4 rounded border-slate-300 text-[#FF6A00] focus:ring-[#FF6A00]"
                  />
                </th>
                <th className="px-3 py-3 font-semibold">Restaurant</th>
                <th className="px-3 py-3 font-semibold">Current Pricing</th>
                <th className="px-3 py-3 font-semibold">Rule Type</th>
                <th className="px-3 py-3 font-semibold">Last Updated</th>
                <th className="px-3 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRestaurants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                    No restaurants match your search.
                  </td>
                </tr>
              ) : (
                filteredRestaurants.map((restaurant) => {
                  const rule = restaurantRuleMap.get(restaurant.id) || null
                  const checked = selectedIds.has(restaurant.id)
                  return (
                    <tr
                      key={restaurant.id}
                      className={`border-b border-slate-100 last:border-0 ${
                        checked ? "bg-orange-50/40" : "hover:bg-slate-50/80"
                      }`}
                      style={{ contentVisibility: "auto", containIntrinsicSize: "0 56px" }}
                    >
                      <td className="px-3 py-3 align-middle">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(restaurant.id)}
                          aria-label={`Select ${restaurant.name}`}
                          className="h-4 w-4 rounded border-slate-300 text-[#FF6A00] focus:ring-[#FF6A00]"
                        />
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{restaurant.name}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-400">
                            {[
                              restaurant.code ? `Code · ${restaurant.code}` : null,
                              restaurant.ownerName ? `Owner · ${restaurant.ownerName}` : null,
                              `ID · ${restaurant.id}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <PricingStatusBadge rule={rule} globalRule={globalRule} />
                      </td>
                      <td className="px-3 py-3 align-middle text-slate-600">
                        {rule
                          ? rule.type === "FIXED"
                            ? "Fixed"
                            : "Percentage"
                          : globalRule
                            ? "Global"
                            : "—"}
                      </td>
                      <td className="px-3 py-3 align-middle text-slate-500">
                        {formatShortDate(rule?.updatedAt)}
                      </td>
                      <td className="px-3 py-3 align-middle text-right">
                        {rule?.id ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              setDeleteTarget({
                                id: rule.id,
                                label: `Remove override for "${restaurant.name}"? It will inherit Global pricing if configured.`,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                            title="Remove override"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          <span>
            Showing {filteredRestaurants.length} of {restaurants.length} restaurants
          </span>
          <span>{selectedCount} selected</span>
        </div>
      </div>

      {selectedCount > 0 ? (
        <div className="sticky bottom-3 z-20 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">
                {selectedCount} restaurant{selectedCount === 1 ? "" : "s"} selected
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Apply one rule to every selected restaurant in a single action.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setBulkType("PERCENTAGE")}
                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${
                    bulkType === "PERCENTAGE"
                      ? "bg-white text-[#FF6A00] shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  <Percent className="h-3.5 w-3.5" /> %
                </button>
                <button
                  type="button"
                  onClick={() => setBulkType("FIXED")}
                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${
                    bulkType === "FIXED"
                      ? "bg-white text-[#FF6A00] shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  <IndianRupee className="h-3.5 w-3.5" /> Fixed
                </button>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">
                  Value
                </label>
                <input
                  type="number"
                  min="0"
                  max={bulkType === "PERCENTAGE" ? 500 : undefined}
                  step="0.01"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  className="h-10 w-28 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#FF6A00]"
                />
              </div>
              <Button
                type="button"
                disabled={saving}
                onClick={openConfirm}
                className="h-10 rounded-xl bg-[#FF6A00] px-4 font-bold text-white hover:bg-[#e85d04]"
              >
                Apply to selected
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={clearSelection}
                className="h-10 rounded-xl"
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmBulkModal
        open={confirmOpen}
        count={selectedCount}
        type={bulkType}
        value={bulkValue}
        saving={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmApply}
      />
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        label={deleteTarget?.label}
        saving={saving}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function MenuItemPricingPanel({
  restaurants,
  rules,
  globalRule,
  saving,
  onRemoveOverride,
  onBulkApply,
}) {
  const [restaurantId, setRestaurantId] = useState("")
  const [menuItems, setMenuItems] = useState([])
  const [loadingMenu, setLoadingMenu] = useState(false)
  const [menuError, setMenuError] = useState("")
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkType, setBulkType] = useState("PERCENTAGE")
  const [bulkValue, setBulkValue] = useState("10")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const applyLockRef = useRef(false)
  const loadSeqRef = useRef(0)

  const restaurantRule = useMemo(() => {
    if (!restaurantId) return null
    return (
      rules.find(
        (r) =>
          r.scope === "RESTAURANT" &&
          String(r.restaurantId) === String(restaurantId) &&
          r.status === "active",
      ) || null
    )
  }, [rules, restaurantId])

  const menuRuleMap = useMemo(() => {
    const map = new Map()
    for (const rule of rules) {
      if (rule.scope !== "MENU_ITEM" || rule.status !== "active") continue
      const mid = String(rule.menuItemId || "")
      if (!mid) continue
      const prev = map.get(mid)
      if (!prev) {
        map.set(mid, rule)
        continue
      }
      const prevTime = new Date(prev.updatedAt || 0).getTime()
      const nextTime = new Date(rule.updatedAt || 0).getTime()
      if (nextTime >= prevTime) map.set(mid, rule)
    }
    return map
  }, [rules])

  const inheritedRule = restaurantRule || globalRule || null

  const loadMenuItems = useCallback(async (rid) => {
    const seq = ++loadSeqRef.current
    if (!rid) {
      setMenuItems([])
      setMenuError("")
      return
    }
    try {
      setLoadingMenu(true)
      setMenuError("")
      // FoodItem collection is the source of truth — not the legacy restaurant.menu embed.
      const foodsRes = await adminAPI.getFoods({
        restaurantId: rid,
        limit: 1000,
        approvalStatus: "approved",
      })
      if (seq !== loadSeqRef.current) return

      const foods = foodsRes?.data?.data?.foods || foodsRes?.data?.data || []
      const normalized = (Array.isArray(foods) ? foods : [])
        .map((f) => ({
          id: String(f._id || f.id || ""),
          name: f.name || "Item",
          price: Number(f.price) || 0,
          categoryName: f.categoryName || "",
          isAvailable: f.isAvailable !== false,
        }))
        .filter((i) => i.id)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))

      setMenuItems(normalized)
      if (!normalized.length) {
        setMenuError("No approved menu items found for this restaurant.")
      }
    } catch (error) {
      if (seq !== loadSeqRef.current) return
      setMenuItems([])
      setMenuError(error?.response?.data?.message || "Failed to load menu items")
      toast.error(error?.response?.data?.message || "Failed to load menu items")
    } finally {
      if (seq === loadSeqRef.current) setLoadingMenu(false)
    }
  }, [])

  const handleRestaurantChange = (id) => {
    setRestaurantId(id)
    setSelectedIds(new Set())
    setSearch("")
    setConfirmOpen(false)
    setDeleteTarget(null)
    loadMenuItems(id)
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return menuItems
    const tokens = q.split(/\s+/).filter(Boolean)
    return menuItems.filter((item) => {
      const haystack = [item.name, item.id, item.categoryName].filter(Boolean).join(" ").toLowerCase()
      return tokens.every((token) => haystack.includes(token))
    })
  }, [menuItems, search])

  const visibleIds = useMemo(() => filteredItems.map((i) => i.id), [filteredItems])
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const selectedCount = selectedIds.size
  const selectedList = useMemo(() => [...selectedIds], [selectedIds])

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      visibleIds.forEach((id) => next.add(id))
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const selectAllItems = () => {
    setSelectedIds(new Set(menuItems.map((i) => i.id)))
  }

  const toggleVisibleHeader = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        visibleIds.forEach((id) => next.delete(id))
        return next
      })
      return
    }
    selectVisible()
  }

  const openConfirm = () => {
    if (!restaurantId) {
      toast.error("Select a restaurant first")
      return
    }
    if (!selectedCount) {
      toast.error("Select at least one menu item")
      return
    }
    const num = Number(bulkValue)
    if (!Number.isFinite(num) || num < 0) {
      toast.error("Enter a valid value")
      return
    }
    if (bulkType === "PERCENTAGE" && num > 500) {
      toast.error("Percentage cannot exceed 500%")
      return
    }
    setConfirmOpen(true)
  }

  const handleConfirmApply = async () => {
    if (applyLockRef.current || saving) return
    applyLockRef.current = true
    try {
      await onBulkApply({
        restaurantId,
        menuItemIds: selectedList,
        type: bulkType,
        value: Number(bulkValue),
      })
      setConfirmOpen(false)
      clearSelection()
    } catch {
      // parent toast
    } finally {
      applyLockRef.current = false
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.id || applyLockRef.current || saving) return
    applyLockRef.current = true
    try {
      await onRemoveOverride(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      // parent toast
    } finally {
      applyLockRef.current = false
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="mb-1 block text-xs font-semibold text-slate-500">Restaurant</label>
        <select
          value={restaurantId}
          onChange={(e) => handleRestaurantChange(e.target.value)}
          className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#FF6A00]"
        >
          <option value="">Select restaurant</option>
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {!restaurantId ? (
        <p className="text-sm text-slate-500">
          Select a restaurant to load menu items and apply overrides in bulk.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search menu items"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm outline-none focus:border-[#FF6A00]"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectAllItems}
                disabled={!menuItems.length}
                className="rounded-lg px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                Select all ({menuItems.length})
              </button>
              <button
                type="button"
                onClick={selectVisible}
                disabled={!filteredItems.length}
                className="rounded-lg px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                Select visible ({filteredItems.length})
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-100"
              >
                Clear selection
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="max-h-[min(62vh,640px)] overflow-auto">
              {loadingMenu ? (
                <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-[#FF6A00]" />
                  Loading menu items...
                </div>
              ) : (
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                    <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleVisibleHeader}
                          disabled={!visibleIds.length}
                          aria-label="Select visible menu items"
                          className="h-4 w-4 rounded border-slate-300 text-[#FF6A00] focus:ring-[#FF6A00]"
                        />
                      </th>
                      <th className="px-3 py-3 font-semibold">Menu Item</th>
                      <th className="px-3 py-3 font-semibold">Base Price</th>
                      <th className="px-3 py-3 font-semibold">Current Pricing</th>
                      <th className="px-3 py-3 font-semibold">Rule Type</th>
                      <th className="px-3 py-3 font-semibold">Last Updated</th>
                      <th className="px-3 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                          {menuError || "No menu items match your search."}
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => {
                        const rule = menuRuleMap.get(item.id) || null
                        const checked = selectedIds.has(item.id)
                        return (
                          <tr
                            key={item.id}
                            className={`border-b border-slate-100 last:border-0 ${
                              checked ? "bg-orange-50/40" : "hover:bg-slate-50/80"
                            }`}
                            style={{ contentVisibility: "auto", containIntrinsicSize: "0 56px" }}
                          >
                            <td className="px-3 py-3 align-middle">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleOne(item.id)}
                                aria-label={`Select ${item.name}`}
                                className="h-4 w-4 rounded border-slate-300 text-[#FF6A00] focus:ring-[#FF6A00]"
                              />
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">{item.name}</p>
                                <p className="mt-0.5 truncate text-xs text-slate-400">
                                  {item.categoryName || "Uncategorized"}
                                  {!item.isAvailable ? " · Unavailable" : ""}
                                </p>
                              </div>
                            </td>
                            <td className="px-3 py-3 align-middle font-semibold text-slate-700">
                              {RUPEE}
                              {Math.round(item.price || 0)}
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <PricingStatusBadge rule={rule} globalRule={inheritedRule} />
                            </td>
                            <td className="px-3 py-3 align-middle text-slate-600">
                              {rule
                                ? rule.type === "FIXED"
                                  ? "Fixed"
                                  : "Percentage"
                                : restaurantRule
                                  ? "Restaurant"
                                  : globalRule
                                    ? "Global"
                                    : "—"}
                            </td>
                            <td className="px-3 py-3 align-middle text-slate-500">
                              {formatShortDate(rule?.updatedAt)}
                            </td>
                            <td className="px-3 py-3 align-middle text-right">
                              {rule?.id ? (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() =>
                                    setDeleteTarget({
                                      id: rule.id,
                                      label: `Remove override for "${item.name}"? It will inherit Restaurant or Global pricing.`,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Remove
                                </button>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
              <span>
                Showing {filteredItems.length} of {menuItems.length} items
              </span>
              <span>{selectedCount} selected</span>
            </div>
          </div>

          {selectedCount > 0 ? (
            <div className="sticky bottom-3 z-20 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {selectedCount} menu item{selectedCount === 1 ? "" : "s"} selected
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Apply one override to every selected item in this restaurant.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setBulkType("PERCENTAGE")}
                      className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${
                        bulkType === "PERCENTAGE"
                          ? "bg-white text-[#FF6A00] shadow-sm"
                          : "text-slate-500"
                      }`}
                    >
                      <Percent className="h-3.5 w-3.5" /> %
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkType("FIXED")}
                      className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${
                        bulkType === "FIXED"
                          ? "bg-white text-[#FF6A00] shadow-sm"
                          : "text-slate-500"
                      }`}
                    >
                      <IndianRupee className="h-3.5 w-3.5" /> Fixed
                    </button>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-400">
                      Value
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={bulkType === "PERCENTAGE" ? 500 : undefined}
                      step="0.01"
                      value={bulkValue}
                      onChange={(e) => setBulkValue(e.target.value)}
                      className="h-10 w-28 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#FF6A00]"
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={openConfirm}
                    className="h-10 rounded-xl bg-[#FF6A00] px-4 font-bold text-white hover:bg-[#e85d04]"
                  >
                    Apply to selected
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearSelection}
                    className="h-10 rounded-xl"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      <ConfirmBulkModal
        open={confirmOpen}
        count={selectedCount}
        type={bulkType}
        value={bulkValue}
        saving={saving}
        entityLabel="menu item"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmApply}
      />
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        label={deleteTarget?.label}
        saving={saving}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

export default function PricingManagement() {
  const [tab, setTab] = useState("global")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState(null)
  const [rules, setRules] = useState([])
  const [restaurants, setRestaurants] = useState([])
  const [globalForm, setGlobalForm] = useState(emptyRuleForm)
  const [deleteRuleTarget, setDeleteRuleTarget] = useState(null)
  const saveLockRef = useRef(false)

  const globalRule = useMemo(
    () => rules.find((r) => r.scope === "GLOBAL" && r.status === "active") || null,
    [rules],
  )

  const loadCore = useCallback(async () => {
    try {
      setLoading(true)
      const [summaryRes, rulesRes, restaurantsRes] = await Promise.all([
        adminAPI.getPricingSummary(),
        adminAPI.getPricingRules(),
        adminAPI.getRestaurants({ limit: 1000 }),
      ])

      setSummary(summaryRes?.data?.data || null)
      const nextRules = rulesRes?.data?.data?.rules || []
      setRules(nextRules)

      const restList =
        restaurantsRes?.data?.data?.restaurants ||
        restaurantsRes?.data?.data?.items ||
        restaurantsRes?.data?.data ||
        []
      const normalized = (Array.isArray(restList) ? restList : [])
        .map((r) => ({
          id: String(r._id || r.id || ""),
          code: String(r.restaurantId || ""),
          name: r.restaurantName || r.name || "Restaurant",
          ownerName: r.ownerName || "",
        }))
        .filter((r) => r.id)
      setRestaurants(normalized)

      const global = nextRules.find((r) => r.scope === "GLOBAL" && r.status === "active")
      if (global) {
        setGlobalForm({
          type: global.type || "PERCENTAGE",
          value: String(global.value ?? "10"),
          status: global.status || "active",
          id: global.id,
        })
      } else {
        setGlobalForm(emptyRuleForm)
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load pricing")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCore()
  }, [loadCore])

  const saveRule = async (scope, form, extra = {}) => {
    if (saveLockRef.current || saving) return
    const num = Number(form.value)
    if (!Number.isFinite(num) || num < 0) {
      toast.error("Enter a valid value (>= 0)")
      return
    }
    if (form.type === "PERCENTAGE" && num > 500) {
      toast.error("Percentage cannot exceed 500%")
      return
    }
    saveLockRef.current = true
    try {
      setSaving(true)
      await adminAPI.upsertPricingRule({
        scope,
        type: form.type,
        value: num,
        status: "active",
        ...extra,
      })
      toast.success("Pricing rule saved")
      await loadCore()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save rule")
    } finally {
      setSaving(false)
      saveLockRef.current = false
    }
  }

  const clearRule = async (ruleId) => {
    if (!ruleId || saveLockRef.current || saving) return
    saveLockRef.current = true
    try {
      setSaving(true)
      await adminAPI.deletePricingRule(ruleId)
      toast.success("Override removed")
      await loadCore()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to remove rule")
      throw error
    } finally {
      setSaving(false)
      saveLockRef.current = false
    }
  }

  const requestClearRule = (ruleId, label) => {
    if (!ruleId) return
    setDeleteRuleTarget({ id: ruleId, label })
  }

  const confirmClearRule = async () => {
    if (!deleteRuleTarget?.id) return
    try {
      await clearRule(deleteRuleTarget.id)
      setDeleteRuleTarget(null)
    } catch {
      // toast already shown
    }
  }

  const bulkApplyRestaurantRules = async ({ restaurantIds, type, value }) => {
    try {
      setSaving(true)
      const res = await adminAPI.bulkUpsertRestaurantPricingRules({
        restaurantIds,
        type,
        value,
        status: "active",
      })
      const updated = res?.data?.data?.updated ?? restaurantIds.length
      toast.success(`Pricing updated successfully. ${updated} restaurants updated.`)
      await loadCore()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to apply pricing")
      throw error
    } finally {
      setSaving(false)
    }
  }

  const bulkApplyMenuItemRules = async ({ restaurantId, menuItemIds, type, value }) => {
    try {
      setSaving(true)
      const res = await adminAPI.bulkUpsertMenuItemPricingRules({
        restaurantId,
        menuItemIds,
        type,
        value,
        status: "active",
      })
      const updated = res?.data?.data?.updated ?? menuItemIds.length
      toast.success(`Pricing updated successfully. ${updated} menu items updated.`)
      await loadCore()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to apply menu pricing")
      throw error
    } finally {
      setSaving(false)
    }
  }

  const tabs = useMemo(
    () => [
      { id: "global", label: "Global" },
      { id: "restaurant", label: "Restaurant" },
      { id: "menu", label: "Menu Item" },
    ],
    [],
  )

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF6A00]" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#FF6A00]">
            Menu management
          </p>
          <h1 className="text-2xl font-black text-slate-950">Pricing Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure Other Price markup without editing individual menu prices. Priority: Menu
            Item → Restaurant → Global.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={loadCore} className="rounded-xl">
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-400">Global rule</p>
          <p className="mt-1 text-lg font-black text-slate-900">
            {summary?.global
              ? summary.global.type === "FIXED"
                ? `+${RUPEE}${summary.global.value}`
                : `+${summary.global.value}%`
              : "Not set"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-400">Restaurant overrides</p>
          <p className="mt-1 text-lg font-black text-slate-900">
            {summary?.activeRestaurantOverrides || 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-400">Menu item overrides</p>
          <p className="mt-1 text-lg font-black text-slate-900">
            {summary?.activeMenuItemOverrides || 0}
          </p>
        </div>
      </div>

      <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition ${
              tab === t.id ? "bg-white text-[#FF6A00] shadow-sm" : "text-slate-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "global" ? (
        <RuleEditor
          title="Global Other Price"
          form={globalForm}
          setForm={setGlobalForm}
          saving={saving}
          canClear={Boolean(globalForm.id)}
          onClear={() =>
            requestClearRule(globalForm.id, "Remove the Global pricing rule? Restaurants without overrides will show base price only.")
          }
          onSave={() => saveRule("GLOBAL", globalForm)}
        />
      ) : null}

      {tab === "restaurant" ? (
        <RestaurantPricingPanel
          restaurants={restaurants}
          rules={rules}
          globalRule={globalRule}
          saving={saving}
          onRemoveOverride={clearRule}
          onBulkApply={bulkApplyRestaurantRules}
        />
      ) : null}

      {tab === "menu" ? (
        <MenuItemPricingPanel
          restaurants={restaurants}
          rules={rules}
          globalRule={globalRule}
          saving={saving}
          onRemoveOverride={clearRule}
          onBulkApply={bulkApplyMenuItemRules}
        />
      ) : null}

      <ConfirmDeleteModal
        open={Boolean(deleteRuleTarget)}
        label={deleteRuleTarget?.label}
        saving={saving}
        onCancel={() => setDeleteRuleTarget(null)}
        onConfirm={confirmClearRule}
      />
    </div>
  )
}
