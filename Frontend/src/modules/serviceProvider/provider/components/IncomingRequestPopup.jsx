import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Calendar, Clock, Loader2, MapPin, Sparkles, User } from "lucide-react";
import { useServiceProviderRealtime } from "../context/ServiceProviderRealtimeContext";
import serviceProviderApi from "../services/providerApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

function Countdown({ respondBy }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor((new Date(respondBy).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(Math.max(0, Math.floor((new Date(respondBy).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [respondBy]);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return (
    <span className={`text-xs font-bold ${remaining < 30 ? "text-red-500" : "text-gray-400"}`}>
      {remaining > 0 ? `${mins}:${String(secs).padStart(2, "0")} left to respond` : "Expiring…"}
    </span>
  );
}

/**
 * Rendered once at the ServiceProviderLayout level so it floats above whichever page
 * is currently open — suppressed only on the Incoming Requests page itself, since that
 * page already shows the same request in its full list with the same actions.
 */
export default function IncomingRequestPopup() {
  const { queue, removeFromQueue } = useServiceProviderRealtime();
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const current = queue[0];
  const onRequestsPage = location.pathname.startsWith("/service-provider/requests");

  if (!current || onRequestsPage) return null;

  const respondBy = current?.dispatch?.respondBy || current?.respondBy;

  const accept = async () => {
    setBusy(true);
    try {
      await serviceProviderApi.acceptRequest(current._id);
      toast.success("Request accepted");
      removeFromQueue(current._id);
      navigate("/service-provider/jobs");
    } catch (error) {
      toast.error(error?.response?.data?.message || "This request is no longer available");
      removeFromQueue(current._id);
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true);
    try {
      await serviceProviderApi.rejectRequest(current._id);
      toast.message("Request declined");
    } catch {
      // already handled/expired — nothing more to do
    } finally {
      removeFromQueue(current._id);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-700 flex justify-center px-4 pb-4 sm:bottom-6 sm:px-6">
      <div className="w-full max-w-sm rounded-3xl border border-gray-100 bg-white p-4 shadow-2xl ring-1 ring-black/5">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#FF6A00]">
              <Sparkles className="h-3.5 w-3.5" /> New booking request
            </p>
            <p className="mt-1 font-extrabold text-gray-900">{current.serviceName}</p>
            <p className="text-xs text-gray-400">{current.categoryName}</p>
          </div>
          {respondBy ? <Countdown respondBy={respondBy} /> : null}
        </div>

        <div className="space-y-1 text-sm text-gray-600">
          <p className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-gray-400" /> {current.date}
            <Clock className="ml-1.5 h-3.5 w-3.5 text-gray-400" /> {current.startTime}
          </p>
          <p className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-gray-400" /> {current.customerName}
          </p>
          {current.serviceLocation?.address ? (
            <p className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" /> {current.serviceLocation.address}
            </p>
          ) : null}
        </div>

        <p className="mt-2 text-lg font-black text-[#FF6A00]">{money(current.providerPrice)}</p>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={reject}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-600 disabled:opacity-60"
          >
            Decline
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={accept}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#FF6A00] py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Accept
          </button>
        </div>

        {queue.length > 1 ? (
          <p className="mt-2 text-center text-[11px] text-gray-400">+{queue.length - 1} more waiting</p>
        ) : null}
      </div>
    </div>
  );
}
