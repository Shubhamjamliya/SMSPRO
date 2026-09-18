import { useEffect, useState } from "react"
import { Save, Loader2, IndianRupee, Plus, Trash2, Edit, Check, X, Truck, Store } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const EMPTY_RULE = {
  minOrderAmount: "",
  maxOrderAmount: "",
  maxDistanceKm: "",
  sponsorType: "USER_FULL",
  sponsoredKm: "",
}

const EMPTY_SLAB = {
  fromKm: "",
  toKm: "",
  deliveryFee: "",
  extraAmount: "",
  extraType: "FLAT",
  maxDistanceUnlimited: false,
}

const toInputValue = (value) => (value == null ? "" : String(value))
const toNullableNumber = (value) =>
  value === "" || value == null ? undefined : Number(value)

const formatSlabExtraSummary = (slab) => {
  const extraAmount = Number(slab?.extraAmount || 0)
  if (!Number.isFinite(extraAmount) || extraAmount <= 0) return "—"
  const extraType = String(slab?.extraType || "FLAT").toUpperCase()
  return extraType === "PERCENT" ? `${extraAmount}%` : `₹${extraAmount.toFixed(2)} flat`
}

export default function FeeSettings() {
  const [feeSettings, setFeeSettings] = useState({
    deliveryDistanceSlabs: [],
    platformFee: "",
    gstRate: "",
  })
  const [loadingFeeSettings, setLoadingFeeSettings] = useState(false)
  const [savingFeeSettings, setSavingFeeSettings] = useState(false)
  const [editingSlabIndex, setEditingSlabIndex] = useState(null)
  const [slabDraft, setSlabDraft] = useState({ ...EMPTY_SLAB })

  const hydrateFeeSettings = (settings) => ({
    deliveryDistanceSlabs: Array.isArray(settings?.deliveryDistanceSlabs) ? settings.deliveryDistanceSlabs : [],
    platformFee: toInputValue(settings?.platformFee),
    gstRate: toInputValue(settings?.gstRate),
  })

  const fetchFeeSettings = async () => {
    try {
      setLoadingFeeSettings(true)
      const response = await adminAPI.getFeeSettings()
      if (response.data.success && response.data.data.feeSettings) {
        setFeeSettings(hydrateFeeSettings(response.data.data.feeSettings))
      } else {
        setFeeSettings(hydrateFeeSettings(null))
      }
    } catch (error) {
      toast.error("Failed to load fee settings")
    } finally {
      setLoadingFeeSettings(false)
    }
  }

  useEffect(() => {
    fetchFeeSettings()
  }, [])

  const validateSlabDraft = () => {
    const fromKm = Number(slabDraft.fromKm)
    const toKm = slabDraft.maxDistanceUnlimited ? 9999 : Number(slabDraft.toKm)
    const deliveryFee = Number(slabDraft.deliveryFee)
    const extraAmount = slabDraft.extraAmount === "" ? 0 : Number(slabDraft.extraAmount)
    const extraType = String(slabDraft.extraType || "FLAT").toUpperCase() === "PERCENT" ? "PERCENT" : "FLAT"

    if (!Number.isFinite(fromKm) || fromKm < 0) {
      toast.error("Min Distance (KM) must be 0 or more")
      return null
    }
    if (!Number.isFinite(toKm) || toKm < fromKm) {
      toast.error("To KM must be greater than or equal to Min Distance (KM)")
      return null
    }
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      toast.error("Delivery fee must be 0 or more")
      return null
    }
    if (!Number.isFinite(extraAmount) || extraAmount < 0) {
      toast.error("Extra amount must be 0 or more")
      return null
    }
    if (extraType === "PERCENT" && extraAmount > 100) {
      toast.error("Extra percentage cannot exceed 100")
      return null
    }

    return { fromKm, toKm, deliveryFee, extraAmount, extraType }
  }

  const handleAddSlab = () => {
    const nextSlab = validateSlabDraft()
    if (!nextSlab) return

    setFeeSettings((prev) => ({
      ...prev,
      deliveryDistanceSlabs: [...(prev.deliveryDistanceSlabs || []), nextSlab],
    }))
    setSlabDraft({ ...EMPTY_SLAB })
    toast.success("Distance slab added successfully")
  }

  const handleEditSlab = (index) => {
    const slab = feeSettings.deliveryDistanceSlabs[index]
    if (!slab) return
    setEditingSlabIndex(index)
    const isUnlimited = Number(slab.toKm) >= 9999
    setSlabDraft({
      fromKm: toInputValue(slab.fromKm),
      toKm: isUnlimited ? "" : toInputValue(slab.toKm),
      deliveryFee: toInputValue(slab.deliveryFee),
      extraAmount: toInputValue(slab.extraAmount ?? 0),
      extraType: String(slab.extraType || "FLAT").toUpperCase() === "PERCENT" ? "PERCENT" : "FLAT",
      maxDistanceUnlimited: isUnlimited,
    })
  }

  const handleSaveSlab = () => {
    const nextSlab = validateSlabDraft()
    if (!nextSlab) return
    setFeeSettings((prev) => ({
      ...prev,
      deliveryDistanceSlabs: prev.deliveryDistanceSlabs.map((slab, index) =>
        index === editingSlabIndex ? nextSlab : slab,
      ),
    }))
    setEditingSlabIndex(null)
    setSlabDraft({ ...EMPTY_SLAB })
    toast.success("Distance slab updated successfully")
  }

  const handleDeleteSlab = (index) => {
    setFeeSettings((prev) => ({
      ...prev,
      deliveryDistanceSlabs: prev.deliveryDistanceSlabs.filter((_, slabIndex) => slabIndex !== index),
    }))
    if (editingSlabIndex === index) {
      setEditingSlabIndex(null)
      setSlabDraft({ ...EMPTY_SLAB })
    }
    toast.success("Distance slab deleted successfully")
  }

  const handleCancelSlabEdit = () => {
    setEditingSlabIndex(null)
    setSlabDraft({ ...EMPTY_SLAB })
  }

  const handleSaveFeeSettings = async () => {
    try {
      setSavingFeeSettings(true)
      const response = await adminAPI.createOrUpdateFeeSettings({
        baseDistanceKm: null,
        baseDeliveryFee: null,
        perKmCharge: null,
        deliveryDistanceSlabs: feeSettings.deliveryDistanceSlabs,
        platformFee: toNullableNumber(feeSettings.platformFee),
        gstRate: toNullableNumber(feeSettings.gstRate),
        isActive: true,
      })

      if (response.data.success) {
        toast.success("Fee settings saved successfully")
        setFeeSettings(hydrateFeeSettings(response?.data?.data?.feeSettings))
      } else {
        toast.error(response.data.message || "Failed to save fee settings")
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to save fee settings")
    } finally {
      setSavingFeeSettings(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
            <IndianRupee className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Delivery & Platform Fee</h1>
        </div>
        <p className="text-sm text-slate-600">
          Configure distance-based delivery pricing slabs, platform fee, and GST.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Fee Configuration</h2>
              <p className="text-sm text-slate-500 mt-1">
                Only the FOOD delivery fee model is changed here. Mixed-order settings continue elsewhere.
              </p>
            </div>
            <Button
              onClick={handleSaveFeeSettings}
              disabled={savingFeeSettings || loadingFeeSettings}
              className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
            >
              {savingFeeSettings ? (
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

          {loadingFeeSettings ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-green-600" />
            </div>
          ) : (
            <>


              <div className="border border-slate-200 rounded-xl p-5 mb-8">
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-slate-900">Distance-Based Delivery Fee Slabs</h3>
                </div>
                <p className="text-sm text-slate-500 mb-4">
                  Define delivery fee slabs based on the delivery distance. The delivery fee is paid to the rider. Extra amount is added on top for the customer (flat or percentage).
                </p>

                {feeSettings.deliveryDistanceSlabs.length > 0 && (
                  <div className="overflow-x-auto mb-5">
                    <table className="w-full border border-slate-200 rounded-lg">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">Min Distance (KM)</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">To distance (KM)</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">Delivery Fee (₹)</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">Extra</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 border-b border-slate-200">Extra Type</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700 border-b border-slate-200">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {feeSettings.deliveryDistanceSlabs.map((slab, index) => (
                          <tr key={`${slab.fromKm}-${slab.toKm}-${index}`} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm border-b border-slate-100">{Number(slab.fromKm).toFixed(1)} KM</td>
                            <td className="px-4 py-3 text-sm border-b border-slate-100">
                              {Number(slab.toKm) >= 9999 ? "Unlimited" : `${Number(slab.toKm).toFixed(1)} KM`}
                            </td>
                            <td className="px-4 py-3 text-sm border-b border-slate-100">₹{Number(slab.deliveryFee).toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm border-b border-slate-100">{formatSlabExtraSummary(slab)}</td>
                            <td className="px-4 py-3 text-sm border-b border-slate-100">
                              {String(slab.extraType || "FLAT").toUpperCase() === "PERCENT" ? "Percentage" : "Flat"}
                            </td>
                            <td className="px-4 py-3 text-center border-b border-slate-100">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleEditSlab(index)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="Edit"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteSlab(index)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Delete"
                                >
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
                    <Plus className="w-4 h-4 text-green-600" />
                    <h4 className="text-sm font-semibold text-slate-700">
                      {editingSlabIndex === null ? "Add Distance Slab" : "Edit Distance Slab"}
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Min Distance (KM)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={slabDraft.fromKm}
                        onChange={(e) => setSlabDraft((prev) => ({ ...prev, fromKm: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">To Distance (KM)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={slabDraft.maxDistanceUnlimited ? "" : slabDraft.toKm}
                        disabled={slabDraft.maxDistanceUnlimited}
                        onChange={(e) => setSlabDraft((prev) => ({ ...prev, toKm: e.target.value }))}
                        className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-green-500 outline-none ${slabDraft.maxDistanceUnlimited ? "border-slate-100 bg-slate-100/50 text-slate-400 cursor-not-allowed" : "border-slate-300 bg-white"}`}
                        placeholder="5"
                      />
                      <label className="flex items-center gap-2 mt-2 text-xs font-medium text-slate-500 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={slabDraft.maxDistanceUnlimited || false}
                          onChange={(e) =>
                            setSlabDraft((prev) => ({
                              ...prev,
                              maxDistanceUnlimited: e.target.checked,
                              toKm: e.target.checked ? "" : prev.toKm,
                            }))
                          }
                          className="rounded border-slate-300 text-green-600 focus:ring-green-500 w-3.5 h-3.5"
                        />
                        Max distance unlimited
                      </label>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Delivery Fee (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={slabDraft.deliveryFee}
                        onChange={(e) => setSlabDraft((prev) => ({ ...prev, deliveryFee: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                        placeholder="30"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">Paid to delivery partner</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Extra Amount</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={slabDraft.extraAmount}
                        onChange={(e) => setSlabDraft((prev) => ({ ...prev, extraAmount: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                        placeholder="10"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">Added on top for customer</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Extra Type</label>
                      <select
                        value={slabDraft.extraType}
                        onChange={(e) => setSlabDraft((prev) => ({ ...prev, extraType: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white"
                      >
                        <option value="FLAT">Flat (₹)</option>
                        <option value="PERCENT">Percentage (%)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 mt-4">
                    {editingSlabIndex !== null && (
                      <Button
                        onClick={handleCancelSlabEdit}
                        variant="outline"
                        className="border-slate-300 text-slate-700"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    )}
                    <Button
                      onClick={editingSlabIndex === null ? handleAddSlab : handleSaveSlab}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {editingSlabIndex === null ? (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Add Slab
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Save Slab
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-200 pt-6 mt-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Platform Fee (₹)
                  </label>
                  <input
                    type="number"
                    value={feeSettings.platformFee}
                    onChange={(e) => setFeeSettings((prev) => ({ ...prev, platformFee: e.target.value }))}
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="5"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    GST Rate (%)
                  </label>
                  <input
                    type="number"
                    value={feeSettings.gstRate}
                    onChange={(e) => setFeeSettings((prev) => ({ ...prev, gstRate: e.target.value }))}
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder="5"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
