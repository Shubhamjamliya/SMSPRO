import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  TableSkeleton,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import bikeRentAdminApi from "../services/adminApi";
import {
  BIKE_RENT_ADMIN_PAGE_CLASS,
  BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS,
} from "../utils/adminTheme";
import AvailabilityTimeline from "../../user/components/AvailabilityTimeline";

const message = (error, fallback) => error?.response?.data?.message || fallback;

export default function FleetTimeline() {
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
    bikeRentAdminApi
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
      const result = await bikeRentAdminApi.getBikeAvailability(bikeId, {
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
    <div className={BIKE_RENT_ADMIN_PAGE_CLASS}>
      <PageHeader
        title="Fleet Timeline"
        description="7-day booking calendar per bike with turnaround buffers"
      />
      <SectionCard title="Select bike">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className={`${BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS} sm:max-w-md`}
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
          <Button variant="outline" onClick={load} disabled={!bikeId || loading}>
            Refresh
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Availability" subtitle="Orange = booked · Amber = buffer">
        {loading ? (
          <TableSkeleton rows={4} columns={2} />
        ) : !bikeId ? (
          <EmptyState title="Select a bike" description="Pick a bike to view its week timeline." />
        ) : (
          <div className="space-y-4">
            <AvailabilityTimeline
              from={data?.from || range.from}
              to={data?.to || range.to}
              busy={data?.busy || []}
              height="h-14"
            />
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
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
                      <tr key={row.bookingId} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium">{row.bookingNumber || row.bookingId}</td>
                        <td className="px-3 py-2 capitalize">{String(row.status || "").replace(/_/g, " ")}</td>
                        <td className="px-3 py-2">{new Date(row.startAt).toLocaleString()}</td>
                        <td className="px-3 py-2">{new Date(row.endAt).toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                        No bookings in this window
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {data?.bufferMinutes != null ? (
              <p className="text-xs text-slate-500">
                Turnaround buffer: {data.bufferMinutes} minutes
              </p>
            ) : null}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
