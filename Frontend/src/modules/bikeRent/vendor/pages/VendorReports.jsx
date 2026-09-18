import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import VendorLayout from "../components/VendorLayout";
import { bikeVendorApi } from "../services/vendorApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const hours = (value) => `${Number(value || 0).toFixed(1)}h`;
const labelize = (value) => {
  if (!value) return "—";
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

function StatTile({ label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-black text-gray-900">{value}</p>
    </div>
  );
}

export default function VendorReports() {
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const data = await bikeVendorApi.getReports(params);
      setReports(data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not load reports");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <VendorLayout
      title="Reports & Analytics"
      subtitle="Performance across your bikes, zones, and bookings."
      actions={
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-xl border border-gray-200 px-3 py-2 text-xs"
        />
        <span className="text-xs text-gray-400">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-xl border border-gray-200 px-3 py-2 text-xs"
        />
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading reports…</p>
      ) : !reports ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Could not load reports.
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Total revenue" value={money(reports.fees?.totalRevenue)} />
            <StatTile label="Late fees" value={money(reports.fees?.lateFees)} />
            <StatTile label="Damage fees" value={money(reports.fees?.damageFees)} />
            <StatTile label="Deposits held" value={money(reports.fees?.depositsHeld)} />
            <StatTile label="Deposits refunded" value={money(reports.fees?.depositsRefunded)} />
            <StatTile label="Cancellation fees" value={money(reports.fees?.cancelFees)} />
            <StatTile label="Extension fees" value={money(reports.fees?.extensionFees)} />
            <StatTile label="Avg. rental duration" value={hours(reports.duration?.avgHours)} />
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-black text-gray-900">Bookings by status</h3>
            {reports.byStatus?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-gray-400">
                    <tr>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Count</th>
                      <th className="pb-2">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-700">
                    {reports.byStatus.map((row) => (
                      <tr key={row.status} className="border-t border-gray-50">
                        <td className="py-1.5 pr-4 font-semibold">{labelize(row.status)}</td>
                        <td className="py-1.5 pr-4">{row.count}</td>
                        <td className="py-1.5">{money(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-400">No bookings in this period.</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-black text-gray-900">Top bikes by revenue</h3>
              {reports.topBikes?.length ? (
                <ul className="space-y-1.5 text-xs text-gray-700">
                  {reports.topBikes.map((row) => (
                    <li key={row.bikeId} className="flex items-center justify-between border-t border-gray-50 pt-1.5 first:border-t-0 first:pt-0">
                      <span className="font-semibold">{row.bikeName}</span>
                      <span>{money(row.revenue)} · {row.bookings} bookings</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400">No data yet.</p>
              )}
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-black text-gray-900">Zone utilization</h3>
              {reports.zoneUtilization?.length ? (
                <ul className="space-y-1.5 text-xs text-gray-700">
                  {reports.zoneUtilization.map((row) => (
                    <li key={row.zoneId} className="flex items-center justify-between border-t border-gray-50 pt-1.5 first:border-t-0 first:pt-0">
                      <span className="font-semibold">{row.zoneName}</span>
                      <span>{money(row.revenue)} · {row.bookings} bookings</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400">No data yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-black text-gray-900">Booking source</h3>
            {reports.bySource?.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {reports.bySource.map((row) => (
                  <div key={row.source} className="rounded-xl bg-gray-50 px-3 py-2 text-xs">
                    <p className="font-bold text-gray-700">{labelize(row.source)}</p>
                    <p className="text-gray-500">{row.bookings} bookings · {money(row.revenue)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No data yet.</p>
            )}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-black text-gray-900">Fleet availability</h3>
            {reports.bikeAvailability?.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {reports.bikeAvailability.map((row) => (
                  <div key={row.status} className="rounded-xl bg-gray-50 px-3 py-2 text-xs">
                    <p className="font-bold text-gray-700">{labelize(row.status)}</p>
                    <p className="text-gray-500">{row.count} bikes</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No bikes yet.</p>
            )}
          </div>
        </div>
      )}
    </VendorLayout>
  );
}
