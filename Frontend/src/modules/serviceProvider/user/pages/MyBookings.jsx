import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Calendar, Clock, Loader2 } from "lucide-react";
import { ServiceProviderPageShell, ServiceProviderPageHeader } from "../components/ui";
import serviceProviderApi from "../../provider/services/providerApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const STATUS_STYLES = {
  requested: "bg-orange-50 text-[#FF6A00]",
  assigned: "bg-orange-50 text-[#FF6A00]",
  provider_on_the_way: "bg-orange-50 text-[#FF6A00]",
  provider_arrived: "bg-orange-50 text-[#FF6A00]",
  service_started: "bg-orange-50 text-[#FF6A00]",
  service_completed: "bg-amber-50 text-amber-600",
  customer_confirmed: "bg-amber-50 text-amber-600",
  completed: "bg-emerald-50 text-emerald-600",
  cancelled: "bg-red-50 text-red-600",
};

const STATUS_LABELS = {
  requested: "Finding provider",
  assigned: "Provider assigned",
  provider_on_the_way: "On the way",
  provider_arrived: "Arrived",
  service_started: "In progress",
  service_completed: "Awaiting confirmation",
  customer_confirmed: "Payment pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function ServiceProviderMyBookingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await serviceProviderApi.getMyBookings();
      setBookings(list);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not load bookings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ServiceProviderPageShell>
      <ServiceProviderPageHeader title="My Bookings" subtitle="Track and manage your service requests" backTo="/services" />

      <div className="px-4 py-4 sm:px-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white py-12 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : bookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            No bookings yet.
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <button
                key={b._id}
                type="button"
                onClick={() => navigate(`/services/requests/${b._id}`)}
                className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition-colors hover:border-[#FF6A00]/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-gray-900">{b.serviceName}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[b.status] || "bg-gray-100 text-gray-500"}`}>
                    {STATUS_LABELS[b.status] || b.status}
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                  <Calendar className="h-3.5 w-3.5" /> {b.date}
                  <Clock className="ml-1.5 h-3.5 w-3.5" /> {b.startTime}
                </p>
                <p className="mt-1 text-sm font-extrabold text-[#FF6A00]">{money(b.finalPayableAmount ?? b.totalAmount)}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </ServiceProviderPageShell>
  );
}
