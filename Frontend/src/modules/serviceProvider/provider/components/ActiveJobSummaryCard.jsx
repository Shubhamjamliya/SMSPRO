import { useState } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Calendar, Clock, MapPin, Navigation, Phone, Loader2 } from "lucide-react";
import serviceProviderApi from "../services/providerApi";
import { STATUS_LABELS, money } from "./JobCard";

// Only statuses reachable via a single, form-free POST get an inline quick action here;
// everything past provider_arrived needs OTP/photos/extra-charge/cancel, which stays
// on the Jobs page — the one place that runs that stateful logic, so it isn't
// duplicated across two mounted trees.
const QUICK_ACTION = {
  assigned: { api: "markOnTheWay", label: "On the way" },
  provider_on_the_way: { api: "markArrived", label: "Arrived" },
};

export default function ActiveJobSummaryCard({ booking, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const quick = QUICK_ACTION[booking.status];

  const runQuickAction = async () => {
    setBusy(true);
    try {
      await serviceProviderApi[quick.api](booking._id);
      toast.success("Updated");
      onUpdated?.();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not update this booking");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-900">{booking.serviceName}</p>
          <p className="text-xs text-gray-400">Customer: {booking.customerName}</p>
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

      <div className="mt-3 flex gap-2">
        {booking.customerPhone ? (
          <a
            href={`tel:${booking.customerPhone}`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2 text-xs font-bold text-gray-700 hover:border-[#FF6A00] hover:text-[#FF6A00]"
          >
            <Phone className="h-3.5 w-3.5" /> Reach customer
          </a>
        ) : null}
        {quick ? (
          <button
            type="button"
            disabled={busy}
            onClick={runQuickAction}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#FF6A00] py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {quick.label}
          </button>
        ) : null}
      </div>

      <Link
        to="/service-provider/jobs"
        className="mt-2 block text-center text-xs font-bold text-[#FF6A00] hover:underline"
      >
        View &amp; manage →
      </Link>
    </div>
  );
}
