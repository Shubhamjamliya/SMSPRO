import { useId, useRef, useState } from "react";
import { FileUp, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import Button from "@/shared/components/ui/Button";
import { uploadAPI } from "@/services/api";
import { cn } from "@/lib/utils";

const message = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);
const PDF_TYPE = "application/pdf";
const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

function makeLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function uploadSingleMediaFile(file, folder, allowVideo = false) {
  const response = await uploadAPI.uploadMedia(file, {
    folder,
    media: allowVideo,
  });
  const payload = response?.data?.data || response?.data || {};
  const url = payload.url;
  if (!url) throw new Error("Upload succeeded but no URL was returned");
  return {
    url: String(url),
    publicId: payload.publicId || "",
    resourceType:
      payload.resourceType
      || (String(file.type || "").startsWith("video/") ? "video" : "image"),
  };
}

/**
 * Upload deferred/local media items that still have a File.
 * Already-remote items are left unchanged. Throws on first failure.
 */
export async function uploadDeferredMediaItems(items = [], {
  folder = "bike-rent",
  allowVideo = false,
  onProgress,
} = {}) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const result = [];
  let uploaded = 0;
  const pending = list.filter((item) => item?.file instanceof File).length;

  for (const item of list) {
    if (item?.file instanceof File) {
      const remote = await uploadSingleMediaFile(item.file, folder, allowVideo);
      if (item.previewUrl?.startsWith?.("blob:")) {
        try { URL.revokeObjectURL(item.previewUrl); } catch { /* ignore */ }
      }
      result.push({
        url: remote.url,
        publicId: remote.publicId || "",
        resourceType: remote.resourceType || "image",
        angle: item.angle || "",
        caption: item.caption || "",
        name: item.name || item.file.name || "",
      });
      uploaded += 1;
      onProgress?.({ uploaded, total: pending });
    } else if (item?.url && !String(item.url).startsWith("blob:")) {
      result.push({
        url: String(item.url),
        publicId: item.publicId || "",
        resourceType: item.resourceType || "",
        angle: item.angle || "",
        caption: item.caption || "",
        name: item.name || "",
      });
    }
  }
  return result;
}

function isImageUrl(url = "", resourceType = "", fileType = "") {
  if (resourceType === "video" || String(fileType).startsWith("video/")) return false;
  if (String(fileType).startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|heic|heif)(\?|$)/i.test(url)
    || /\/image\/upload\//i.test(url)
    || String(url).startsWith("blob:");
}

function isVideoUrl(url = "", resourceType = "", fileType = "") {
  if (resourceType === "video" || String(fileType).startsWith("video/")) return true;
  return /\.(mp4|webm|mov|avi)(\?|$)/i.test(url)
    || /\/video\/upload\//i.test(url);
}

function validateSelectedFile(file, { allowVideo, acceptPdf, videoOnly, imageOnly }) {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "file");

  if (!videoOnly && (IMAGE_TYPES.has(type) || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(name))) {
    if (file.size > MAX_IMAGE_BYTES) {
      return `${name} is too large. Images must be under 5MB.`;
    }
    return null;
  }
  if (!videoOnly && !imageOnly && acceptPdf && (type === PDF_TYPE || /\.pdf$/i.test(name))) {
    if (file.size > MAX_PDF_BYTES) {
      return `${name} is too large. PDFs must be under 5MB.`;
    }
    return null;
  }
  if (
    !imageOnly
    && allowVideo
    && (VIDEO_TYPES.has(type) || /\.(mp4|webm|mov)$/i.test(name))
  ) {
    if (file.size > MAX_VIDEO_BYTES) {
      return `${name} is too large. Videos must be under 50MB.`;
    }
    return null;
  }
  if (videoOnly) return `${name} must be a video (MP4, WEBM, or MOV).`;
  if (imageOnly) return `${name} must be an image (JPG, PNG, or WEBP).`;
  return `${name} has an unsupported file type.`;
}

function normalizeIncomingValue(value, { multiple, structured, angle }) {
  if (structured) {
    if (Array.isArray(value)) {
      return value.filter((item) => item?.url || item?.file || item?.previewUrl);
    }
    if (value && typeof value === "object" && (value.url || value.file || value.previewUrl)) {
      return [value];
    }
    return [];
  }
  const urls = multiple
    ? String(value || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
    : String(value || "").trim()
      ? [String(value).trim()]
      : [];
  return urls.map((url) => ({ url, publicId: "", resourceType: "", angle }));
}

/**
 * Admin media field.
 * - Default: uploads immediately on file select.
 * - deferUpload: keeps File locally + blob preview; parent uploads on submit.
 */
export default function MediaUploadField({
  label,
  value = "",
  onChange,
  folder = "bike-rent",
  accept = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf",
  multiple = false,
  disabled = false,
  helperText,
  className,
  allowVideo = false,
  videoOnly = false,
  imageOnly = false,
  valueAsObjects = false,
  deferUpload = false,
  angle = "",
  maxFiles = 12,
  error,
}) {
  const inputId = useId();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const structured = valueAsObjects || deferUpload;
  const acceptPdf = !imageOnly && !videoOnly && String(accept).includes("pdf");
  const resolvedAccept = videoOnly
    ? "video/mp4,video/webm,video/quicktime"
    : imageOnly
      ? "image/jpeg,image/png,image/webp,image/heic,image/heif"
      : allowVideo
        ? `${accept},video/mp4,video/webm,video/quicktime`
        : accept;

  const items = normalizeIncomingValue(value, {
    multiple,
    structured,
    angle,
  });

  const emit = (nextItems) => {
    if (structured) {
      if (multiple || valueAsObjects || (deferUpload && multiple)) {
        onChange?.(nextItems);
      } else if (deferUpload && !multiple) {
        onChange?.(nextItems[0] || null);
      } else {
        onChange?.(nextItems);
      }
      return;
    }
    const urls = nextItems.map((item) => item.url).filter(Boolean);
    if (multiple) onChange?.(urls.join(", "));
    else onChange?.(urls[0] || "");
  };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    for (const file of files) {
      const invalid = validateSelectedFile(file, {
        allowVideo: allowVideo || videoOnly,
        acceptPdf,
        videoOnly,
        imageOnly,
      });
      if (invalid) {
        toast.error(invalid);
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
    }

    if (!multiple && files.length > 1) {
      toast.error("Only one file is allowed for this field");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    const room = multiple ? Math.max(0, maxFiles - items.length) : 1;
    if (multiple && files.length > room) {
      toast.error(`You can add up to ${maxFiles} files`);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    if (deferUpload) {
      const localItems = files.slice(0, room).map((file) => {
        const previewUrl = URL.createObjectURL(file);
        return {
          localId: makeLocalId(),
          file,
          previewUrl,
          url: previewUrl,
          publicId: "",
          resourceType: String(file.type || "").startsWith("video/")
            ? "video"
            : String(file.type || "").startsWith("image/")
              ? "image"
              : "raw",
          angle: angle || "other",
          caption: "",
          name: file.name,
          isLocal: true,
        };
      });
      if (multiple || valueAsObjects) emit([...items, ...localItems]);
      else emit(localItems);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files.slice(0, room)) {
        const media = await uploadSingleMediaFile(file, folder, allowVideo || videoOnly);
        uploaded.push({
          ...media,
          angle: angle || "other",
          caption: "",
          name: file.name,
        });
      }
      if (multiple || valueAsObjects) {
        emit(multiple ? [...items, ...uploaded] : uploaded);
      } else {
        emit(uploaded);
      }
      toast.success(uploaded.length > 1 ? `${uploaded.length} files uploaded` : "File uploaded");
    } catch (err) {
      toast.error(message(err, "Failed to upload file"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeAt = (index) => {
    const target = items[index];
    const blob = target?.previewUrl || (target?.isLocal ? target?.url : "");
    if (blob?.startsWith?.("blob:")) {
      try { URL.revokeObjectURL(blob); } catch { /* ignore */ }
    }
    emit(items.filter((_, i) => i !== index));
  };

  const atMax = multiple && items.length >= maxFiles;
  const showDropzone = items.length === 0;
  const showAddTile = multiple && items.length > 0 && !atMax;

  const openPicker = () => {
    if (disabled || uploading) return;
    if (atMax) return;
    fileRef.current?.click();
  };

  return (
    <div className={cn("space-y-1.5 min-w-0", className)}>
      {(label || helperText) ? (
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          {label ? <p className="text-xs font-semibold text-slate-800">{label}</p> : <span />}
          {helperText ? <p className="truncate text-[11px] text-slate-500">{helperText}</p> : null}
        </div>
      ) : null}
      {error && String(error).trim() ? (
        <p className="text-xs font-medium text-red-600">{error}</p>
      ) : null}

      <input
        id={inputId}
        ref={fileRef}
        type="file"
        className="hidden"
        accept={resolvedAccept}
        multiple={multiple}
        disabled={disabled || uploading}
        onChange={(event) => handleFiles(event.target.files)}
      />

      {/* Empty state — compact dropzone */}
      {showDropzone ? (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={openPicker}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl border border-dashed px-3 py-2.5 text-left transition-colors",
            error
              ? "border-red-300 bg-red-50/40"
              : "border-slate-300 bg-slate-50 hover:border-orange-400 hover:bg-orange-50/50",
            (disabled || uploading) && "pointer-events-none opacity-60",
          )}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-orange-600" />
          ) : (
            <Upload className="h-4 w-4 shrink-0 text-orange-600" />
          )}
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-slate-800">
              {uploading
                ? "Uploading…"
                : videoOnly
                  ? "Upload video"
                  : multiple
                    ? "Add photos"
                    : "Add file"}
            </span>
            <span className="block text-[10px] text-slate-500">
              {videoOnly
                ? "MP4 · max 50MB"
                : multiple
                  ? `JPG/PNG · up to ${maxFiles}`
                  : acceptPdf
                    ? "JPG/PNG/PDF · max 5MB"
                    : "JPG/PNG · max 5MB"}
            </span>
          </span>
        </button>
      ) : null}

      {/* Filled state — compact previews; no large re-upload box */}
      {items.length > 0 ? (
        <div
          className={cn(
            multiple
              ? "grid grid-cols-4 gap-1.5 sm:grid-cols-5"
              : "flex flex-wrap gap-1.5",
          )}
        >
          {items.map((item, index) => {
            const preview = item.previewUrl || item.url || "";
            const fileType = item.file?.type || "";
            const isVideo = isVideoUrl(preview, item.resourceType, fileType);
            const isImage = isImageUrl(preview, item.resourceType, fileType);

            return (
              <div
                key={item.localId || `${preview}-${index}`}
                className={cn(
                  "group relative overflow-hidden rounded-lg border border-slate-200 bg-white",
                  multiple ? "aspect-square" : "flex h-16 w-full max-w-full items-center gap-2 p-1.5 sm:max-w-xs",
                )}
              >
                {multiple ? (
                  <>
                    {isVideo ? (
                      <video src={preview} className="h-full w-full object-cover bg-slate-100" muted />
                    ) : isImage ? (
                      <img src={preview} alt="" className="h-full w-full object-cover bg-slate-100" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-500">
                        <FileUp size={16} />
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={disabled || uploading}
                      onClick={() => removeAt(index)}
                      className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                    {item.isLocal || item.file ? (
                      <span className="absolute bottom-1 left-1 rounded bg-amber-500/90 px-1 py-px text-[9px] font-bold text-white">
                        New
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    {isVideo ? (
                      <video
                        src={preview}
                        className="h-12 w-12 shrink-0 rounded-md object-cover bg-slate-100"
                        muted
                      />
                    ) : isImage ? (
                      <img
                        src={preview}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-md object-cover bg-slate-100"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                        <FileUp size={16} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-800">
                        {item.name || preview.split("/").pop() || "Selected file"}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {item.isLocal || item.file ? "Uploads on save" : "Added"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-xs text-slate-600"
                        disabled={disabled || uploading}
                        onClick={openPicker}
                      >
                        Change
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-red-600"
                        disabled={disabled || uploading}
                        onClick={() => removeAt(index)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {showAddTile ? (
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={openPicker}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500 transition-colors",
                "hover:border-orange-400 hover:bg-orange-50/60 hover:text-orange-600",
                (disabled || uploading) && "pointer-events-none opacity-60",
              )}
              aria-label="Add more photos"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span className="text-[10px] font-semibold">Add</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {multiple && items.length > 0 ? (
        <p className="text-[10px] text-slate-500">
          {items.length}/{maxFiles} photos
          {atMax ? " · limit reached" : ""}
        </p>
      ) : null}
    </div>
  );
}
