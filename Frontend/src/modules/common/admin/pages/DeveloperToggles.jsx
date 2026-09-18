import React, { useEffect, useState } from "react";
import { AlertCircle, Cloud, ChevronRight, FolderOpen, Loader2, Save, Server } from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@/services/api";
import { setCachedSettings } from "@/modules/common/utils/businessSettings";
import { cn } from "@/lib/utils";

const STORAGE_OPTIONS = [
  {
    value: "cloudinary",
    title: "Cloudinary",
    description: "Upload images to Cloudinary for managed CDN delivery and transformations.",
    icon: Cloud,
    accent: "indigo",
  },
  {
    value: "local",
    title: "Upload folder",
    description: "Process images with Multer and Sharp, then save them in the configured upload folder.",
    icon: FolderOpen,
    accent: "emerald",
  },
];

const DeveloperToggles = () => {
  const [provider, setProvider] = useState("cloudinary");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await adminAPI.getBusinessSettings();
        const settings = response?.data?.data || response?.data || {};
        setProvider(settings.imageStorageProvider === "local" ? "local" : "cloudinary");
      } catch (error) {
        toast.error("Failed to load developer settings");
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const saveProvider = async () => {
    try {
      setSaving(true);
      const response = await adminAPI.updateBusinessSettings({ imageStorageProvider: provider });
      const updatedSettings = response?.data?.data || response?.data;
      if (updatedSettings) setCachedSettings(updatedSettings);
      toast.success(`Image uploads will now use ${provider === "local" ? "the upload folder" : "Cloudinary"}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save image upload setting");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="min-h-full bg-gray-50 px-4 py-5 font-sans sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold text-gray-400">
              <span>Developer Settings</span><ChevronRight size={12} /><span className="text-gray-600">Toggles</span>
            </div>
            <h1 className="text-lg font-semibold text-gray-900">Developer toggles</h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-500">
              Control infrastructure behavior without changing application code or redeploying the frontend.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Server size={14} className="text-gray-500" /> Runtime configuration
          </div>
        </div>

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-gray-900">Image upload provider</h2>
            <p className="mt-1 text-xs text-gray-500">Choose where new image uploads should be stored.</p>
          </div>

          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 p-1 sm:flex-row">
            {STORAGE_OPTIONS.map(({ value, title, description, icon: Icon, accent }) => {
              const selected = provider === value;
              const isLocal = accent === "emerald";
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setProvider(value)}
                  className={cn(
                    "flex flex-1 items-center justify-between gap-3 rounded px-3 py-2 text-left transition-colors duration-200",
                    selected
                      ? isLocal ? "bg-emerald-50 text-emerald-900" : "bg-indigo-50 text-indigo-900"
                      : "bg-transparent text-gray-600 hover:bg-white",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon size={15} />
                    <div className="min-w-0">
                      <span className="block text-xs font-semibold">{title}</span>
                      <span className="hidden text-[10px] text-gray-500 sm:block">{description}</span>
                    </div>
                  </div>
                  <span className={cn("relative h-4 w-7 shrink-0 rounded-full transition-colors", selected ? isLocal ? "bg-emerald-500" : "bg-indigo-600" : "bg-gray-300")}>
                    <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform", selected ? "translate-x-3.5" : "translate-x-0.5")} />
                  </span>
                </button>
              );
            })}
            </div>
          </div>

          <div className="mx-4 mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 sm:mx-5 sm:mb-5">
            <AlertCircle className="mt-0.5 shrink-0 text-amber-600" size={15} />
            <p className="text-[11px] leading-relaxed text-amber-800">This setting affects new image uploads. Existing images are not moved.</p>
          </div>
        </section>

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={saveProvider} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save toggle
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeveloperToggles;
