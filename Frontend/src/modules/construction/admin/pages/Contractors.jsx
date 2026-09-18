import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { HardHat, Search, ShieldAlert } from "lucide-react";
import { PageHeader, AdminTable, StatusBadge } from "@/shared/components/admin";
import Input from "@/shared/components/ui/Input";
import constructionAdminApi from "../services/adminApi";
import { CN_ADMIN_PAGE_CLASS, CN_ADMIN_SELECT_CLASS } from "../utils/adminTheme";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const STATUS_LABEL = {
  onboarding: "Registering",
  pending_approval: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
};
/** StatusBadge has no alias for `pending_approval`, so map tone + label here. */
const STATUS_TONE = {
  onboarding: "info",
  pending_approval: "warning",
  approved: "success",
  rejected: "danger",
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
 * BRD A2 / A4 — the contractor approval queue and full register.
 *
 * Opens on applications awaiting review, because that is the queue your team
 * actually works. Rows surface document counts so it is obvious at a glance
 * whether an application is ready to decide on.
 */
export default function Contractors() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("pending_approval");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        constructionAdminApi.getContractors({
          status: status || undefined,
          search: search.trim() || undefined,
          page,
          limit: 20,
        }),
        constructionAdminApi.getContractorStats().catch(() => null),
      ]);
      setRows(list.rows);
      setMeta(list.meta);
      if (s) setStats(s);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load contractors"));
    } finally {
      setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setPage(1); }, [status, search]);

  const pickStatus = (next) => setStatus((prev) => (prev === next ? "" : next));

  const columns = [
    {
      key: "businessName",
      header: "Contractor",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{row.businessName}</p>
          <p className="truncate text-xs text-gray-500">
            {row.contractorCode ? `${row.contractorCode} · ` : ""}
            {row.ownerName} · {row.phone}
          </p>
        </div>
      ),
    },
    {
      key: "trades",
      header: "Work",
      cell: (row) => (
        <span className="text-xs text-gray-600">
          {row.trades?.length
            ? row.trades.map((t) => t.name).filter(Boolean).join(", ") || `${row.trades.length} trades`
            : "—"}
        </span>
      ),
    },
    {
      key: "documents",
      header: "Documents",
      align: "center",
      cell: (row) => {
        // Verification rests on these — an application with unverified or expired
        // documents cannot be approved, so say so before your team opens it.
        if (!row.documentCount) {
          return <span className="text-xs font-medium text-gray-400">None</span>;
        }
        return (
          <div className="text-xs">
            <span className="font-semibold tabular-nums text-gray-900">
              {row.verifiedDocumentCount}
            </span>
            <span className="text-gray-400"> / {row.documentCount} verified</span>
            {row.expiredDocumentCount > 0 ? (
              <p className="mt-0.5 inline-flex items-center gap-1 font-medium text-red-600">
                <ShieldAlert className="h-3 w-3" />
                {row.expiredDocumentCount} expired
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <div>
          <StatusBadge status={row.status} tone={STATUS_TONE[row.status]} label={STATUS_LABEL[row.status]} />
          {row.isActive === false ? (
            <p className="mt-1 text-[11px] font-semibold text-red-600">Suspended</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "submittedAt",
      header: "Submitted",
      cell: (row) => (
        <span className="text-xs text-gray-500">
          {row.submittedAt ? new Date(row.submittedAt).toLocaleDateString("en-IN") : "—"}
        </span>
      ),
    },
  ];

  const renderMobileCard = (row) => (
    <button
      type="button"
      onClick={() => navigate(`/admin/construction/contractors/${row._id}`)}
      className="w-full rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-left"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{row.businessName}</p>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {row.ownerName} · {row.phone}
          </p>
        </div>
        <StatusBadge status={row.status} tone={STATUS_TONE[row.status]} label={STATUS_LABEL[row.status]} />
      </div>
      <p className="mt-2 text-xs text-gray-600">
        {row.verifiedDocumentCount}/{row.documentCount} documents verified
        {row.expiredDocumentCount ? ` · ${row.expiredDocumentCount} expired` : ""}
      </p>
    </button>
  );

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <PageHeader
        eyebrow="Construction"
        title="Contractors"
        description="Verify licences before a contractor receives any work. This is where platform quality is actually decided."
      />

      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Awaiting review"
            value={stats.pendingApproval}
            tone="warn"
            active={status === "pending_approval"}
            onClick={() => pickStatus("pending_approval")}
          />
          <StatTile
            label="Approved"
            value={stats.approved}
            tone="good"
            active={status === "approved"}
            onClick={() => pickStatus("approved")}
          />
          <StatTile
            label="Still registering"
            value={stats.onboarding}
            active={status === "onboarding"}
            onClick={() => pickStatus("onboarding")}
          />
          <StatTile
            label="Documents expiring in 30 days"
            value={stats.documentsExpiringIn30Days}
            tone={stats.documentsExpiringIn30Days > 0 ? "bad" : "default"}
            onClick={() => pickStatus("approved")}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Search by business, owner, code or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={`${CN_ADMIN_SELECT_CLASS} sm:w-52`}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="pending_approval">Awaiting review</option>
          <option value="approved">Approved</option>
          <option value="onboarding">Still registering</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <AdminTable
        columns={columns}
        data={rows}
        loading={loading}
        skeletonRows={6}
        getRowId={(row) => row._id}
        onRowClick={(row) => navigate(`/admin/construction/contractors/${row._id}`)}
        renderMobileCard={renderMobileCard}
        pagination={{
          page: meta.page,
          totalPages: meta.totalPages,
          total: meta.total,
          pageSize: 20,
          onPageChange: setPage,
        }}
        emptyState={{
          icon: <HardHat className="h-10 w-10" />,
          title:
            status === "pending_approval"
              ? "Nothing waiting for review"
              : "No contractors match",
          description:
            status === "pending_approval"
              ? "Applications appear here as soon as contractors submit them."
              : "Try clearing the filters.",
        }}
      />
    </div>
  );
}
