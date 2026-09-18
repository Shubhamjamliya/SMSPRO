import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { FilterBar, AdminTable } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import VendorLayout from "../components/VendorLayout";
import VendorModal from "../components/VendorModal";
import { bikeVendorApi } from "../services/vendorApi";

const message = (error, fallback) => error?.response?.data?.message || fallback;
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const when = (value) => (value ? new Date(value).toLocaleString() : "—");

function WaterfallRow({ label, value, emphasize, negative }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-2 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm ${emphasize ? "font-bold text-gray-900" : negative ? "text-red-600" : "text-gray-800"}`}>
        {negative ? "-" : ""}
        {money(value)}
      </span>
    </div>
  );
}

export default function VendorSettlements() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await bikeVendorApi.getSettlements({
        page: meta.page,
        limit: meta.limit,
        createdFrom: from || undefined,
        createdTo: to || undefined,
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
  }, [meta.page, meta.limit, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (row) => {
    setDetail(row);
    setDetailLoading(true);
    try {
      const full = await bikeVendorApi.getSettlementById(row.id);
      setDetail(full);
    } catch (error) {
      toast.error(message(error, "Failed to load settlement"));
    } finally {
      setDetailLoading(false);
    }
  };

  const columns = [
    { key: "settledAt", header: "Settled", cell: (row) => when(row.settledAt) },
    {
      key: "booking",
      header: "Booking",
      cell: (row) => (
        <div>
          <p className="font-semibold text-gray-800">{row.bookingNumber || "—"}</p>
          <p className="text-xs text-muted-foreground">{row.bikeName || ""}</p>
        </div>
      ),
    },
    { key: "grossAmount", header: "Gross", cell: (row) => money(row.grossAmount) },
    {
      key: "commission",
      header: "Commission",
      cell: (row) => `${money(row.commissionAmount)} (${row.commissionRate}%)`,
    },
    {
      key: "vendorSettlementAmount",
      header: "Your settlement",
      cell: (row) => (
        <span className="font-semibold text-[var(--just-order-success)]">{money(row.vendorSettlementAmount)}</span>
      ),
    },
    {
      key: "details",
      header: "Details",
      align: "right",
      cell: (row) => (
        <Button variant="outline" size="sm" onClick={() => openDetail(row)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" /> View
        </Button>
      ),
    },
  ];

  const renderMobileCard = (row) => (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800">{row.bookingNumber || "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{row.bikeName || ""}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{when(row.settledAt)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>
          <span className="block text-[10px] uppercase tracking-wide">Gross</span>
          <span className="font-medium text-foreground">{money(row.grossAmount)}</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wide">Commission</span>
          <span className="font-medium text-foreground">
            {money(row.commissionAmount)} ({row.commissionRate}%)
          </span>
        </div>
        <div className="col-span-2">
          <span className="block text-[10px] uppercase tracking-wide">Your settlement</span>
          <span className="font-semibold text-[var(--just-order-success)]">
            {money(row.vendorSettlementAmount)}
          </span>
        </div>
      </div>

      <Button variant="outline" size="sm" className="w-full" onClick={() => openDetail(row)}>
        <Eye className="mr-1.5 h-3.5 w-3.5" /> View
      </Button>
    </div>
  );

  return (
    <VendorLayout title="Settlements" subtitle="How your payout was calculated for each completed booking">
      <FilterBar
        start={
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20"
            />
          </>
        }
      />

      <div className="mt-4">
        <AdminTable
          columns={columns}
          data={rows}
          loading={loading}
          skeletonRows={5}
          getRowId={(row) => row.id}
          renderMobileCard={renderMobileCard}
          emptyState={{
            title: "No settlements yet",
            description: "Settlements appear here once your bookings complete.",
          }}
          pagination={{
            page: meta.page,
            totalPages: meta.pages,
            total: meta.total,
            pageSize: meta.limit,
            onPageChange: (page) => setMeta((v) => ({ ...v, page })),
          }}
        />
      </div>

      <VendorModal open={Boolean(detail)} title="Settlement breakdown" onClose={() => setDetail(null)}>
        {detailLoading ? (
          <div className="h-24 animate-pulse rounded-xl border border-gray-200 bg-gray-100" />
        ) : detail ? (
          <div className="space-y-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
              {detail.bookingNumber || "—"}
            </p>
            <WaterfallRow label="Gross amount (customer paid)" value={detail.grossAmount} emphasize />
            <WaterfallRow label="GST (pass-through, not revenue)" value={detail.taxAmount} negative />
            {detail.platformFeeAmount > 0 ? (
              <WaterfallRow
                label={`Platform fee (${detail.platformFeePayer})`}
                value={detail.platformFeeAmount}
                negative
              />
            ) : null}
            <WaterfallRow label={`Commission (${detail.commissionRate}%)`} value={detail.commissionAmount} negative />
            <WaterfallRow label="Your settlement amount" value={detail.vendorSettlementAmount} emphasize />
            {detail.adjustments?.length ? (
              <>
                <p className="mb-1 mt-3 text-xs font-bold uppercase tracking-wide text-gray-400">Adjustments</p>
                {detail.adjustments.map((adj) => (
                  <WaterfallRow
                    key={adj.id}
                    label={`${adj.reason || adj.type} · ${when(adj.createdAt)}`}
                    value={Math.abs(adj.amount)}
                    negative={adj.amount < 0}
                  />
                ))}
                <WaterfallRow
                  label="Effective settlement (after adjustments)"
                  value={detail.effectiveVendorSettlementAmount}
                  emphasize
                />
              </>
            ) : null}
          </div>
        ) : null}
      </VendorModal>
    </VendorLayout>
  );
}
