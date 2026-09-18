import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Eye,
  FileText,
  IdCard,
  Loader2,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { userAPI } from "@/services/api";
import { cn } from "@/lib/utils";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf";
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "pdf"]);
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
]);

/** Every identity-document profile field this component can ever render a slot for. */
export const ALL_IDENTITY_DOC_FIELDS = [
  "drivingLicenseFront",
  "drivingLicenseBack",
  "aadhaarFront",
  "aadhaarBack",
  "panCardImage",
  "passportImage",
  "voterIdImage",
];

const DOC_TYPE_ICONS = {
  driving_license: IdCard,
  aadhaar_card: FileText,
  pan_card: FileText,
  passport: FileText,
  voter_id: IdCard,
};

/** Fallback so checkout never ships with zero identity verification if a bike has no vendor-picked requirement. */
const DEFAULT_DOC_TYPE = {
  key: "driving_license",
  label: "Driving License",
  fields: ["drivingLicenseFront", "drivingLicenseBack"],
};

/**
 * Resolve the bike's vendor-selected `requiredDocuments` keys against the platform document
 * catalog into full {key, label, fields} entries usable for rendering + validation.
 */
export function resolveRequiredDocTypes(catalog = [], requiredKeys = []) {
  const matched = (Array.isArray(requiredKeys) ? requiredKeys : [])
    .map((key) => catalog.find((d) => d.key === key))
    .filter(Boolean);
  return matched.length ? matched : [DEFAULT_DOC_TYPE];
}

export function areCheckoutDocumentsComplete(docs = {}, requiredDocTypes = []) {
  const fields = requiredDocTypes.flatMap((d) => d.fields || []);
  if (!fields.length) return true;
  return fields.every((key) => Boolean(String(docs[key] || "").trim()));
}

function isPdfUrl(url = "") {
  return /\.pdf($|\?)/i.test(String(url)) || String(url).includes("/raw/");
}

function validateFile(file) {
  if (!file) return "Choose a file";
  const ext = String(file.name || "").split(".").pop()?.toLowerCase() || "";
  const mime = String(file.type || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext) && !ALLOWED_MIME.has(mime)) {
    return "Only JPG, PNG, or PDF (max 5MB)";
  }
  if (Number(file.size || 0) > MAX_BYTES) {
    return "File must be 5MB or smaller";
  }
  return "";
}

function DocSlot({
  label,
  url,
  error,
  progress,
  uploading,
  onUpload,
  onPreview,
}) {
  const inputRef = useRef(null);
  const hasFile = Boolean(url);
  const pdf = isPdfUrl(url);

  const openPicker = () => {
    if (uploading) return;
    inputRef.current?.click();
  };

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-gray-700">{label}</p>
        {hasFile ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            Uploaded
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-amber-600">Required</span>
        )}
      </div>

      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border transition",
          error
            ? "border-rose-300 bg-rose-50/40"
            : hasFile
              ? "border-emerald-200 bg-white"
              : "border-dashed border-gray-300 bg-gray-50/80",
        )}
      >
        <button
          type="button"
          onClick={openPicker}
          disabled={uploading}
          className={cn(
            "relative flex w-full flex-col items-center justify-center",
            "h-[7.25rem] sm:h-32",
            "active:scale-[0.99] disabled:opacity-70",
          )}
          aria-label={hasFile ? `Replace ${label}` : `Upload ${label}`}
        >
          {hasFile ? (
            pdf ? (
              <div className="flex flex-col items-center gap-1 text-gray-500">
                <FileText className="h-8 w-8 text-[#FF6A00]" />
                <span className="text-[11px] font-bold">PDF ready</span>
                <span className="text-[10px] text-gray-400">Tap to replace</span>
              </div>
            ) : (
              <>
                <img
                  src={url}
                  alt={label}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                <span className="absolute bottom-2 left-2 right-2 flex items-center justify-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-[10px] font-bold text-gray-800 shadow-sm">
                  <RefreshCw className="h-3 w-3 text-[#FF6A00]" />
                  Tap to replace
                </span>
              </>
            )
          ) : (
            <div className="flex flex-col items-center gap-1.5 px-3 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FF6A00]/10 text-[#FF6A00]">
                <Plus className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-extrabold text-gray-800">Upload {label.toLowerCase()}</span>
              <span className="text-[10px] leading-tight text-gray-400">
                JPG, PNG or PDF · up to 5MB
              </span>
            </div>
          )}

          {uploading ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/90 px-4 backdrop-blur-[1px]">
              <Loader2 className="h-5 w-5 animate-spin text-[#FF6A00]" />
              <div className="h-1.5 w-full max-w-[9rem] overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-[#FF6A00] transition-all duration-200"
                  style={{ width: `${Math.max(10, Math.min(100, progress || 10))}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-gray-600">
                Uploading {Math.max(0, progress || 0)}%
              </span>
            </div>
          ) : null}
        </button>

        {hasFile && !uploading ? (
          <div className="absolute right-2 top-2 z-10">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPreview();
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-gray-800 shadow-md ring-1 ring-black/5"
              aria-label={`Preview ${label}`}
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onUpload(file);
          }}
        />
      </div>

      {error ? (
        <p className="mt-1.5 text-[10px] font-semibold leading-snug text-rose-600">{error}</p>
      ) : null}
    </div>
  );
}

/**
 * Required KYC docs for Bike Rent checkout — stored on the shared user profile.
 */
export default function CheckoutRequiredDocuments({
  userProfile,
  licenseNumber,
  onLicenseChange,
  licenseError,
  errors = {},
  onDocumentsChange,
  requiredDocTypes = [],
}) {
  const [docs, setDocs] = useState({});
  const [progressByKey, setProgressByKey] = useState({});
  const [uploadingKey, setUploadingKey] = useState("");
  const [localErrors, setLocalErrors] = useState({});
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!userProfile) return;
    setDocs((prev) => {
      const next = { ...prev };
      ALL_IDENTITY_DOC_FIELDS.forEach((key) => {
        next[key] = userProfile[key] || "";
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync whenever any tracked identity field changes
  }, ALL_IDENTITY_DOC_FIELDS.map((key) => userProfile?.[key]));

  useEffect(() => {
    onDocumentsChange?.(docs);
  }, [docs, onDocumentsChange]);

  const docGroups = useMemo(
    () =>
      requiredDocTypes.map((docType) => ({
        id: docType.key,
        title: docType.label,
        subtitle: docType.fields.length > 1 ? "Front & back photos" : "Photo of the document",
        icon: DOC_TYPE_ICONS[docType.key] || FileText,
        fields: docType.fields,
      })),
    [requiredDocTypes],
  );

  const requiredFieldKeys = useMemo(
    () => docGroups.flatMap((group) => group.fields),
    [docGroups],
  );
  const uploadedCount = useMemo(
    () => requiredFieldKeys.filter((key) => Boolean(String(docs[key] || "").trim())).length,
    [docs, requiredFieldKeys],
  );
  const totalCount = requiredFieldKeys.length;
  const allDone = totalCount > 0 && uploadedCount === totalCount;

  const handleUpload = async (key, file) => {
    const validationError = validateFile(file);
    if (validationError) {
      setLocalErrors((prev) => ({ ...prev, [key]: validationError }));
      toast.error(validationError);
      return;
    }
    setLocalErrors((prev) => ({ ...prev, [key]: undefined }));
    setUploadingKey(key);
    setProgressByKey((prev) => ({ ...prev, [key]: 0 }));
    try {
      const response = await userAPI.uploadIdentityDocument(file, key, {
        onUploadProgress: (event) => {
          const total = Number(event.total || 0);
          const loaded = Number(event.loaded || 0);
          const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
          setProgressByKey((prev) => ({ ...prev, [key]: pct }));
        },
      });
      const url =
        response?.data?.data?.url
        || response?.data?.url
        || response?.data?.data?.user?.[key]
        || "";
      if (!url) throw new Error("Upload failed");
      setDocs((prev) => ({ ...prev, [key]: url }));
      window.dispatchEvent(new Event("userAuthChanged"));
      toast.success("Saved to your profile");
    } catch (error) {
      const message = error?.response?.data?.message || "Could not upload document";
      setLocalErrors((prev) => ({ ...prev, [key]: message }));
      toast.error(message);
    } finally {
      setUploadingKey("");
      setProgressByKey((prev) => ({ ...prev, [key]: 0 }));
    }
  };

  return (
    <>
      <section className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-start gap-2.5 border-b border-gray-50 px-3 py-2.5 sm:px-3.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FF6A00]/10 text-[#FF6A00]">
            <IdCard className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold text-gray-900">Required documents</h2>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold",
                  allDone
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-orange-50 text-[#FF6A00]",
                )}
              >
                {uploadedCount}/{totalCount} uploaded
              </span>
            </div>
            <p className="mt-0.5 text-[10px] leading-snug text-gray-500">
              Upload once — reused automatically on future bookings
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  allDone ? "bg-emerald-500" : "bg-[#FF6A00]",
                )}
                style={{ width: `${totalCount ? (uploadedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 p-3 sm:p-3.5">
          {docGroups.length ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
                Carry these at pickup for this bike
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {docGroups.map((group) => (
                  <li
                    key={group.id}
                    className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200"
                  >
                    {group.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <label className="block min-w-0">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500">
              License number <span className="text-red-500">*</span>
            </span>
            <input
              value={licenseNumber}
              onChange={(event) => onLicenseChange?.(event.target.value)}
              placeholder="e.g. MH1420220012345"
              autoComplete="off"
              inputMode="text"
              className={cn(
                "w-full rounded-xl border bg-gray-50 px-3 py-2.5 text-sm font-semibold uppercase tracking-wide outline-none",
                "focus:border-[#FF6A00] focus:bg-white focus:ring-2 focus:ring-[#FF6A00]/15",
                licenseError ? "border-rose-300" : "border-gray-200",
              )}
            />
            {licenseError ? (
              <p className="mt-1 text-[11px] font-medium text-red-600">{licenseError}</p>
            ) : (
              <p className="mt-1 text-[10px] text-gray-400">
                Saved on your profile for next time
              </p>
            )}
          </label>

          {docGroups.map((group) => {
            const Icon = group.icon;
            const groupDone = group.fields.every((key) => Boolean(docs[key]));
            const isPaired = group.fields.length > 1;
            return (
              <div key={group.id} className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold text-gray-900">{group.title}</p>
                    <p className="text-[10px] text-gray-400">{group.subtitle}</p>
                  </div>
                  {groupDone ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : null}
                </div>

                <div className={cn("grid gap-2.5 sm:gap-3", isPaired ? "grid-cols-2" : "grid-cols-1")}>
                  {group.fields.map((key, index) => {
                    const label = isPaired ? (index === 0 ? "Front" : "Back") : group.title;
                    return (
                      <DocSlot
                        key={key}
                        label={label}
                        url={docs[key]}
                        error={localErrors[key] || errors[key]}
                        progress={progressByKey[key]}
                        uploading={uploadingKey === key}
                        onUpload={(file) => handleUpload(key, file)}
                        onPreview={() => setPreview({ url: docs[key], label: isPaired ? `${group.title} · ${label}` : group.title })}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {preview?.url ? (
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-black/92"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreview(null)}
        >
          <div className="flex items-center justify-between gap-3 px-3 py-3 sm:px-5">
            <p className="truncate text-xs font-semibold text-white/85">
              {preview.label || "Document preview"}
            </p>
            <button
              type="button"
              aria-label="Close preview"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white"
              onClick={() => setPreview(null)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div
            className="flex min-h-0 flex-1 items-center justify-center px-3 pb-8"
            onClick={(event) => event.stopPropagation()}
          >
            {isPdfUrl(preview.url) ? (
              <iframe
                title="Document preview"
                src={preview.url}
                className="h-full max-h-[80dvh] w-full max-w-3xl rounded-xl bg-white"
              />
            ) : (
              <img
                src={preview.url}
                alt={preview.label || "Document preview"}
                className="max-h-[80dvh] max-w-full rounded-xl object-contain"
              />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
