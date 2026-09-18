import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, Search } from "lucide-react";
import VendorLayout from "../components/VendorLayout";
import VendorModal from "../components/VendorModal";
import { bikeVendorApi } from "../services/vendorApi";
import { InspectionMediaGallery } from "../../shared/components/InspectionMediaForm";

const message = (error, fallback) => error?.response?.data?.message || fallback;
const idOf = (row) => row?.id || row?._id;
const when = (value) => (value ? new Date(value).toLocaleString() : "—");
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const TYPE_LABEL = { PICKUP: "Pickup", RETURN: "Return" };
const TYPE_STYLE = {
  PICKUP: "bg-blue-50 text-blue-600",
  RETURN: "bg-purple-50 text-purple-600",
};

export default function VendorInspections() {
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
      const result = await bikeVendorApi.getInspections({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.page, meta.limit, search, inspectionType]);

  const openDetail = async (row) => {
    setDetail(row);
    setCompare(null);
    setDetailLoading(true);
    try {
      if (row.bookingId) {
        const result = await bikeVendorApi.getBookingInspections(row.bookingId);
        setCompare(result);
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

  const pickupCount = rows.filter((row) => row.inspectionType === "PICKUP").length;
  const returnCount = rows.filter((row) => row.inspectionType === "RETURN").length;

  return (
    <VendorLayout
      title="Inspections"
      subtitle="Pickup and return condition records across all your bookings"
    >
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl border border-gray-200 bg-white px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Total</p>
          <p className="mt-1 text-lg font-black text-gray-900">{meta.total || 0}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Pickup (page)</p>
          <p className="mt-1 text-lg font-black text-gray-900">{pickupCount}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Return (page)</p>
          <p className="mt-1 text-lg font-black text-gray-900">{returnCount}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className="h-10 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm"
              placeholder="Search booking number…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setMeta((value) => ({ ...value, page: 1 }));
              }}
            />
          </div>
          <select
            className="h-10 rounded-xl border border-gray-200 px-3 text-sm sm:w-40"
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

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border border-gray-200 bg-gray-100" />
            ))}
          </div>
        ) : rows.length ? (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={idOf(row)}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {row.bookingNumber || row.bookingId || "—"}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        TYPE_STYLE[row.inspectionType] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {TYPE_LABEL[row.inspectionType] || row.inspectionType}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {row.bikeName || "—"} · {row.customerName || "—"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400">{when(row.inspectedAt)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-gray-400">
                    {(row.images || []).length} img · {(row.videos || []).length} vid
                  </p>
                  <button
                    type="button"
                    onClick={() => openDetail(row)}
                    className="mt-1 inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50"
                  >
                    <Eye size={13} /> View
                  </button>
                </div>
              </div>
            ))}

            {meta.pages > 1 ? (
              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  disabled={meta.page <= 1}
                  onClick={() => setMeta((value) => ({ ...value, page: value.page - 1 }))}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 disabled:opacity-40"
                >
                  Previous
                </button>
                <p className="text-xs text-gray-500">
                  Page {meta.page} of {meta.pages}
                </p>
                <button
                  type="button"
                  disabled={meta.page >= meta.pages}
                  onClick={() => setMeta((value) => ({ ...value, page: value.page + 1 }))}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center">
            <p className="text-sm font-bold text-gray-900">No inspections yet</p>
            <p className="mt-1 text-xs text-gray-500">
              Pickup and return inspections appear here after hub handover.
            </p>
          </div>
        )}
      </div>

      <VendorModal open={Boolean(detail)} title="Inspection" onClose={closeDetail} wide>
        {detail ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Bike</p>
                <p className="mt-0.5 truncate text-sm font-bold text-gray-900">{detail.bikeName || "—"}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Customer</p>
                <p className="mt-0.5 truncate text-sm font-bold text-gray-900">{detail.customerName || "—"}</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Inspected</p>
                <p className="mt-0.5 truncate text-sm font-bold text-gray-900">{when(detail.inspectedAt)}</p>
              </div>
              {detail.meterReading != null ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Meter</p>
                  <p className="mt-0.5 truncate text-sm font-bold text-gray-900">{detail.meterReading}</p>
                </div>
              ) : null}
              {detail.fuelLevel ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Fuel</p>
                  <p className="mt-0.5 truncate text-sm font-bold text-gray-900">{detail.fuelLevel}</p>
                </div>
              ) : null}
              {Number(detail.repairCharges || 0) > 0 ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Repair charges</p>
                  <p className="mt-0.5 truncate text-sm font-bold text-gray-900">{money(detail.repairCharges)}</p>
                </div>
              ) : null}
            </div>

            {detail.conditionNotes ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Notes</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-800">{detail.conditionNotes}</p>
              </div>
            ) : null}

            <InspectionMediaGallery title="This inspection" inspection={detail} />

            {detailLoading ? (
              <div className="h-16 animate-pulse rounded-xl border border-gray-200 bg-gray-100" />
            ) : compare?.pickup || compare?.return ? (
              <div className="space-y-3 border-t border-gray-100 pt-3">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Compare pickup vs return
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-100 p-2.5">
                    <InspectionMediaGallery title="Pickup" inspection={compare.pickup} />
                  </div>
                  <div className="rounded-xl border border-gray-100 p-2.5">
                    <InspectionMediaGallery title="Return" inspection={compare.return} />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </VendorModal>
    </VendorLayout>
  );
}
