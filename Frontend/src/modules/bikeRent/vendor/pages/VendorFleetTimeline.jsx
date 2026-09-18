import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import VendorLayout from "../components/VendorLayout";
import { bikeVendorApi } from "../services/vendorApi";
import AvailabilityTimeline from "../../user/components/AvailabilityTimeline";

const message = (error, fallback) => error?.response?.data?.message || fallback;

export default function VendorFleetTimeline() {
  const [bikes, setBikes] = useState([]);
  const [bikeId, setBikeId] = useState("");
  const [data, setData] = useState(null);
  const [loadingBikes, setLoadingBikes] = useState(true);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  useEffect(() => {
    setLoadingBikes(true);
    bikeVendorApi
      .getBikeDropdown()
      .then((rows) => {
        setBikes(rows || []);
        if (rows?.[0]) setBikeId(rows[0].id || rows[0]._id || "");
      })
      .catch((error) => toast.error(message(error, "Failed to load bikes")))
      .finally(() => setLoadingBikes(false));
  }, []);

  const load = useCallback(async () => {
    if (!bikeId) return;
    setLoading(true);
    try {
      const result = await bikeVendorApi.getBikeAvailability(bikeId, {
        from: range.from,
        to: range.to,
        durationHours: 4,
      });
      setData(result);
    } catch (error) {
      toast.error(message(error, "Failed to load timeline"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [bikeId, range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <VendorLayout
      title="Fleet Timeline"
      subtitle="7-day booking calendar per bike with turnaround buffers"
    >
      <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-3 sm:p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Select bike</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm sm:max-w-md"
            value={bikeId}
            disabled={loadingBikes}
            onChange={(event) => setBikeId(event.target.value)}
          >
            <option value="">Choose a bike</option>
            {bikes.map((bike) => {
              const id = bike.id || bike._id;
              return (
                <option key={id} value={id}>
                  {bike.name || bike.registrationNumber || id}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            onClick={load}
            disabled={!bikeId || loading}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Availability</p>
          <p className="text-[11px] text-gray-400">Orange = booked · Amber = buffer</p>
        </div>
        {loading ? (
          <div className="h-14 animate-pulse rounded-xl border border-gray-200 bg-gray-100" />
        ) : !bikeId ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
            <p className="text-sm font-bold text-gray-900">Select a bike</p>
            <p className="mt-1 text-xs text-gray-500">Pick a bike to view its week timeline.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <AvailabilityTimeline
              from={data?.from || range.from}
              to={data?.to || range.to}
              busy={data?.busy || []}
              height="h-14"
            />
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Booking</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Start</th>
                    <th className="px-3 py-2">End</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.busy || []).length ? (
                    data.busy.map((row) => (
                      <tr key={row.bookingId} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-medium">{row.bookingNumber || row.bookingId}</td>
                        <td className="px-3 py-2 capitalize">{String(row.status || "").replace(/_/g, " ")}</td>
                        <td className="px-3 py-2">{new Date(row.startAt).toLocaleString()}</td>
                        <td className="px-3 py-2">{new Date(row.endAt).toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                        No bookings in this window
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {data?.bufferMinutes != null ? (
              <p className="text-xs text-gray-500">Turnaround buffer: {data.bufferMinutes} minutes</p>
            ) : null}
          </div>
        )}
      </div>
    </VendorLayout>
  );
}
