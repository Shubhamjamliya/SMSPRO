import MediaUploadField from "./MediaUploadField";
import CameraCaptureField from "./CameraCaptureField";

/**
 * Compact inspection uploads: photos + optional max 1 video.
 * Pickup mode: camera-only photos (required), video always optional.
 */
export default function InspectionMediaForm({
  images = [],
  videos = [],
  onImagesChange,
  onVideosChange,
  disabled = false,
  /** @deprecated Prefer requireImages — videos are never mandatory */
  required = false,
  requireImages = false,
  cameraOnlyImages = false,
  error = "",
}) {
  const imagesRequired = requireImages || required;
  const missingImages = imagesRequired && (images?.length || 0) < 1;

  return (
    <div className="space-y-3">
      {cameraOnlyImages ? (
        <CameraCaptureField
          label="Inspection photos"
          folder="bike-rent/inspections"
          maxFiles={12}
          value={images}
          onChange={onImagesChange}
          disabled={disabled}
          required={imagesRequired}
          error={missingImages ? error : ""}
          helperText="Camera only — live preview, front/rear switch, retake"
        />
      ) : (
        <MediaUploadField
          label="Inspection photos"
          folder="bike-rent/inspections"
          multiple
          maxFiles={12}
          imageOnly
          valueAsObjects
          value={images}
          onChange={onImagesChange}
          disabled={disabled}
          error={missingImages ? error : ""}
          helperText="Add clear photos of the bike (multiple allowed)"
        />
      )}

      <MediaUploadField
        label="Inspection video (optional)"
        folder="bike-rent/inspections"
        multiple={false}
        maxFiles={1}
        videoOnly
        allowVideo
        valueAsObjects
        value={videos?.[0] || null}
        onChange={(next) => {
          if (!next) {
            onVideosChange?.([]);
            return;
          }
          const item = Array.isArray(next) ? next[0] : next;
          onVideosChange?.(item ? [item] : []);
        }}
        disabled={disabled}
        helperText="Optional — skip if not needed · one short clip max"
      />
    </div>
  );
}

export function InspectionMediaGallery({ title, inspection }) {
  if (!inspection) {
    return (
      <p className="text-xs text-muted-foreground sm:text-sm">
        No {title?.toLowerCase() || "inspection"} record.
      </p>
    );
  }
  const media = [...(inspection.images || []), ...(inspection.videos || [])];
  if (!media.length) {
    return <p className="text-xs text-muted-foreground sm:text-sm">No media attached.</p>;
  }
  return (
    <section className="min-w-0 space-y-2">
      {title ? (
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h4>
      ) : null}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
        {media.map((item, index) => {
          const isVideo = item.resourceType === "video"
            || /\.(mp4|webm|mov)(\?|$)/i.test(item.url || "");
          return (
            <a
              key={`${item.url}-${index}`}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 sm:rounded-xl"
            >
              {isVideo ? (
                <video src={item.url} className="aspect-video w-full object-cover" muted playsInline />
              ) : (
                <img src={item.url} alt="" className="aspect-video w-full object-cover" />
              )}
              <p className="truncate px-1.5 py-1 text-[10px] font-medium capitalize text-slate-600 sm:px-2">
                {isVideo ? "video" : "photo"}
              </p>
            </a>
          );
        })}
      </div>
      {inspection.conditionNotes ? (
        <p className="text-xs leading-relaxed text-slate-600">{inspection.conditionNotes}</p>
      ) : null}
    </section>
  );
}
