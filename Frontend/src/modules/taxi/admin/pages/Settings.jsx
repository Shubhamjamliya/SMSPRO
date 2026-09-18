import React, { useCallback, useEffect, useState } from "react";
import { Banknote, Loader2, MapPinned, Save, Settings as SettingsIcon } from "lucide-react";
import { PageHeader, SectionCard, FormField } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { toast } from "sonner";
import { taxiAdminApi } from "../../services/api";

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchRadiusKm, setSearchRadiusKm] = useState(8);
  const [cashLimit, setCashLimit] = useState(2000);
  const [cashLimitActive, setCashLimitActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await taxiAdminApi.getSettings();
      setSearchRadiusKm(Number(settings?.searchRadiusKm ?? 8));
      const cl = settings?.cashLimit;
      setCashLimit(Number(cl?.cashLimit ?? cl ?? 2000));
      setCashLimitActive(cl?.isActive !== false);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load taxi settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const km = Number(searchRadiusKm);
    const limit = Number(cashLimit);
    if (!Number.isFinite(km) || km < 1 || km > 100) {
      toast.error("Search radius must be between 1 and 100 km");
      return;
    }
    if (!Number.isFinite(limit) || limit < 0) {
      toast.error("Cash limit must be a non-negative number");
      return;
    }
    setSaving(true);
    try {
      const settings = await taxiAdminApi.updateSettings({
        searchRadiusKm: km,
        cashLimit: {
          cashLimit: limit,
          isActive: Boolean(cashLimitActive),
        },
      });
      setSearchRadiusKm(Number(settings?.searchRadiusKm ?? km));
      const cl = settings?.cashLimit;
      setCashLimit(Number(cl?.cashLimit ?? limit));
      setCashLimitActive(cl?.isActive !== false);
      toast.success("Taxi settings saved");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="just-order-theme-scope space-y-6 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader
        title="Taxi Settings"
        description="Operational defaults for dispatch, matching, and cash collection"
      />

      <SectionCard
        title="Driver search radius"
        description="Only online taxi drivers inside this distance from pickup receive the ride request"
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin text-[#FF6A00]" />
            Loading settings…
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-xl border border-orange-100 bg-orange-50/70 px-4 py-3">
              <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6A00]" />
              <p className="text-sm text-gray-700">
                When a user books a ride, we broadcast the offer to all eligible taxi drivers
                within this radius. Default is <span className="font-semibold">8 km</span>.
                Change it here anytime — next rides use the new value immediately.
              </p>
            </div>

            <FormField label="Search radius (km)" required>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  step={0.5}
                  value={searchRadiusKm}
                  onChange={(e) => setSearchRadiusKm(e.target.value)}
                  className="sm:max-w-[200px]"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Allowed range: 1–100 km. Drivers outside this distance will not see the request.
              </p>
            </FormField>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <SettingsIcon className="h-3.5 w-3.5" />
              Other filters still apply: online, taxi module active, fresh GPS (10 min), not busy.
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Taxi cash-in-hand limit"
        description="Separate from food COD. Blocks Take cash when a driver’s unsettled taxi cash reaches this limit"
      >
        {loading ? null : (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3">
              <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <p className="text-sm text-gray-700">
                Cash-in-hand is the sum of completed taxi rides paid in cash for that driver.
                Available room = limit − cash-in-hand. Deposits / settlement can be added later.
              </p>
            </div>

            <FormField label="Cash limit (₹)" required>
              <Input
                type="number"
                min={0}
                step={100}
                value={cashLimit}
                onChange={(e) => setCashLimit(e.target.value)}
                className="sm:max-w-[200px]"
              />
            </FormField>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={cashLimitActive}
                onChange={(e) => setCashLimitActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[#FF6A00] focus:ring-[#FF6A00]"
              />
              Enforce cash limit on collect
            </label>

            <Button onClick={save} disabled={saving || loading}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </div>
        )}
      </SectionCard>
    </div>
  );
};

export default Settings;
