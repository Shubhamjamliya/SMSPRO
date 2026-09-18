import { useEffect, useState } from "react"
import { Save, Loader2, Package, Store, Building2, Info } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

const MODES = {
  ADMIN: "ADMIN",
  RESTAURANT: "RESTAURANT",
}

const toInputValue = (value) => (value == null ? "" : String(value))

const hydrate = (packagingCharge) => ({
  isEnabled: packagingCharge?.isEnabled === true,
  mode: packagingCharge?.mode === MODES.RESTAURANT ? MODES.RESTAURANT : MODES.ADMIN,
  adminChargePerOrder: toInputValue(packagingCharge?.adminChargePerOrder ?? ""),
})

function ModeCard({ active, icon: Icon, title, description, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex-1 rounded-xl border p-4 text-left transition-colors ${
        active
          ? "border-green-500 bg-green-50 ring-1 ring-green-500"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${active ? "text-green-600" : "text-slate-500"}`} />
        <span className={`text-sm font-semibold ${active ? "text-green-900" : "text-slate-800"}`}>
          {title}
        </span>
        <span
          className={`ml-auto h-4 w-4 rounded-full border-2 ${
            active ? "border-green-600 bg-green-600" : "border-slate-300"
          }`}
        />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">{description}</p>
    </button>
  )
}

export default function PackagingCharges() {
  const [config, setConfig] = useState(hydrate(null))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchConfig = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getFeeSettings()
      setConfig(hydrate(response?.data?.data?.feeSettings?.packagingCharge))
    } catch (error) {
      toast.error("Failed to load packaging charge settings")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  const handleSave = async () => {
    const amount = config.adminChargePerOrder === "" ? 0 : Number(config.adminChargePerOrder)

    if (config.isEnabled && config.mode === MODES.ADMIN) {
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Enter a packaging charge per order, or turn packaging charges off")
        return
      }
    }

    try {
      setSaving(true)
      const response = await adminAPI.createOrUpdateFeeSettings({
        packagingCharge: {
          isEnabled: config.isEnabled,
          mode: config.mode,
          adminChargePerOrder: Number.isFinite(amount) ? amount : 0,
        },
        isActive: true,
      })

      if (!response?.data?.success) {
        throw new Error(response?.data?.message || "Failed to save packaging charges")
      }

      toast.success("Packaging charge settings saved")
      setConfig(hydrate(response?.data?.data?.feeSettings?.packagingCharge))
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Failed to save packaging charges")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600">
            <Package className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Packaging Charges</h1>
        </div>
        <p className="text-sm text-slate-600">
          Decide whether packaging is charged by the platform as one flat amount per order, or by each
          restaurant on its own menu items. The charge is always calculated by the order pricing API.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Configuration</h2>
              <p className="mt-1 text-sm text-slate-500">Applies to food orders only.</p>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-2 bg-green-600 text-white hover:bg-green-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-green-600" />
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-center justify-between rounded-xl border border-slate-200 p-5">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Charge packaging on orders</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    When off, customers are never charged a packaging fee.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.isEnabled}
                  onClick={() => setConfig((prev) => ({ ...prev, isEnabled: !prev.isEnabled }))}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                    config.isEnabled ? "bg-green-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                      config.isEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className={config.isEnabled ? "" : "pointer-events-none opacity-50"}>
                <h3 className="mb-3 text-sm font-semibold text-slate-700">Who manages the charge?</h3>
                <div className="flex flex-col gap-3 md:flex-row">
                  <ModeCard
                    active={config.mode === MODES.ADMIN}
                    icon={Building2}
                    title="Managed by admin"
                    description="You set one flat packaging charge that is added once per order. The platform keeps it."
                    onSelect={() => setConfig((prev) => ({ ...prev, mode: MODES.ADMIN }))}
                  />
                  <ModeCard
                    active={config.mode === MODES.RESTAURANT}
                    icon={Store}
                    title="Managed by restaurant"
                    description="Each restaurant sets a packaging charge per menu item, and can turn it off per item. The restaurant keeps it."
                    onSelect={() => setConfig((prev) => ({ ...prev, mode: MODES.RESTAURANT }))}
                  />
                </div>

                {config.mode === MODES.ADMIN ? (
                  <div className="mt-6 max-w-sm space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">
                      Packaging charge per order (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={config.adminChargePerOrder}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, adminChargePerOrder: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-4 py-2 outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="10"
                    />
                    <p className="text-[11px] text-slate-500">
                      Added once to every food order, no matter how many items are in the cart.
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <p className="text-xs leading-relaxed text-blue-900">
                      Restaurants now see a <strong>Packaging charge</strong> toggle and amount on each
                      menu item. The order total adds that amount for every unit of the items that have
                      it switched on. Items with the toggle off add nothing.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
