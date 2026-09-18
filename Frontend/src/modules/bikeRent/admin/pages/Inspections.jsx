import { useCallback, useEffect, useState } from "react";
import { Eye, Search } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatCard,
  AdminTable,
  FilterBar,
  StatusBadge,
  EmptyState,
  TableSkeleton,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";
import { InspectionMediaGallery } from "../../shared/components/InspectionMediaForm";
import {
  BIKE_RENT_ADMIN_PAGE_CLASS,
  BIKE_RENT_ADMIN_SELECT_CLASS,
  BIKE_RENT_STAT_GRID_3_CLASS,
} from "../utils/adminTheme";

const message = (error, fallback) => error?.response?.data?.message || fallback;
const idOf = (row) => row?.id || row?._id;
const when = (value) => (value ? new Date(value).toLocaleString() : "—");
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const DIALOG_CLASS =
  "just-order-theme-scope !flex w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 "
  + "max-h-[min(92dvh,880px)] rounded-2xl sm:rounded-3xl";

const TYPE_LABEL = {
  PICKUP: "Pickup",
  RETURN: "Return",
};

function MetaItem({ label, value }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function Inspections() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 10 });
  const [search, setSearch] = useState("");
  const [inspectionType, setInspectionType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [compare, setCompare] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await bikeRentAdminApi.getInspections({
        page: meta.page,
        limit: meta.limit,
        search: search.trim() || undefined,
        inspectionType: inspectionType === "all" ? undefined : inspectionType,
      });
      setRows(result.records || []);
      setMeta((current) => ({ ...current, ...result }));
    } catch (error) {
      toast.error(message(error, "Failed to load inspections"));
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, search, inspectionType]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (row) => {
    setDetail(row);
    setCompare(null);
    setDetailLoading(true);
    try {
      const full = await bikeRentAdminApi.getInspectionById(idOf(row));
      setDetail(full);
      if (row.bookingId || full?.bookingId) {
        const cmp = await bikeRentAdminApi.getBookingInspections(row.bookingId || full.bookingId);
        setCompare(cmp);
      }
    } catch (error) {
      toast.error(message(error, "Failed to load inspection"));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setCompare(null);
  };

  const columns = [
    {
      key: "booking",
      header: "Booking",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.bookingNumber || row.bookingId || "—"}</p>
          <p className="truncate text-[11px] text-muted-foreground">{when(row.inspectedAt)}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (row) => (
        <StatusBadge
          status={row.inspectionType}
          label={TYPE_LABEL[row.inspectionType] || row.inspectionType}
        />
      ),
    },
    {
      key: "bike",
      header: "Bike / Customer",
      cell: (row) => (
        <div className="min-w-0 max-w-[11rem]">
          <p className="truncate text-sm">{row.bikeName || "—"}</p>
          <p className="truncate text-[11px] text-muted-foreground">{row.customerName || "—"}</p>
        </div>
      ),
    },
    {
      key: "media",
      header: "Media",
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {(row.images || []).length} img · {(row.videos || []).length} vid
        </span>
      ),
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

  const renderMobileCard = (row) => (
    <div className="space-y-2.5 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {row.bookingNumber || row.bookingId || "Inspection"}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{when(row.inspectedAt)}</p>
        </div>
        <StatusBadge
          status={row.inspectionType}
          label={TYPE_LABEL[row.inspectionType] || row.inspectionType}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Bike</span>
          <span className="block truncate font-medium text-foreground">{row.bikeName || "—"}</span>
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Customer</span>
          <span className="block truncate font-medium text-foreground">{row.customerName || "—"}</span>
        </div>
        <div className="min-w-0 col-span-2">
          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Media</span>
          <span className="font-medium text-foreground">
            {(row.images || []).length} photos · {(row.videos || []).length} video
          </span>
        </div>
      </div>

      <Button size="sm" variant="outline" className="h-8 w-full gap-1.5 text-xs" onClick={() => openDetail(row)}>
        <Eye size={14} /> View inspection
      </Button>
    </div>
  );

  const pickupCount = rows.filter((row) => row.inspectionType === "PICKUP").length;
  const returnCount = rows.filter((row) => row.inspectionType === "RETURN").length;

  return (
    <div className={BIKE_RENT_ADMIN_PAGE_CLASS}>
      <PageHeader
        title="Inspections"
        description="Pickup and return condition records with media proof"
      />

      <div className={BIKE_RENT_STAT_GRID_3_CLASS}>
        <StatCard title="Total" value={String(meta.total || 0)} />
        <StatCard title="Pickup (page)" value={String(pickupCount)} />
        <StatCard title="Return (page)" value={String(returnCount)} />
      </div>

      <SectionCard flush>
        <div className="space-y-3 p-3 sm:p-4">
          <FilterBar
            start={
              <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-10 pl-9"
                    placeholder="Search booking number…"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setMeta((value) => ({ ...value, page: 1 }));
                    }}
                  />
                </div>
                <select
                  className={`${BIKE_RENT_ADMIN_SELECT_CLASS} sm:w-40`}
                  value={inspectionType}
                  onChange={(event) => {
                    setInspectionType(event.target.value);
                    setMeta((value) => ({ ...value, page: 1 }));
                  }}
                >
                  <option value="all">All types</option>
                  <option value="PICKUP">Pickup</option>
                  <option value="RETURN">Return</option>
                </select>
              </div>
            }
          />

          {loading ? (
            <TableSkeleton rows={5} columns={5} />
          ) : rows.length ? (
            <AdminTable
              columns={columns}
              data={rows}
              getRowId={idOf}
              renderMobileCard={renderMobileCard}
              pagination={{
                page: meta.page,
                totalPages: meta.pages,
                total: meta.total,
                pageSize: meta.limit,
                onPageChange: (page) => setMeta((value) => ({ ...value, page })),
                onPageSizeChange: (limit) =>
                  setMeta((value) => ({ ...value, limit, page: 1 })),
              }}
            />
          ) : (
            <EmptyState
              title="No inspections yet"
              description="Pickup and return inspections appear here after hub handover."
            />
          )}
        </div>
      </SectionCard>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent className={DIALOG_CLASS}>
          <DialogHeader className="shrink-0 border-b border-slate-100 px-4 py-3 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base sm:text-lg">
              {TYPE_LABEL[detail?.inspectionType] || detail?.inspectionType || "Inspection"}
            </DialogTitle>
            {detail ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-800">
                  {detail.bookingNumber || detail.bookingId || "—"}
                </span>
                <StatusBadge
                  status={detail.inspectionType}
                  label={TYPE_LABEL[detail.inspectionType] || detail.inspectionType}
                />
              </div>
            ) : null}
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
            {detailLoading ? (
              <TableSkeleton rows={4} columns={2} />
            ) : detail ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <MetaItem label="Bike" value={detail.bikeName} />
                  <MetaItem label="Customer" value={detail.customerName} />
                  <MetaItem label="Inspected" value={when(detail.inspectedAt)} />
                  <MetaItem label="Meter" value={detail.meterReading ?? ""} />
                  <MetaItem label="Fuel" value={detail.fuelLevel} />
                  <MetaItem label="Condition" value={detail.returnCondition} />
                  {Number(detail.repairCharges || 0) > 0 ? (
                    <MetaItem label="Repair charges" value={money(detail.repairCharges)} />
                  ) : null}
                </div>

                {detail.conditionNotes ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Notes
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-800">
                      {detail.conditionNotes}
                    </p>
                  </div>
                ) : null}

                <InspectionMediaGallery title="This inspection" inspection={detail} />

                {compare?.pickup || compare?.return ? (
                  <div className="space-y-3 border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Compare pickup vs return
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-100 p-2.5">
                        <InspectionMediaGallery title="Pickup" inspection={compare.pickup} />
                      </div>
                      <div className="rounded-xl border border-slate-100 p-2.5">
                        <InspectionMediaGallery title="Return" inspection={compare.return} />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 sm:px-5">
            <Button variant="outline" className="w-full sm:w-auto" onClick={closeDetail}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
