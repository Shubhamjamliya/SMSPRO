import { Camera, Image as ImageIcon, Loader2, User, X } from "lucide-react";
import { cn } from "@food/utils/utils";

export function ProfileCompactHeader({
  name,
  driverId,
  city,
  phone,
  photoUrl,
  isOnline = false,
  verificationLabel = "Pending",
  verificationTone = "pending",
  uploading = false,
  onCamera,
  onGallery,
  onRemovePhoto,
  onClick,
  className,
}) {
  const toneClass =
    verificationTone === "approved"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : verificationTone === "rejected"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-amber-50 text-amber-800 border-amber-200";

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-3 shadow-sm",
        onClick ? "cursor-pointer active:bg-slate-50" : "",
        className,
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={name || "Profile"}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-6 h-6 text-slate-400" />
            )}
            {uploading ? (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              </div>
            ) : null}
          </div>
          {(onCamera || onGallery || onRemovePhoto) && (
            <div
              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              {onCamera ? (
                <button
                  type="button"
                  onClick={onCamera}
                  className="w-6 h-6 rounded-md bg-slate-900 text-white flex items-center justify-center shadow"
                  aria-label="Take photo"
                >
                  <Camera className="w-3 h-3" />
                </button>
              ) : null}
              {onGallery ? (
                <button
                  type="button"
                  onClick={onGallery}
                  className="w-6 h-6 rounded-md bg-primary-orange text-white flex items-center justify-center shadow"
                  aria-label="Gallery"
                >
                  <ImageIcon className="w-3 h-3" />
                </button>
              ) : null}
              {onRemovePhoto && photoUrl ? (
                <button
                  type="button"
                  onClick={onRemovePhoto}
                  className="w-6 h-6 rounded-md bg-red-500 text-white flex items-center justify-center shadow"
                  aria-label="Remove photo"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate leading-tight">
                {name || "Driver"}
              </h2>
              <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">
                {driverId || "ID pending"}
                {city ? ` · ${city}` : ""}
              </p>
              {phone ? (
                <p className="text-[11px] font-semibold text-slate-600 mt-0.5">
                  {phone}
                </p>
              ) : null}
            </div>
            <span
              className={cn(
                "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                isOnline
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-500",
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-400",
                )}
              />
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                toneClass,
              )}
            >
              {verificationLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
