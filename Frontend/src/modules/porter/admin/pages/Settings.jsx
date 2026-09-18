import React, { useCallback, useEffect, useState } from "react";
import { Loader2, MapPinned, Save, Settings as SettingsIcon } from "lucide-react";
import { PageHeader, SectionCard, FormField } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { toast } from "sonner";
import { porterAdminApi } from "../services/adminApi";

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchRadiusKm, setSearchRadiusKm] = useState(5);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await porterAdminApi.getSettings();
      setSearchRadiusKm(Number(settings?.searchRadiusKm ?? 5));
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load Porter settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const km = Number(searchRadiusKm);
    if (!Number.isFinite(km) || km < 1 || km > 100) {
      toast.error("Search radius must be between 1 and 100 km");
      return;
    }
    setSaving(true);
    try {
      const settings = await porterAdminApi.updateSettings({ searchRadiusKm: km });
      setSearchRadiusKm(Number(settings?.searchRadiusKm ?? km));
      toast.success("Porter settings saved");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="just-order-theme-scope space-y-6 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader
        title="Porter Settings"
        description="Operational defaults for vehicle matching and partner search"
      />

      <SectionCard
        title="Partner search radius"
        description="Only vehicle types with an online Porter partner inside this distance from pickup are shown to users"
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
                After the user sets pickup, we list vehicle types that have a matching online
                partner within this radius. Default is{" "}
                <span className="font-semibold">5 km</span>. Dispatch uses the same value when
                offering trips.
              </p>
            </div>

            <FormField label="Search radius (km)" required>
              <Input
                type="number"
                min={1}
                max={100}
                step={0.5}
                value={searchRadiusKm}
                onChange={(e) => setSearchRadiusKm(e.target.value)}
                className="sm:max-w-[200px]"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Allowed range: 1–100 km. Partners outside this distance will not make a vehicle
                type appear on Select Vehicle.
              </p>
            </FormField>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <SettingsIcon className="h-3.5 w-3.5" />
              Other filters still apply: online, Porter module active, fresh GPS (10 min), not busy,
              matching vehicle type.
            </div>

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
