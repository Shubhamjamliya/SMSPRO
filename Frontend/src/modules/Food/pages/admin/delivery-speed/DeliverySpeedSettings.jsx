import { useEffect, useState } from "react"
import { Save, Loader2, Zap, Plus, Trash2, Edit, Check, X, Star } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const EMPTY_DRAFT = {
  code: "",
  label: "",
  description: "",
  etaMinutesMin: "",
  etaMinutesMax: "",
  extraFee: "",
  isDefault: false,
  isActive: true,
}

const toInputValue = (value) => (value == null ? "" : String(value))

export default function DeliverySpeedSettings() {
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const [draft, setDraft] = useState(EMPTY_DRAFT)

  const fetchOptions = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getFeeSettings()
      const list = response?.data?.data?.feeSettings?.deliverySpeedOptions
      setOptions(Array.isArray(list) ? list : [])
    } catch (error) {
      toast.error("Failed to load delivery speed options")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOptions()
  }, [])

  const persistOptions = async (nextOptions, { successMessage } = {}) => {
    try {
      setSaving(true)
      const response = await adminAPI.createOrUpdateFeeSettings({
        deliverySpeedOptions: nextOptions,
        isActive: true,
      })

      if (!response?.data?.success) {
        throw new Error(response?.data?.message || "Failed to save delivery speed options")
      }

      const saved = response?.data?.data?.feeSettings?.deliverySpeedOptions
      if (Array.isArray(saved)) {
        setOptions(saved)
      } else {
        setOptions(nextOptions)
      }

      if (successMessage) {
        toast.success(successMessage)
      }

      return true
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Failed to save delivery speed options")
      return false
    } finally {
      setSaving(false)
    }
  }

  const validateDraft = () => {
    const code = String(draft.code || "").trim().toLowerCase()
    const label = String(draft.label || "").trim()
    const etaMinutesMin = Number(draft.etaMinutesMin)
    const etaMinutesMax = Number(draft.etaMinutesMax)
    const extraFee = Number(draft.extraFee || 0)

    if (!code) {
      toast.error("Code is required (e.g. eco, standard, express)")
      return null
    }
    if (options.some((option, index) => option.code === code && index !== editingIndex)) {
      toast.error(`An option with code "${code}" already exists`)
      return null
    }
    if (!label) {
      toast.error("Label is required")
      return null
    }
    if (!Number.isFinite(etaMinutesMin) || etaMinutesMin < 0) {
      toast.error("Min ETA (minutes) must be 0 or more")
      return null
    }
    if (!Number.isFinite(etaMinutesMax) || etaMinutesMax < etaMinutesMin) {
      toast.error("Max ETA must be greater than or equal to Min ETA")
      return null
    }
    if (!Number.isFinite(extraFee) || extraFee < 0) {
      toast.error("Extra fee must be 0 or more")
      return null
    }

    return {
      code,
      label,
      description: String(draft.description || "").trim(),
      etaMinutesMin,
      etaMinutesMax,
      extraFee,
      isDefault: Boolean(draft.isDefault),
      isActive: draft.isActive !== false,
      sortOrder: editingIndex === null ? options.length : options[editingIndex]?.sortOrder ?? editingIndex,
    }
  }

  const applyDefaultExclusivity = (list, index) =>
    list.map((option, i) => ({ ...option, isDefault: i === index ? option.isDefault : false }))

  const handleAdd = async () => {
    const next = validateDraft()
    if (!next) return

    let merged = [...options, next]
    if (next.isDefault) {
      merged = applyDefaultExclusivity(merged, merged.length - 1)
    }

    const saved = await persistOptions(merged, { successMessage: "Delivery speed option saved" })
    if (saved) {
      setDraft(EMPTY_DRAFT)
    }
  }

  const handleEdit = (index) => {
    const option = options[index]
    if (!option) return
    setEditingIndex(index)
    setDraft({
      code: option.code,
      label: option.label,
      description: option.description || "",
      etaMinutesMin: toInputValue(option.etaMinutesMin),
      etaMinutesMax: toInputValue(option.etaMinutesMax),
      extraFee: toInputValue(option.extraFee),
      isDefault: Boolean(option.isDefault),
      isActive: option.isActive !== false,
    })
  }

  const handleSaveEdit = async () => {
    const next = validateDraft()
    if (!next) return

    const merged = options.map((option, index) => (index === editingIndex ? next : option))
    const normalized = next.isDefault ? applyDefaultExclusivity(merged, editingIndex) : merged

    const saved = await persistOptions(normalized, { successMessage: "Delivery speed option updated" })
    if (saved) {
      setEditingIndex(null)
      setDraft(EMPTY_DRAFT)
    }
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
    setDraft(EMPTY_DRAFT)
  }

  const handleDelete = async (index) => {
    const nextOptions = options.filter((_, i) => i !== index)
    const saved = await persistOptions(nextOptions, { successMessage: "Delivery speed option removed" })
    if (saved && editingIndex === index) {
      handleCancelEdit()
    }
  }

  const handleSave = async () => {
    await persistOptions(options, { successMessage: "Delivery speed options saved successfully" })
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Delivery Speed Options</h1>
        </div>
        <p className="text-sm text-slate-600">
          Configure the delivery speed tiers shown to users on the cart page. Changes are saved to the database
          automatically when you add, edit, or delete an option.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Speed Tiers</h2>
              <p className="text-sm text-slate-500 mt-1">
                Mark one option as default - it is pre-selected for users when they open the cart.
              </p>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || loading}
              className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Settings
                </>
              )}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
            </div>
          ) : (
            <>
              {options.length > 0 && (
                <div className="overflow-x-auto mb-5">
                  <table className="w-full border border-slate-200 rounded-lg">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">Label</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">Code</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">ETA (min)</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">Extra Fee (₹)</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700 border-b border-slate-200">Default</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700 border-b border-slate-200">Active</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700 border-b border-slate-200">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {options.map((option, index) => (
                        <tr key={`${option.code}-${index}`} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm border-b border-slate-100 font-medium text-slate-900">{option.label}</td>
                          <td className="px-4 py-3 text-sm border-b border-slate-100 text-slate-500">{option.code}</td>
                          <td className="px-4 py-3 text-sm border-b border-slate-100">
                            {option.etaMinutesMin}-{option.etaMinutesMax} min
                          </td>
                          <td className="px-4 py-3 text-sm border-b border-slate-100">₹{Number(option.extraFee).toFixed(2)}</td>
                          <td className="px-4 py-3 text-center border-b border-slate-100">
                            {option.isDefault && <Star className="w-4 h-4 text-amber-500 fill-amber-500 inline" />}
                          </td>
                          <td className="px-4 py-3 text-center border-b border-slate-100">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${option.isActive !== false ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                              {option.isActive !== false ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center border-b border-slate-100">
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => handleEdit(index)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit" disabled={saving}>
                                <Edit className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(index)} className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete" disabled={saving}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Plus className="w-4 h-4 text-orange-600" />
                  <h4 className="text-sm font-semibold text-slate-700">
                    {editingIndex === null ? "Add Speed Option" : "Edit Speed Option"}
                  </h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Code</label>
                    <input
                      type="text"
                      value={draft.code}
                      onChange={(e) => setDraft((prev) => ({ ...prev, code: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                      placeholder="eco"
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Label</label>
                    <input
                      type="text"
                      value={draft.label}
                      onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                      placeholder="Eco"
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Extra Fee (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.extraFee}
                      onChange={(e) => setDraft((prev) => ({ ...prev, extraFee: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                      placeholder="0"
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Min ETA (minutes)</label>
                    <input
                      type="number"
                      min="0"
                      value={draft.etaMinutesMin}
                      onChange={(e) => setDraft((prev) => ({ ...prev, etaMinutesMin: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                      placeholder="30"
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Max ETA (minutes)</label>
                    <input
                      type="number"
                      min="0"
                      value={draft.etaMinutesMax}
                      onChange={(e) => setDraft((prev) => ({ ...prev, etaMinutesMax: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                      placeholder="40"
                      disabled={saving}
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Description (optional)</label>
                    <input
                      type="text"
                      value={draft.description}
                      onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                      placeholder="Regular delivery speed"
                      disabled={saving}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-5 mt-4">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={draft.isDefault}
                      onChange={(e) => setDraft((prev) => ({ ...prev, isDefault: e.target.checked }))}
                      className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-3.5 h-3.5"
                      disabled={saving}
                    />
                    Pre-selected by default
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(e) => setDraft((prev) => ({ ...prev, isActive: e.target.checked }))}
                      className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-3.5 h-3.5"
                      disabled={saving}
                    />
                    Active (visible to users)
                  </label>
                </div>
                <div className="flex justify-end gap-3 mt-4">
                  {editingIndex !== null && (
                    <Button onClick={handleCancelEdit} variant="outline" className="border-slate-300 text-slate-700" disabled={saving}>
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  )}
                  <Button
                    onClick={editingIndex === null ? handleAdd : handleSaveEdit}
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                    disabled={saving}
                  >
                    {editingIndex === null ? (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Option
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Save Option
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
