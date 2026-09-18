import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Inbox, RefreshCw, Search, X } from "lucide-react";
import { PageHeader, AdminTable, StatusBadge } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import constructionAdminApi from "../services/adminApi";
import {
  CN_ADMIN_PAGE_CLASS, CN_ADMIN_SELECT_CLASS, CN_DIALOG_CONTENT_CLASS,
} from "../utils/adminTheme";
import { budgetRange, shortDate, relativeDays, ENQUIRY_STATUS_LABEL } from "../../shared/format";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const STATUS_TONE = {
  submitted: "info",
  matching: "info",
  visit_scheduled: "warning",
  visit_completed: "warning",
  quoted: "success",
  negotiating: "warning",
  accepted: "success",
  converted: "success",
  closed_lost: "neutral",
  expired: "neutral",
};

function StatTile({ label, value, tone = "default", onClick, active }) {
  const tones = {
    default: "border-gray-200 bg-white",
    warn: "border-amber-200 bg-amber-50/60",
    good: "border-emerald-200 bg-emerald-50/60",
    bad: "border-red-200 bg-red-50/60",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3.5 text-left transition-all ${tones[tone]} ${
        active ? "ring-2 ring-[#FF6A00]/40" : "hover:shadow-sm"
      }`}
    >
      <p className="text-2xl font-bold tabular-nums text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-gray-600">{label}</p>
    </button>
  );
}

/**
 * BRD A4 — the enquiry pipeline.
 *
 * "Every enquiry and where it has reached. Enquiries that have gone quiet are
 * highlighted so someone can follow up. Every lost enquiry is lost revenue, and
 * most are lost through simple neglect."
 *
 * The gone-quiet filter is therefore a first-class control, not a hidden option.
 */
export default function Enquiries() {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [staleOnly, setStaleOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        constructionAdminApi.getEnquiries({
          status: status || undefined,
          city: search.trim() || undefined,
          stale: staleOnly ? "true" : undefined,
          page,
          limit: 20,
        }),
        constructionAdminApi.getEnquiryStats().catch(() => null),
      ]);
      setRows(list.rows);
      setMeta(list.meta);
      if (s) setStats(s);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load enquiries"));
    } finally {
      setLoading(false);
    }
  }, [status, search, staleOnly, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, search, staleOnly]);

  const rematch = async (id) => {
    setBusy(true);
    try {
      const result = await constructionAdminApi.rematchEnquiry(id);
      toast.success(`Offered to ${result.matched} more contractor(s)`);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not re-match"));
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    setBusy(true);
    try {
      await constructionAdminApi.closeEnquiry(closing._id, reason);
      toast.success("Enquiry closed");
      setClosing(null);
      setReason("");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not close the enquiry"));
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      key: "enquiryNumber",
      header: "Enquiry",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">
            {row.serviceId?.name || "Construction work"}
          </p>
          <p className="truncate font-mono text-[11px] text-gray-400">{row.enquiryNumber}</p>
          <p className="truncate text-xs text-gray-500">
            {row.customerId?.name || "Customer"}
            {row.customerId?.phone ? ` · ${row.customerId.phone}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "site",
      header: "Site",
      cell: (row) => (
        <span className="text-xs text-gray-600">
          {row.site?.city || "—"}
          {budgetRange({ min: row.budgetMin, max: row.budgetMax })
            ? <><br /><span className="text-gray-500">{budgetRange({ min: row.budgetMin, max: row.budgetMax })}</span></>
            : null}
        </span>
      ),
    },
    {
      key: "status",
      header: "Stage",
      cell: (row) => (
        <StatusBadge
          status={row.status}
          tone={STATUS_TONE[row.status]}
          label={ENQUIRY_STATUS_LABEL[row.status] || row.status}
        />
      ),
    },
    {
      key: "lastActivityAt",
      header: "Last activity",
      cell: (row) => {
        // A live enquiry with no movement for a week is the thing this screen exists
        // to surface — most lost enquiries are lost to simple neglect.
        const days = Math.round((Date.now() - new Date(row.lastActivityAt).getTime()) / 86400000);
        const quiet = days >= 7
          && !["converted", "closed_lost", "expired", "accepted"].includes(row.status);
        return (
          <div className="text-xs">
            <span className={quiet ? "font-semibold text-red-600" : "text-gray-600"}>
              {relativeDays(row.lastActivityAt)}
            </span>
            {quiet ? (
              <p className="mt-0.5 inline-flex items-center gap-1 font-medium text-red-600">
                <AlertTriangle className="h-3 w-3" /> gone quiet
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          {!["converted", "closed_lost", "accepted"].includes(row.status) ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => rematch(row._id)}
                title="Offer to more contractors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-red-200 text-red-600"
                onClick={() => setClosing(row)}
                title="Close this enquiry"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  const renderMobileCard = (row) => (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">
            {row.serviceId?.name || "Construction work"}
          </p>
          <p className="truncate font-mono text-[11px] text-gray-400">{row.enquiryNumber}</p>
        </div>
        <StatusBadge
          status={row.status}
          tone={STATUS_TONE[row.status]}
          label={ENQUIRY_STATUS_LABEL[row.status] || row.status}
        />
      </div>
      <p className="mt-2 text-xs text-gray-600">
        {row.site?.city} · {row.customerId?.phone || "—"} · {shortDate(row.createdAt)}
      </p>
    </div>
  );

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <PageHeader
        eyebrow="Construction"
        title="Enquiry pipeline"
        description="Every enquiry and where it has reached. Enquiries that have gone quiet are highlighted — most lost work is lost to simple neglect."
      />

      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatTile
            label="Finding contractors"
            value={stats.submitted + stats.matching}
            active={status === "matching"}
            onClick={() => setStatus((p) => (p === "matching" ? "" : "matching"))}
          />
          <StatTile
            label="Visit booked"
            value={stats.visitScheduled}
            tone="warn"
            active={status === "visit_scheduled"}
            onClick={() => setStatus((p) => (p === "visit_scheduled" ? "" : "visit_scheduled"))}
          />
          <StatTile
            label="Quoted"
            value={stats.quoted}
            tone="good"
            active={status === "quoted"}
            onClick={() => setStatus((p) => (p === "quoted" ? "" : "quoted"))}
          />
          <StatTile
            label="Accepted"
            value={stats.accepted}
            tone="good"
            active={status === "accepted"}
            onClick={() => setStatus((p) => (p === "accepted" ? "" : "accepted"))}
          />
          <StatTile
            label="Gone quiet"
            value={stats.goneQuiet}
            tone={stats.goneQuiet > 0 ? "bad" : "default"}
            active={staleOnly}
            onClick={() => setStaleOnly((p) => !p)}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Filter by city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={`${CN_ADMIN_SELECT_CLASS} sm:w-52`}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All stages</option>
          {Object.entries(ENQUIRY_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {staleOnly ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Showing only enquiries with no activity for 7 days or more.
          <button
            type="button"
            onClick={() => setStaleOnly(false)}
            className="ml-auto font-semibold underline"
          >
            Show all
          </button>
        </div>
      ) : null}

      <AdminTable
        columns={columns}
        data={rows}
        loading={loading}
        skeletonRows={6}
        getRowId={(row) => row._id}
        renderMobileCard={renderMobileCard}
        pagination={{
          page: meta.page,
          totalPages: meta.totalPages,
          total: meta.total,
          pageSize: 20,
          onPageChange: setPage,
        }}
        emptyState={{
          icon: <Inbox className="h-10 w-10" />,
          title: staleOnly ? "Nothing has gone quiet" : "No enquiries yet",
          description: staleOnly
            ? "Every live enquiry has had activity in the last week."
            : "Customer enquiries appear here as soon as they are sent.",
        }}
      />

      <Dialog open={Boolean(closing)} onOpenChange={(open) => !open && setClosing(null)}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-md`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">Close this enquiry</DialogTitle>
          </DialogHeader>
          <div className="px-4 py-4 sm:px-5">
            <p className="mb-2.5 text-sm text-gray-600">
              Any outstanding offers to contractors are withdrawn and live quotations are
              closed. The reason is recorded permanently.
            </p>
            <Textarea
              rows={3}
              placeholder="Why is this being closed?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-gray-100 px-4 py-3 sm:px-5">
            <Button variant="outline" onClick={() => setClosing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" isLoading={busy} disabled={!reason.trim()} onClick={close}>
              Close enquiry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
