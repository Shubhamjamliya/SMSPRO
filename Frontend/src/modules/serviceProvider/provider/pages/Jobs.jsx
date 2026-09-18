import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2, Star } from "lucide-react";
import ServiceProviderLayout from "../components/ServiceProviderLayout";
import serviceProviderApi from "../services/providerApi";
import { useServiceProviderRealtime } from "../context/ServiceProviderRealtimeContext";
import JobCard, { Modal, ACTIVE_STATUSES, STATUS_LABELS, money } from "../components/JobCard";

const POLL_MS = 6000;

function RateCustomerWidget({ booking, onSubmit }) {
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  if (booking.customerRating?.stars) {
    return (
      <div className="mt-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={`h-3.5 w-3.5 ${n <= booking.customerRating.stars ? "fill-amber-400 text-amber-400" : "text-gray-200"}`}
          />
        ))}
        <span className="ml-1 text-[11px] text-gray-400">You rated this customer</span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#FF6A00] hover:underline"
      >
        <Star className="h-3.5 w-3.5" /> Rate this customer
      </button>
    );
  }

  const submit = async () => {
    if (!stars) {
      toast.error("Select a star rating");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(booking._id, { stars, comment });
      setOpen(false);
    } catch {
      // error toast already shown by the caller — keep the form open to retry
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
      <p className="mb-1.5 text-xs font-bold text-gray-600">Rate this customer</p>
      <div className="mb-2 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setStars(n)}>
            <Star className={`h-5 w-5 ${n <= stars ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
          </button>
        ))}
      </div>
      <textarea
        rows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Notes about this customer (optional)"
        className="mb-2 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-[#FF6A00]"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs font-bold text-gray-600"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#FF6A00] py-1.5 text-xs font-bold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Submit
        </button>
      </div>
    </div>
  );
}

export default function ServiceProviderJobsPage() {
  const [tab, setTab] = useState("active");
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const pollRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const list = await serviceProviderApi.getProviderBookings();
      setBookings(list);
    } catch (error) {
      if (!silent) toast.error(error?.response?.data?.message || "Could not load jobs");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [load]);

  // Instant refresh when the customer approves/declines an extra charge or confirms
  // completion — reuses the ONE shared socket connection from ServiceProviderLayout
  // (see ServiceProviderRealtimeContext) instead of opening a second one; the poll
  // interval above remains the DB-backed fallback.
  const { lastEventAt } = useServiceProviderRealtime();
  useEffect(() => {
    if (lastEventAt) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEventAt]);

  const handleAction = async (id, action, payload) => {
    setBusyId(id);
    try {
      if (action === "on-the-way") await serviceProviderApi.markOnTheWay(id);
      else if (action === "arrived") await serviceProviderApi.markArrived(id);
      else if (action === "start") await serviceProviderApi.startService(id, payload);
      else if (action === "complete") await serviceProviderApi.completeService(id, payload);
      toast.success("Updated");
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not update this booking");
    } finally {
      setBusyId(null);
    }
  };

  const handleExtraCharge = async (id, payload) => {
    try {
      await serviceProviderApi.addExtraCharge(id, payload);
      toast.success("Extra charge sent to customer for approval");
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not add extra charge");
    }
  };

  const handleRateCustomer = async (id, payload) => {
    try {
      const updated = await serviceProviderApi.submitCustomerRating(id, payload);
      setBookings((prev) => prev.map((b) => (b._id === id ? updated : b)));
      toast.success("Thanks for your feedback");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not submit rating");
      throw error;
    }
  };

  const confirmCancel = async () => {
    if (!cancelling) return;
    setBusyId(cancelling._id);
    try {
      await serviceProviderApi.providerCancelBooking(cancelling._id, cancelReason);
      toast.success("Booking cancelled");
      setCancelling(null);
      setCancelReason("");
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not cancel booking");
    } finally {
      setBusyId(null);
    }
  };

  const activeJobs = bookings.filter((b) => ACTIVE_STATUSES.includes(b.status));
  const history = bookings.filter((b) => !ACTIVE_STATUSES.includes(b.status));
  const list = tab === "active" ? activeJobs : history;

  return (
    <ServiceProviderLayout title="My jobs" subtitle="Accepted bookings and their progress">
      <div className="mb-4 inline-flex rounded-xl border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setTab("active")}
          className={`rounded-lg px-4 py-1.5 text-sm font-bold ${tab === "active" ? "bg-[#FF6A00] text-white" : "text-gray-500"}`}
        >
          Active ({activeJobs.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={`rounded-lg px-4 py-1.5 text-sm font-bold ${tab === "history" ? "bg-[#FF6A00] text-white" : "text-gray-500"}`}
        >
          History
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          {tab === "active" ? "No active jobs right now." : "No completed or cancelled jobs yet."}
        </div>
      ) : tab === "active" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {list.map((b) => (
            <JobCard
              key={b._id}
              booking={b}
              busy={busyId === b._id}
              onAction={handleAction}
              onCancel={setCancelling}
              onExtraCharge={handleExtraCharge}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {list.map((b) => (
            <div key={b._id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-gray-900">{b.serviceName}</p>
                  <p className="text-xs text-gray-400">{b.date} · {b.startTime}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    b.status === "cancelled" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {STATUS_LABELS[b.status] || b.status}
                </span>
              </div>
              <p className="mt-1 text-sm font-extrabold text-[#FF6A00]">{money(b.providerPrice)}</p>
              {b.cancelReason ? <p className="mt-1 text-xs text-gray-500">{b.cancelReason}</p> : null}
              {b.status === "completed" ? <RateCustomerWidget booking={b} onSubmit={handleRateCustomer} /> : null}
            </div>
          ))}
        </div>
      )}

      <Modal open={Boolean(cancelling)} title="Cancel this booking?" onClose={() => setCancelling(null)}>
        <p className="flex items-start gap-2 text-sm text-gray-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          We&apos;ll try to reassign this to another provider automatically. Repeated cancellations may restrict your account.
        </p>
        <textarea
          rows={2}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Reason (optional)"
          className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/15"
        />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setCancelling(null)}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-600"
          >
            Keep it
          </button>
          <button
            type="button"
            onClick={confirmCancel}
            disabled={Boolean(busyId)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {busyId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Cancel booking
          </button>
        </div>
      </Modal>
    </ServiceProviderLayout>
  );
}
