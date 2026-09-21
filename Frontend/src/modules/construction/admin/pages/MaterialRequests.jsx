import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, MapPin, Phone, ShoppingBasket } from "lucide-react";
import { PageHeader, AdminTable, StatusBadge } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import constructionAdminApi from "../services/adminApi";
import { dateTime, fullMoney } from "../../shared/format";
import {
  CN_ADMIN_PAGE_CLASS,
  CN_ADMIN_SELECT_CLASS,
  CN_DIALOG_CONTENT_CLASS,
} from "../utils/adminTheme";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const PAGE_SIZE = 20;

/** The order a request normally travels in. Cancelled can happen from anywhere. */
const STATUSES = [
  { value: "new", label: "New", tone: "warning" },
  { value: "contacted", label: "Contacted", tone: "info" },
  { value: "quoted", label: "Quoted", tone: "primary" },
  { value: "fulfilled", label: "Fulfilled", tone: "success" },
  { value: "cancelled", label: "Cancelled", tone: "danger" },
];

const statusMeta = (value) => STATUSES.find((s) => s.value === value) || STATUSES[0];

/** A short reference the office can read out over the phone. */
const shortRef = (row) => `#${String(row._id).slice(-6).toUpperCase()}`;

const itemCount = (row) => {
  const n = row.items?.length || 0;
  return `${n} item${n === 1 ? "" : "s"}`;
};

export default function MaterialRequests() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [counts, setCounts] = useState({});
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState(null);
  const [nextStatus, setNextStatus] = useState("new");
  const [adminNote, setAdminNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await constructionAdminApi.getMaterialRequests({
        status: status || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setRows(result.rows);
      setMeta(result.meta);
      setCounts(result.counts);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load material requests"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page]);

  const totalAll = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const openRequest = (row) => {
    setSelected(row);
    setNextStatus(row.status);
    setAdminNote(row.adminNote || "");
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await constructionAdminApi.updateMaterialRequestStatus(selected._id, {
        status: nextStatus,
        adminNote,
      });
      toast.success("Request updated");
      setSelected(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not update the request"));
    } finally {
      setSaving(false);
    }
  };

  const statusChip = (row) => {
    const info = statusMeta(row.status);
    return <StatusBadge tone={info.tone} label={info.label} />;
  };

  const columns = [
    {
      key: "ref",
      header: "Request",
      cell: (row) => (
        <div>
          <p className="font-semibold text-gray-900">{shortRef(row)}</p>
          <p className="text-xs text-gray-500">{dateTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{row.contact?.name}</p>
          <a
            href={`tel:${row.contact?.phone}`}
            className="text-xs text-[#FF6A00] hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.contact?.phone}
          </a>
        </div>
      ),
    },
    { key: "city", header: "Deliver to", cell: (row) => row.delivery?.city || "—" },
    {
      key: "items",
      header: "Items",
      cell: (row) => (
        <div>
          <p className="text-sm text-gray-900">{itemCount(row)}</p>
          <p className="text-xs tabular-nums text-gray-500">≈ {fullMoney(row.estimatedTotal)}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: statusChip },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Button variant="outline" size="sm" onClick={() => openRequest(row)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" /> View
        </Button>
      ),
    },
  ];

  const renderMobileCard = (row) => (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">
            {shortRef(row)} · {row.contact?.name}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {dateTime(row.createdAt)} · {row.delivery?.city}
          </p>
        </div>
        {statusChip(row)}
      </div>
      <p className="mt-2 text-xs text-gray-600">
        {itemCount(row)} · ≈ {fullMoney(row.estimatedTotal)}
      </p>
      <div className="mt-3 border-t border-gray-200/80 pt-2">
        <Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={() => openRequest(row)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" /> View request
        </Button>
      </div>
    </div>
  );

  const tabClass = (active) =>
    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors " +
    (active
      ? "border-[#FF6A00] bg-[#FFF3EB] text-[#FF6A00]"
      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50");

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <PageHeader
        eyebrow="Construction · Material Services"
        title="Material Requests"
        description="Quote requests customers send from the Materials section of the app. Nothing is charged: call the customer, agree the price and delivery, and move the request along."
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          className={tabClass(status === "")}
          onClick={() => {
            setStatus("");
            setPage(1);
          }}
        >
          All ({totalAll})
        </button>
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={tabClass(status === s.value)}
            onClick={() => {
              setStatus(s.value);
              setPage(1);
            }}
          >
            {s.label} ({counts[s.value] || 0})
          </button>
        ))}
      </div>

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
          pageSize: PAGE_SIZE,
          onPageChange: setPage,
        }}
        emptyState={{
          icon: <ShoppingBasket className="h-10 w-10" />,
          title: status ? `No ${statusMeta(status).label.toLowerCase()} requests` : "No requests yet",
          description: status
            ? "Try another status."
            : "When a customer asks for a quote on materials, it appears here.",
        }}
      />

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-2xl`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">
              Request {selected ? shortRef(selected) : ""}
            </DialogTitle>
          </DialogHeader>

          {selected ? (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Customer</p>
                  <p className="mt-1 font-semibold text-gray-900">{selected.contact?.name}</p>
                  <a
                    href={`tel:${selected.contact?.phone}`}
                    className="mt-0.5 inline-flex items-center gap-1.5 text-[#FF6A00] hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {selected.contact?.phone}
                  </a>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Deliver to</p>
                  <p className="mt-1 flex items-start gap-1.5 text-gray-900">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span>
                      {selected.delivery?.city}
                      {selected.delivery?.address ? `, ${selected.delivery.address}` : ""}
                    </span>
                  </p>
                </div>
              </div>

              {selected.notes ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Customer's note
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-gray-800">{selected.notes}</p>
                </div>
              ) : null}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Materials requested
                </p>
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  {(selected.items || []).map((line, index) => (
                    <div
                      key={`${line.materialId}-${index}`}
                      className="flex items-start justify-between gap-3 border-b border-gray-100 px-3 py-2.5 text-sm last:border-b-0"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{line.name}</p>
                        <p className="text-xs text-gray-500">
                          {[line.brand, line.category].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-gray-600">
                          {line.quantity} × {fullMoney(line.price)} {line.unit}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums text-gray-900">
                        {fullMoney(line.lineTotal)}
                      </p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-gray-50 px-3 py-2.5 text-sm">
                    <span className="font-semibold text-gray-700">Estimated total (at list price)</span>
                    <span className="font-bold tabular-nums text-gray-900">
                      {fullMoney(selected.estimatedTotal)}
                    </span>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  Prices are the ones the customer was shown when they sent this — later price
                  changes do not affect it.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">Status</span>
                  <select
                    className={CN_ADMIN_SELECT_CLASS}
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                    disabled={saving}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  Internal note
                </span>
                <Textarea
                  placeholder="Agreed price, delivery date, who spoke to the customer… (never shown to the customer)"
                  rows={3}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  disabled={saving}
                />
              </label>
            </div>
          ) : null}

          <DialogFooter className="shrink-0 gap-2 border-t border-gray-100 px-4 py-3 sm:px-5">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setSelected(null)}
              disabled={saving}
            >
              Close
            </Button>
            <Button className="w-full sm:w-auto" isLoading={saving} onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
