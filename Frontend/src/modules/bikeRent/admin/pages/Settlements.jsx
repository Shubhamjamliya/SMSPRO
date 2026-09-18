import { useCallback, useEffect, useState } from "react";
import { Eye } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  FilterBar,
  AdminTable,
  EmptyState,
  TableSkeleton,
  StatusBadge,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";
import { BIKE_RENT_ADMIN_PAGE_CLASS } from "../utils/adminTheme";

const message = (error, fallback) => error?.response?.data?.message || fallback;
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const when = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

const DIALOG_CLASS =
  "just-order-theme-scope !flex w-[calc(100vw-1rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 "
  + "max-h-[min(92dvh,720px)] rounded-2xl sm:rounded-3xl";

function WaterfallRow({ label, value, emphasize, negative }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`text-sm ${emphasize ? "font-semibold text-slate-900" : negative ? "text-red-600" : "text-slate-800"}`}>
        {negative ? "-" : ""}
        {money(value)}
      </span>
    </div>
  );
}

export default function Settlements() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [vendorId, setVendorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await bikeRentAdminApi.getSettlements({
        page: meta.page,
        limit: meta.limit,
        vendorId: vendorId.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setRows(result.records || []);
      setMeta((current) => ({
        ...current,
        page: result.page || current.page,
        pages: result.pages || 1,
        total: result.total || 0,
        limit: result.limit || current.limit,
      }));
    } catch (error) {
      toast.error(message(error, "Failed to load settlements"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, vendorId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (row) => {
    setDetail(row);
    setDetailLoading(true);
    try {
      const full = await bikeRentAdminApi.getSettlementById(row.id);
      setDetail(full);
    } catch (error) {
      toast.error(message(error, "Failed to load settlement"));
    } finally {
      setDetailLoading(false);
    }
  };

  const columns = [
    {
      key: "settledAt",
      header: "Settled",
      cell: (row) => <span className="whitespace-nowrap text-xs">{when(row.settledAt)}</span>,
    },
    {
      key: "booking",
      header: "Booking",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.bookingNumber || "—"}</p>
          <p className="truncate text-[11px] text-muted-foreground">{row.bikeName || ""}</p>
        </div>
      ),
    },
    {
      key: "vendor",
      header: "Vendor",
      cell: (row) => row.vendor?.businessName || "—",
    },
    {
      key: "gross",
      header: "Gross",
      cell: (row) => money(row.grossAmount),
    },
    {
      key: "commission",
      header: "Commission",
      cell: (row) => (
        <span>
          {money(row.commissionAmount)}{" "}
          <span className="text-xs text-muted-foreground">({row.commissionRate}%)</span>
        </span>
      ),
    },
    {
      key: "platformFee",
      header: "Platform fee",
      cell: (row) => (row.platformFeeAmount > 0 ? money(row.platformFeeAmount) : "—"),
    },
    {
      key: "net",
      header: "Vendor settlement",
      cell: (row) => <span className="font-semibold text-emerald-700">{money(row.vendorSettlementAmount)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => (
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openDetail(row)}>
          <Eye size={16} />
        </Button>
      ),
    },
  ];

  return (
    <div className={BIKE_RENT_ADMIN_PAGE_CLASS}>
      <PageHeader
        title="Settlements"
        description="Per-booking vendor payout ledger — gross, tax, platform fee, commission, and net"
      />

      <SectionCard className="mb-4">
        <FilterBar>
          <Input
            placeholder="Vendor ID"
            value={vendorId}
            onChange={(event) => {
              setVendorId(event.target.value);
              setMeta((current) => ({ ...current, page: 1 }));
            }}
          />
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
        </FilterBar>
      </SectionCard>

      {loading ? (
        <TableSkeleton rows={8} columns={7} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No settlements yet"
          description="Settlement records appear here once vendor bookings complete."
        />
      ) : (
        <AdminTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          pagination={{
            page: meta.page,
            totalPages: meta.pages,
            total: meta.total,
            pageSize: meta.limit,
            onPageChange: (page) => setMeta((current) => ({ ...current, page })),
            onPageSizeChange: (limit) => setMeta((current) => ({ ...current, limit, page: 1 })),
          }}
        />
      )}

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className={DIALOG_CLASS}>
          <DialogHeader className="shrink-0 border-b border-slate-100 px-4 py-3 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base sm:text-lg">
              Settlement — {detail?.bookingNumber || "—"}
            </DialogTitle>
            {detail ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-800">{detail.vendor?.businessName || "—"}</span>
                <StatusBadge status={detail.status} label={detail.status} tone="success" />
              </div>
            ) : null}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
            {detailLoading ? (
              <TableSkeleton rows={5} columns={2} />
            ) : detail ? (
              <div className="space-y-1">
                <WaterfallRow label="Gross amount (customer paid)" value={detail.grossAmount} emphasize />
                <WaterfallRow label="GST (pass-through)" value={detail.taxAmount} negative />
                {detail.platformFeeAmount > 0 ? (
                  <WaterfallRow label={`Platform fee (${detail.platformFeePayer})`} value={detail.platformFeeAmount} negative />
                ) : null}
                <WaterfallRow label={`Commission (${detail.commissionRate}%)`} value={detail.commissionAmount} negative />
                <WaterfallRow label="Vendor settlement amount" value={detail.vendorSettlementAmount} emphasize />
                {Array.isArray(detail.adjustments) && detail.adjustments.length ? (
                  <div className="mt-3 border-t border-dashed border-slate-200 pt-2">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Adjustments after settlement
                    </p>
                    {detail.adjustments.map((adj) => (
                      <div key={adj.id} className="mb-1.5 flex items-start justify-between gap-3 text-xs">
                        <span className="min-w-0 text-slate-600">
                          {adj.reason}
                          <span className="ml-1.5 text-slate-400">({when(adj.createdAt)})</span>
                        </span>
                        <span className={`shrink-0 font-medium ${adj.amount < 0 ? "text-red-600" : "text-emerald-700"}`}>
                          {adj.amount >= 0 ? "+" : ""}
                          {money(adj.amount)}
                        </span>
                      </div>
                    ))}
                    <WaterfallRow
                      label="Effective vendor settlement"
                      value={detail.effectiveVendorSettlementAmount}
                      emphasize
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 sm:px-5">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDetail(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
