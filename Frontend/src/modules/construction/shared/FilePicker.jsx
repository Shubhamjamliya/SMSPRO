import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, ImagePlus, Loader2, Upload, X } from "lucide-react";
import { uploadSingleMediaFile } from "@/modules/bikeRent/shared/components/MediaUploadField";

const message = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const IMAGE_TYPES = "image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif";
const DOC_TYPES = `${IMAGE_TYPES},application/pdf`;
const MAX_BYTES = 5 * 1024 * 1024;

const isPdf = (url) => String(url || "").toLowerCase().includes(".pdf");

/**
 * Real file upload for the construction module — pick from the device, straight
 * to Cloudinary, URL back.
 *
 * Wraps the platform's existing upload helper rather than reimplementing it, so
 * construction uses the same storage, folder convention and size rules as every
 * other module. Nobody pastes a URL in production.
 */
export function PhotoPicker({
  values = [],
  onChange,
  folder = "construction",
  max = 12,
  disabled = false,
  label = "Add photos",
  hint,
}) {
  const inputId = useId();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(0);

  const pick = async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;

    const room = max - values.length;
    if (room <= 0) {
      toast.error(`You can add up to ${max} photos`);
      return;
    }
    const batch = files.slice(0, room);
    if (files.length > room) toast.error(`Only the first ${room} were added — limit is ${max}`);

    const oversize = batch.find((f) => f.size > MAX_BYTES);
    if (oversize) {
      toast.error(`"${oversize.name}" is over 5MB. Pick a smaller image.`);
      return;
    }

    setUploading(batch.length);
    const uploaded = [];
    for (const file of batch) {
      try {
        const result = await uploadSingleMediaFile(file, folder, false);
        uploaded.push(result.url);
      } catch (error) {
        // Keep whatever succeeded — losing three good uploads because the
        // fourth failed would be worse than a partial result.
        toast.error(message(error, `Could not upload "${file.name}"`));
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
    if (uploaded.length) onChange([...values, ...uploaded]);
  };

  return (
    <div>
      {label ? (
        <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
      ) : null}
      {hint ? <p className="mb-2 text-xs leading-relaxed text-gray-500">{hint}</p> : null}

      {values.length ? (
        <ul className="mb-2.5 grid grid-cols-4 gap-2">
          {values.map((url, i) => (
            <li key={`${url}-${i}`} className="relative">
              {isPdf(url) ? (
                <div className="flex h-16 w-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-400">
                  <FileText className="h-5 w-5" />
                </div>
              ) : (
                <img src={url} alt="" className="h-16 w-full rounded-lg border border-gray-200 object-cover" />
              )}
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => onChange(values.filter((_, idx) => idx !== i))}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-gray-900 p-1 text-white shadow-sm"
                  aria-label="Remove photo"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={IMAGE_TYPES}
        multiple
        className="hidden"
        disabled={disabled || uploading > 0}
        onChange={pick}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading > 0 || values.length >= max}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-3.5 text-sm font-semibold text-gray-600 transition-colors hover:border-orange-300 hover:bg-orange-50/40 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading > 0 ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading {uploading}…
          </>
        ) : (
          <>
            <ImagePlus className="h-4 w-4" />
            {values.length >= max ? `Limit of ${max} reached` : "Choose photos"}
          </>
        )}
      </button>
    </div>
  );
}

/**
 * Single-file variant for documents — PAN, Aadhaar, licences.
 * Accepts PDFs as well as images, because that is what people actually have.
 */
export function DocumentPicker({
  value,
  onChange,
  folder = "construction/documents",
  disabled = false,
  label,
  required = false,
  error,
  hint,
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("That file is over 5MB. Pick a smaller one.");
      return;
    }
    setBusy(true);
    try {
      const result = await uploadSingleMediaFile(file, folder, false);
      onChange(result.url);
      toast.success("Uploaded");
    } catch (err) {
      toast.error(message(err, "Could not upload that file"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {label ? (
        <span className="mb-1.5 block text-sm font-medium text-gray-700">
          {label}
          {required ? <span className="ml-0.5 text-red-500">*</span> : null}
        </span>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={DOC_TYPES}
        className="hidden"
        disabled={disabled || busy}
        onChange={pick}
      />

      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-2.5">
          {isPdf(value) ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
              <FileText className="h-4.5 w-4.5" />
            </span>
          ) : (
            <img src={value} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-emerald-700">Uploaded</p>
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-gray-500 hover:underline"
            >
              View file
            </a>
          </div>
          {!disabled ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Replace
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
            error
              ? "border-red-300 text-red-600"
              : "border-gray-300 text-gray-600 hover:border-orange-300 hover:bg-orange-50/40 hover:text-orange-600"
          }`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Uploading…" : "Choose file or photo"}
        </button>
      )}

      {hint && !error ? <span className="mt-1 block text-xs text-gray-500">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
