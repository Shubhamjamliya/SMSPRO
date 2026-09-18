import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import constructionAdminApi from "../services/adminApi";
import { CN_ADMIN_PAGE_CLASS, CN_ADMIN_SELECT_CLASS } from "../utils/adminTheme";
import { fullMoney } from "../../shared/format";

/**
 * BRD A9 — reports.
 *
 * "These numbers tell you which services and which cities are actually worth
 * investing in."
 *
 * Every table here is built to support that decision, which is why each one
 * pairs DEMAND with CONVERSION. A city with 200 enquiries and 4% conversion is a
 * different business problem from one with 20 enquiries and 60%, and a table
 * showing only enquiry counts makes them look alike.
 *
 * Gross value and revenue are deliberately separate columns. The platform earns
 * commission, not contract value — showing ₹2 crore of building work as
 * "revenue" would overstate the business by more than an order of magnitude.
 */
const TABS = [
  ["cities", "By city"],
  ["services", "By service"],
  ["periods", "By month"],
  ["contractors", "Contractors"],
  ["delays", "Delays"],
];

export default function Reports() {
  const [tab, setTab] = useState("cities");
  const [days, setDays] = useState(90);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const api = {
        cities: constructionAdminApi.getCityReport,
        services: constructionAdminApi.getServiceReport,
        periods: constructionAdminApi.getPeriodReport,
        contractors: constructionAdminApi.getContractorReport,
        delays: constructionAdminApi.getDelayReport,
      }[tab];
      setData(await api({ days }));
    } catch (err) {
      setError(err?.response?.data?.message || "Could not build that report");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tab, days]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo(() => COLUMNS[tab] || [], [tab]);
  const rows = data?.rows || [];

  /**
   * CSV export.
   *
   * The whole point of a report is that someone takes it into a meeting, and a
   * spreadsheet is where these numbers actually get argued about. Built from
   * the same rows on screen, so the file can never disagree with the table.
   */
  const downloadCsv = () => {
    const header = columns.map((c) => c.label).join(",");
    const body = rows.map((r) => columns
      .map((c) => {
        const raw = c.raw ? c.raw(r) : r[c.key];
        const text = raw == null ? "" : String(raw);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(",")).join("\n");

    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `construction-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="mt-1 text-sm text-gray-500">
            Where the demand is, and how much of it converts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className={`w-auto ${CN_ADMIN_SELECT_CLASS}`}
          >
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
            <option value={365}>Last year</option>
          </select>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`relative px-4 py-2.5 text-sm font-medium transition ${
              tab === value ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            {tab === value && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gray-900" />
            )}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      {tab === "delays" && data?.summary && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="On time"
            value={`${data.summary.onTimeRate}%`}
            tone={data.summary.onTimeRate >= 80 ? "text-emerald-700" : "text-amber-700"}
          />
          <Stat label="Late stages" value={data.summary.lateStages} tone="text-rose-700" />
          <Stat
            label="Average delay"
            value={`${data.summary.averageDaysLate} days`}
            tone="text-gray-900"
          />
          <Stat
            label="Value held up"
            value={fullMoney(data.summary.valueDelayed)}
            tone="text-amber-700"
            note="Late and still unfinished"
          />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-4 py-3 font-medium ${c.align === "right" ? "text-right" : ""}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [0, 1, 2, 3].map((i) => (
                  <tr key={i}>
                    <td colSpan={columns.length} className="px-4 py-4">
                      <div className="h-4 animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500">
                    Nothing in this period.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.contractorId || r.city || r.service || r.month || r.stageId || i}>
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-4 py-3 ${c.align === "right" ? "text-right" : ""} ${
                          c.tone ? c.tone(r) : "text-gray-700"
                        }`}
                      >
                        {c.render ? c.render(r) : (r[c.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data?.from && (
        <p className="mt-3 text-xs text-gray-400">
          {new Date(data.from).toLocaleDateString("en-IN")} to{" "}
          {new Date(data.to).toLocaleDateString("en-IN")}. Revenue means commission
          earned, not contract value.
        </p>
      )}
    </div>
  );
}

const money = (key) => ({
  key,
  align: "right",
  render: (r) => fullMoney(r[key]),
  raw: (r) => r[key],
});

const percent = (key) => ({
  key,
  align: "right",
  render: (r) => `${r[key] ?? 0}%`,
  raw: (r) => r[key],
});

const COLUMNS = {
  cities: [
    { key: "city", label: "City" },
    { key: "enquiries", label: "Enquiries", align: "right" },
    { ...percent("conversionRate"), label: "Conversion" },
    { key: "projects", label: "Projects", align: "right" },
    { ...money("grossValue"), label: "Contract value" },
    { ...money("revenue"), label: "Revenue" },
    { ...money("averageProjectValue"), label: "Avg project" },
  ],
  services: [
    { key: "service", label: "Service" },
    { key: "enquiries", label: "Enquiries", align: "right" },
    { ...percent("conversionRate"), label: "Conversion" },
    { key: "projects", label: "Projects", align: "right" },
    { ...money("grossValue"), label: "Contract value" },
    { ...money("revenue"), label: "Revenue" },
  ],
  periods: [
    { key: "month", label: "Month" },
    { key: "enquiries", label: "Enquiries", align: "right" },
    { ...percent("conversionRate"), label: "Conversion" },
    { key: "projects", label: "Projects", align: "right" },
    { ...money("grossValue"), label: "Contract value" },
    { ...money("released"), label: "Paid out" },
    { ...money("revenue"), label: "Revenue" },
  ],
  contractors: [
    { key: "businessName", label: "Contractor" },
    {
      key: "trustScore",
      label: "Score",
      align: "right",
      render: (r) => (r.trustScore == null ? "New" : r.trustScore),
      raw: (r) => (r.trustScore == null ? "New" : r.trustScore),
    },
    {
      key: "rating",
      label: "Rating",
      align: "right",
      render: (r) => (r.totalRatings > 0 ? `${r.rating} (${r.totalRatings})` : "—"),
      raw: (r) => r.rating,
    },
    { key: "projects", label: "Projects", align: "right" },
    { key: "completed", label: "Completed", align: "right" },
    {
      key: "disputesUpheld",
      label: "Complaints",
      align: "right",
      tone: (r) => (r.disputesUpheld > 0 ? "text-rose-700 font-medium" : "text-gray-400"),
      render: (r) => (r.disputes > 0 ? `${r.disputesUpheld}/${r.disputes}` : "—"),
      raw: (r) => r.disputesUpheld,
    },
    { ...money("grossValue"), label: "Contract value" },
  ],
  delays: [
    { key: "stage", label: "Stage" },
    { key: "projectNumber", label: "Project" },
    { key: "contractor", label: "Contractor" },
    {
      key: "daysLate",
      label: "Days late",
      align: "right",
      tone: () => "text-rose-700 font-medium",
    },
    {
      key: "finished",
      label: "State",
      render: (r) => (r.finished ? "Finished late" : "Still outstanding"),
      raw: (r) => (r.finished ? "finished late" : "outstanding"),
    },
    { ...money("amount"), label: "Amount" },
  ],
};

function Stat({ label, value, tone = "text-gray-900", note }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] leading-tight text-gray-400">{note}</p>}
    </div>
  );
}
