import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Calendar, Clock, Inbox, Loader2, MapPin, Sparkles, User, Wifi, WifiOff } from "lucide-react";
import ServiceProviderLayout from "../components/ServiceProviderLayout";
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

/** This page renders directly off the shared ServiceProviderRealtimeContext queue —
 *  the same socket connection/ring loop that's active on every other provider page —
 *  rather than opening a second, page-scoped connection. */
export default function ServiceProviderIncomingRequestsPage() {
  const navigate = useNavigate();
  const { queue: requests, connected, removeFromQueue, refreshQueue } = useServiceProviderRealtime();
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  const accept = async (id) => {
    setBusyId(id);
    try {
      await serviceProviderApi.acceptRequest(id);
      toast.success("Request accepted");
      removeFromQueue(id);
      navigate("/service-provider/jobs");
    } catch (error) {
      toast.error(error?.response?.data?.message || "This request is no longer available");
      removeFromQueue(id);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id) => {
    setBusyId(id);
    try {
      await serviceProviderApi.rejectRequest(id);
      toast.message("Request declined");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not decline this request");
    } finally {
      removeFromQueue(id);
      setBusyId(null);
    }
  };

  return (
    <ServiceProviderLayout
      title="Incoming requests"
      subtitle="New booking requests waiting for your response"
      actions={
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            connected ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"
          }`}
        >
          {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {connected ? "Live" : "Reconnecting…"}
        </span>
      }
    >
      {requests.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
          <Inbox className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-600">No incoming requests right now</p>
          <p className="text-xs text-gray-400">New requests will appear here automatically.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {requests.map((r) => {
            const respondBy = r?.dispatch?.respondBy || r?.respondBy;
            const mode = r?.dispatch?.mode || r?.mode;
            return (
              <div key={r._id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-gray-900">{r.serviceName}</p>
                    <p className="text-xs text-gray-400">{r.categoryName}</p>
                  </div>
                  {mode === "auto" ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-[#FF6A00]">
                      <Sparkles className="h-3 w-3" /> Auto-matched
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                      <User className="h-3 w-3" /> Direct
                    </span>
                  )}
                </div>

                <div className="space-y-1 text-sm text-gray-600">
                  <p className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-gray-400" /> {r.date}
                    <Clock className="ml-1.5 h-3.5 w-3.5 text-gray-400" /> {r.startTime}
                  </p>
                  {r.serviceLocation?.address ? (
                    <p className="flex items-start gap-1.5">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" /> {r.serviceLocation.address}
                    </p>
                  ) : null}
                  <p className="font-bold text-gray-800">{r.customerName}</p>
                </div>

                <p className="mt-2 text-lg font-black text-[#FF6A00]">{money(r.providerPrice)}</p>
                {respondBy ? (
                  <div className="mt-1">
                    <Countdown respondBy={respondBy} />
                  </div>
                ) : null}

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === r._id}
                    onClick={() => reject(r._id)}
                    className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-600 disabled:opacity-60"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r._id}
                    onClick={() => accept(r._id)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#FF6A00] py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {busyId === r._id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Accept
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ServiceProviderLayout>
  );
}
