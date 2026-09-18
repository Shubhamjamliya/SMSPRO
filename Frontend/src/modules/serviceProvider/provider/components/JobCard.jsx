import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Calendar,
  Camera,
  Clock,
  IndianRupee,
  KeyRound,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  X,
} from "lucide-react";
import serviceProviderApi from "../services/providerApi";

export const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

export const ACTIVE_STATUSES = [
  "assigned", "provider_on_the_way", "provider_arrived", "service_started",
  "service_completed", "customer_confirmed",
];

export const STATUS_LABELS = {
  assigned: "Assigned",
  provider_on_the_way: "On the way",
  provider_arrived: "Arrived",
  service_started: "In progress",
  service_completed: "Awaiting customer confirmation",
  customer_confirmed: "Awaiting payment",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-600 flex items-center justify-center bg-black/30 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-3xl border border-gray-100 bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PhotoPicker({ label, photos, onChange }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const result = await serviceProviderApi.uploadMedia(file);
      onChange([...photos, { url: result.url, publicId: result.publicId }]);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <p className="mb-1.5 text-xs font-bold text-gray-600">{label}</p>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          <div key={i} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-200">
            <img src={p.url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, idx) => idx !== i))}
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-400 hover:border-[#FF6A00] hover:text-[#FF6A00] disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </button>
        <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={pick} className="hidden" />
      </div>
    </div>
  );
}

export default function JobCard({ booking, busy, onAction, onCancel, onExtraCharge }) {
  const [otp, setOtp] = useState("");
  const [beforePhotos, setBeforePhotos] = useState([]);
  const [afterPhotos, setAfterPhotos] = useState([]);
  const [notes, setNotes] = useState("");
  const [extraOpen, setExtraOpen] = useState(false);
  const [extraDesc, setExtraDesc] = useState("");
  const [extraAmount, setExtraAmount] = useState("");

  const pendingExtra = (booking.extraCharges || []).filter((c) => c.status === "pending");

  const submitExtra = async () => {
    const amount = Number(extraAmount);
    if (!extraDesc.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a description and a valid amount");
      return;
    }
    await onExtraCharge(booking._id, { description: extraDesc.trim(), amount });
    setExtraOpen(false);
    setExtraDesc("");
    setExtraAmount("");
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-900">{booking.serviceName}</p>
          <p className="text-xs text-gray-400">{booking.categoryName}</p>
        </div>
        <span className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase text-[#FF6A00]">
          {STATUS_LABELS[booking.status] || booking.status}
        </span>
      </div>

      <div className="space-y-1 text-sm text-gray-600">
        <p className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-gray-400" /> {booking.date}
          <Clock className="ml-1.5 h-3.5 w-3.5 text-gray-400" /> {booking.startTime}
        </p>
        <p className="flex items-center gap-1.5 font-semibold text-gray-800">
          {booking.customerName}
          {booking.customerPhone ? (
            <a href={`tel:${booking.customerPhone}`} className="inline-flex items-center gap-1 text-[#FF6A00]">
              <Phone className="h-3.5 w-3.5" /> {booking.customerPhone}
            </a>
          ) : null}
        </p>
        {booking.serviceLocation?.address ? (
          <p className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" /> {booking.serviceLocation.address}
          </p>
        ) : null}
        {booking.serviceLocation ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${booking.serviceLocation.lat},${booking.serviceLocation.lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-bold text-[#FF6A00]"
          >
            <Navigation className="h-3.5 w-3.5" /> Open in Maps
          </a>
        ) : null}
      </div>

      <p className="mt-2 text-lg font-black text-[#FF6A00]">{money(booking.providerPrice)}</p>

      {pendingExtra.length > 0 ? (
        <div className="mt-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">
          {pendingExtra.length} extra charge{pendingExtra.length > 1 ? "s" : ""} awaiting customer approval
        </div>
      ) : null}

      {booking.status === "assigned" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction(booking._id, "on-the-way")}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6A00] py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Mark on the way
        </button>
      ) : null}

      {booking.status === "provider_on_the_way" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction(booking._id, "arrived")}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6A00] py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Mark arrived
        </button>
      ) : null}

      {booking.status === "provider_arrived" ? (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
            <KeyRound className="h-3.5 w-3.5" /> Ask the customer for their 6-digit OTP
          </p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder="Enter OTP"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-center text-lg font-black tracking-[0.3em] outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/15"
          />
          <PhotoPicker label="Before-service photo" photos={beforePhotos} onChange={setBeforePhotos} />
          <button
            type="button"
            disabled={busy || otp.length !== 6 || beforePhotos.length === 0}
            onClick={() => onAction(booking._id, "start", { otp, beforePhotos })}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6A00] py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Start service
          </button>
        </div>
      ) : null}

      {booking.status === "service_started" ? (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          {extraOpen ? (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3">
              <input
                type="text"
                value={extraDesc}
                onChange={(e) => setExtraDesc(e.target.value)}
                placeholder="What extra work is needed?"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00]"
              />
              <input
                type="number"
                min="1"
                value={extraAmount}
                onChange={(e) => setExtraAmount(e.target.value)}
                placeholder="Amount (₹)"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00]"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setExtraOpen(false)} className="flex-1 rounded-lg border border-gray-200 py-2 text-xs font-bold text-gray-600">
                  Cancel
                </button>
                <button type="button" onClick={submitExtra} className="flex-1 rounded-lg bg-[#FF6A00] py-2 text-xs font-bold text-white">
                  Send to customer
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setExtraOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:border-[#FF6A00] hover:text-[#FF6A00]"
            >
              <IndianRupee className="h-3.5 w-3.5" /> Add extra charge
            </button>
          )}

          <PhotoPicker label="After-service photo" photos={afterPhotos} onChange={setAfterPhotos} />
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Completion notes (optional)"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/15"
          />
          <button
            type="button"
            disabled={busy || afterPhotos.length === 0}
            onClick={() => onAction(booking._id, "complete", { afterPhotos, completionNotes: notes })}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6A00] py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Mark service complete
          </button>
        </div>
      ) : null}

      {["service_completed", "customer_confirmed"].includes(booking.status) ? (
        <p className="mt-3 rounded-xl bg-gray-50 p-2.5 text-center text-xs text-gray-500">
          Waiting on the customer — nothing more to do here.
        </p>
      ) : null}

      {["assigned", "provider_on_the_way", "provider_arrived"].includes(booking.status) ? (
        <button
          type="button"
          onClick={() => onCancel(booking)}
          className="mt-2 w-full rounded-xl border border-red-200 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
        >
          Cancel this booking
        </button>
      ) : null}
    </div>
  );
}
