import { useCallback, useEffect, useState } from "react";
import {
  PageHeader,
  SectionCard,
  FilterBar,
  AdminTable,
  EmptyState,
  TableSkeleton,
  StatusBadge,
} from "@/shared/components/admin";
import Input from "@/shared/components/ui/Input";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";
import {
  BIKE_RENT_ADMIN_PAGE_CLASS,
  BIKE_RENT_ADMIN_SELECT_CLASS,
} from "../utils/adminTheme";

const message = (error, fallback) => error?.response?.data?.message || fallback;
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const when = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

export default function WalletTransactions() {
  const [records, setRecords] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [source, setSource] = useState("BIKE_RENTAL");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState("");
  const [userWallet, setUserWallet] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await bikeRentAdminApi.getWalletTransactions({
        page: meta.page,
        limit: meta.limit,
        source: source === "all" ? undefined : source,
        type: type === "all" ? undefined : type,
        search: search.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
        userId: userId.trim() || undefined,
      });
      setRecords(result.records || []);
      setMeta((current) => ({
        ...current,
        page: result.page || current.page,
        pages: result.pages || 1,
        total: result.total || 0,
        limit: result.limit || current.limit,
      }));
      setUserWallet(result.userWallet || null);
    } catch (error) {
      toast.error(message(error, "Failed to load wallet transactions"));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, source, type, search, from, to, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      key: "createdAt",
      header: "When",
      cell: (row) => <span className="whitespace-nowrap text-xs">{when(row.createdAt)}</span>,
    },
    {
      key: "type",
      header: "Type",
      cell: (row) => (
        <StatusBadge
          status={row.type}
          label={row.type}
          tone={row.type === "CREDIT" ? "success" : "warning"}
        />
      ),
    },
    {
      key: "amount",
      header: "Amount",
      cell: (row) => (
        <span className={row.type === "CREDIT" ? "font-semibold text-emerald-700" : "font-semibold"}>
          {row.type === "CREDIT" ? "+" : "-"}
          {money(row.amount)}
        </span>
      ),
    },
    {
      key: "source",
      header: "Service",
      cell: (row) => row.sourceLabel || row.source || "—",
    },
    {
      key: "reason",
      header: "Reason",
      cell: (row) => (
        <div className="min-w-0 max-w-[220px]">
          <p className="truncate text-sm">{row.reason || "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{row.referenceId || ""}</p>
        </div>
      ),
    },
    {
      key: "userId",
      header: "User",
      cell: (row) => (
        <span className="font-mono text-[11px]">{String(row.userId || "").slice(-8) || "—"}</span>
      ),
    },
  ];

  return (
    <div className={BIKE_RENT_ADMIN_PAGE_CLASS}>
      <PageHeader
        title="Wallet & refunds"
        description="Central user wallet activity for Bike Rental and other services"
      />

      <SectionCard className="mb-4">
        <FilterBar>
          <select
            className={BIKE_RENT_ADMIN_SELECT_CLASS}
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setMeta((current) => ({ ...current, page: 1 }));
            }}
          >
            <option value="BIKE_RENTAL">Bike Rental</option>
            <option value="FOOD">Food</option>
            <option value="TAXI">Taxi</option>
            <option value="PORTER">Porter</option>
            <option value="QUICK_COMMERCE">Quick Commerce</option>
            <option value="all">All services</option>
          </select>
          <select
            className={BIKE_RENT_ADMIN_SELECT_CLASS}
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setMeta((current) => ({ ...current, page: 1 }));
            }}
          >
            <option value="all">All types</option>
            <option value="CREDIT">Credit</option>
            <option value="DEBIT">Debit</option>
          </select>
          <Input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setMeta((current) => ({ ...current, page: 1 }));
            }}
          />
          <Input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setMeta((current) => ({ ...current, page: 1 }));
            }}
          />
          <Input
            placeholder="User ID"
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
              setMeta((current) => ({ ...current, page: 1 }));
            }}
          />
          <Input
            placeholder="Search reason / reference"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setMeta((current) => ({ ...current, page: 1 }));
            }}
          />
        </FilterBar>
        {userWallet ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Selected user balance:{" "}
            <span className="font-semibold text-foreground">{money(userWallet.balance)}</span>
          </p>
        ) : null}
      </SectionCard>

      {loading ? (
        <TableSkeleton rows={8} columns={6} />
      ) : records.length === 0 ? (
        <EmptyState
          title="No wallet transactions"
          description="Try changing filters or wait for refunds / payments to appear."
        />
      ) : (
        <AdminTable
          columns={columns}
          data={records}
          getRowId={(row) => row.id}
          pagination={{
            page: meta.page,
            totalPages: meta.pages,
            total: meta.total,
            pageSize: meta.limit,
            onPageChange: (page) => setMeta((current) => ({ ...current, page })),
            onPageSizeChange: (limit) =>
              setMeta((current) => ({ ...current, limit, page: 1 })),
          }}
        />
      )}
    </div>
  );
}
