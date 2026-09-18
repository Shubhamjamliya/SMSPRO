import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Camera,
  FlipHorizontal,
  Loader2,
  RefreshCw,
  SwitchCamera,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import Button from "@/shared/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { uploadSingleMediaFile } from "./MediaUploadField";

const message = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  });
}

function blobToFile(blob, name = `inspection-${Date.now()}.jpg`) {
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}

/**
 * Camera-only image capture for hub inspections.
 * Uses getUserMedia (webcam / phone camera) — no gallery / file picker.
 */
export default function CameraCaptureField({
  label = "Inspection photos",
  value = [],
  onChange,
  folder = "bike-rent/inspections",
  maxFiles = 12,
  disabled = false,
  required = false,
  error = "",
  helperText = "Capture clear photos with the device camera",
  className,
}) {
  const titleId = useId();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [facingMode, setFacingMode] = useState("environment");
  const [hasFront, setHasFront] = useState(false);
  const [hasBack, setHasBack] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [snapshotUrl, setSnapshotUrl] = useState("");
  const [snapshotBlob, setSnapshotBlob] = useState(null);
  const [uploading, setUploading] = useState(false);

  const items = Array.isArray(value) ? value.filter((item) => item?.url) : [];
  const atMax = items.length >= maxFiles;
  const canSwitch = hasFront && hasBack;

  const emit = useCallback(
    (next) => {
      onChange?.(next);
    },
    [onChange],
  );

  const releaseCamera = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const clearSnapshot = useCallback(() => {
    if (snapshotUrl?.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(snapshotUrl);
      } catch {
        /* ignore */
      }
    }
    setSnapshotUrl("");
    setSnapshotBlob(null);
  }, [snapshotUrl]);

  const startCamera = useCallback(async (preferredFacing = facingMode) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera is not supported in this browser. Use Chrome or Edge over HTTPS.");
      return;
    }

    setStarting(true);
    setCameraError("");
    clearSnapshot();
    releaseCamera();

    const tryConstraints = async (facing) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      return stream;
    };

    try {
      let stream;
      try {
        stream = await tryConstraints(preferredFacing);
        setFacingMode(preferredFacing);
      } catch {
        const fallback = preferredFacing === "environment" ? "user" : "environment";
        stream = await tryConstraints(fallback);
        setFacingMode(fallback);
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === "videoinput");
        const labels = cams.map((d) => String(d.label || "").toLowerCase());
        const front = labels.some((l) => /front|user|face/.test(l)) || cams.length > 1;
        const back = labels.some((l) => /back|rear|environment|world/.test(l)) || cams.length > 1;
        setHasFront(front || cams.length > 0);
        setHasBack(back || cams.length > 0);
      } catch {
        setHasFront(true);
        setHasBack(true);
      }
    } catch (err) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setCameraError("Camera permission denied. Allow camera access and try again.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setCameraError("No camera found on this device.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setCameraError("Camera is in use by another app. Close it and retry.");
      } else {
        setCameraError(message(err, "Could not open the camera."));
      }
    } finally {
      setStarting(false);
    }
  }, [facingMode, clearSnapshot, releaseCamera]);

  useEffect(() => {
    if (!open) {
      releaseCamera();
      clearSnapshot();
      setCameraError("");
      return undefined;
    }
    startCamera(facingMode);
    return () => {
      releaseCamera();
    };
    // Only re-run when dialog opens/closes — facing switches call startCamera directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => {
    releaseCamera();
    if (snapshotUrl?.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(snapshotUrl);
      } catch {
        /* ignore */
      }
    }
  }, [releaseCamera, snapshotUrl]);

  const openCamera = () => {
    if (disabled || uploading || atMax) return;
    setOpen(true);
  };

  const closeCamera = () => {
    if (uploading) return;
    setOpen(false);
  };

  const switchCamera = async () => {
    if (!canSwitch || starting || uploading || snapshotBlob) return;
    const next = facingMode === "environment" ? "user" : "environment";
    await startCamera(next);
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !streamRef.current || starting) return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    if (!width || !height) {
      toast.error("Camera is still starting. Try again in a moment.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("Could not capture photo");
      return;
    }
    ctx.save();
    if (facingMode === "user") {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("Could not capture photo");
          return;
        }
        if (blob.size > MAX_IMAGE_BYTES) {
          toast.error("Captured photo is too large (max 5MB). Try again.");
          return;
        }
        clearSnapshot();
        const url = URL.createObjectURL(blob);
        setSnapshotBlob(blob);
        setSnapshotUrl(url);
      },
      "image/jpeg",
      0.92,
    );
  };

  const retake = () => {
    clearSnapshot();
  };

  const usePhoto = async () => {
    if (!snapshotBlob || uploading || atMax) return;
    setUploading(true);
    try {
      const file = blobToFile(snapshotBlob);
      const media = await uploadSingleMediaFile(file, folder, false);
      emit([
        ...items,
        {
          ...media,
          angle: "other",
          caption: "",
          name: file.name,
        },
      ]);
      toast.success("Photo added");
      clearSnapshot();
      if (items.length + 1 >= maxFiles) {
        setOpen(false);
      }
    } catch (err) {
      toast.error(message(err, "Failed to upload photo"));
    } finally {
      setUploading(false);
    }
  };

  const removeAt = (index) => {
    if (disabled || uploading) return;
    emit(items.filter((_, i) => i !== index));
  };

  return (
    <div className={cn("space-y-1.5 min-w-0", className)}>
      {(label || helperText) ? (
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          {label ? (
            <p className="text-xs font-semibold text-slate-800">
              {label}
              {required ? <span className="text-red-500"> *</span> : null}
            </p>
          ) : <span />}
          {helperText ? (
            <p className="truncate text-[11px] text-slate-500">{helperText}</p>
          ) : null}
        </div>
      ) : null}

      {error && String(error).trim() ? (
        <p className="text-xs font-medium text-red-600">{error}</p>
      ) : null}

      {items.length === 0 ? (
        <button
          type="button"
          disabled={disabled || uploading || atMax}
          onClick={openCamera}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl border border-dashed px-3 py-3 text-left transition-colors",
            error
              ? "border-red-300 bg-red-50/40"
              : "border-slate-300 bg-slate-50 hover:border-orange-400 hover:bg-orange-50/50",
            (disabled || uploading) && "pointer-events-none opacity-60",
          )}
        >
          <Camera className="h-5 w-5 shrink-0 text-orange-600" />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-slate-800">
              Open camera
            </span>
            <span className="block text-[10px] text-slate-500">
              Live preview · front / rear · no gallery upload
            </span>
          </span>
        </button>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2">
            {items.map((item, index) => (
              <div
                key={`${item.url}-${index}`}
                className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
              >
                <img
                  src={item.url}
                  alt={`Inspection ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  disabled={disabled || uploading}
                  onClick={() => removeAt(index)}
                  className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white"
                  aria-label="Remove photo"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {!atMax ? (
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={openCamera}
                className={cn(
                  "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500 transition-colors",
                  "hover:border-orange-400 hover:bg-orange-50/60 hover:text-orange-600",
                  (disabled || uploading) && "pointer-events-none opacity-60",
                )}
              >
                <Camera className="h-4 w-4" />
                <span className="text-[10px] font-semibold">Capture</span>
              </button>
            ) : null}
          </div>
          <p className="text-[10px] text-slate-500">
            {items.length}/{maxFiles} photos
            {atMax ? " · limit reached" : " · camera only"}
          </p>
        </div>
      )}

      <Dialog open={open} onOpenChange={(next) => !next && closeCamera()}>
        <DialogContent
          className="just-order-theme-scope flex w-[calc(100vw-0.75rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl"
          onPointerDownOutside={(event) => uploading && event.preventDefault()}
          onEscapeKeyDown={(event) => uploading && event.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b border-slate-100 px-4 py-3 pr-12 text-left">
            <DialogTitle id={titleId} className="text-base">
              Capture inspection photo
            </DialogTitle>
            <p className="mt-0.5 text-xs text-slate-500">
              Preview the bike, capture, then confirm. Gallery upload is disabled.
            </p>
          </DialogHeader>

          <div className="relative bg-slate-950">
            {snapshotUrl ? (
              <img
                src={snapshotUrl}
                alt="Captured preview"
                className="aspect-[4/3] w-full object-contain bg-black"
              />
            ) : (
              <video
                ref={videoRef}
                className={cn(
                  "aspect-[4/3] w-full bg-black object-cover",
                  facingMode === "user" && "scale-x-[-1]",
                )}
                playsInline
                muted
                autoPlay
              />
            )}

            {(starting || uploading) ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            ) : null}

            {cameraError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center">
                <Camera className="h-8 w-8 text-slate-500" />
                <p className="text-sm text-slate-200">{cameraError}</p>
                <Button type="button" size="sm" onClick={() => startCamera(facingMode)}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-100 bg-white px-4 py-3">
            {snapshotUrl ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={uploading}
                  onClick={retake}
                >
                  <FlipHorizontal className="mr-1.5 h-4 w-4" />
                  Retake
                </Button>
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={uploading}
                  onClick={usePhoto}
                >
                  {uploading ? "Uploading…" : "Use photo"}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={starting || uploading || !canSwitch}
                  onClick={switchCamera}
                  title="Switch camera"
                >
                  <SwitchCamera className="mr-1.5 h-4 w-4" />
                  {facingMode === "environment" ? "Front" : "Rear"}
                </Button>
                <button
                  type="button"
                  disabled={starting || Boolean(cameraError) || uploading}
                  onClick={captureFrame}
                  className="inline-flex h-14 w-14 items-center justify-center rounded-full border-4 border-orange-200 bg-[#FF6A00] text-white shadow-lg transition hover:bg-orange-600 disabled:opacity-50"
                  aria-label="Capture photo"
                >
                  <Camera className="h-6 w-6" />
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploading}
                  onClick={closeCamera}
                >
                  <X className="mr-1 h-4 w-4" />
                  Done
                </Button>
              </div>
            )}
            <p className="text-center text-[10px] text-slate-500">
              Using {facingMode === "environment" ? "rear" : "front"} camera
              {canSwitch ? " · tap switch to flip" : ""}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
