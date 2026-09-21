import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, FileSignature, MapPin, Phone } from "lucide-react";
import { PageHeader, AdminTable, StatusBadge } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import constructionAdminApi from "../services/adminApi";
import { ContractPanel, SiteVisitSection } from "../components/PackageQuotation";
import { dateTime, fullMoney } from "../../shared/format";
import { CN_ADMIN_PAGE_CLASS, CN_DIALOG_CONTENT_CLASS } from "../utils/adminTheme";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const PAGE_SIZE = 20;

/**
 * A quotation exists once the contractor's site visit report is in. `awaiting` = the report
 * is in and the office has not sent a price yet; the rest follow the quotation's own status.
 */
const TABS = [
  { value: "all", label: "All" },
  { value: "awaiting", label: "To quote" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Declined" },
];

const STATE = {
  awaiting: { label: "To quote", tone: "warning" },
  sent: { label: "Awaiting customer", tone: "info" },
  accepted: { label: "Accepted", tone: "success" },
  rejected: { label: "Declined", tone: "danger" },
};

const stateOf = (row) => {
  const status = row.contract?.status;
  return !status || status === "none" ? "awaiting" : status;
};

const shortRef = (row) => `#${String(row._id).slice(-6).toUpperCase()}`;

const PAGES = [
  { segment: "residential", label: "Residential Quotations", path: "/admin/construction/end-to-end/residential/quotations" },
  { segment: "commercial", label: "Commercial Quotations", path: "/admin/construction/end-to-end/commercial/quotations" },
];

/** Quotations for one segment (see the routes): residential and commercial never share a list. */
export default function PackageQuotations({ segment = "residential" }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [counts, setCounts] = useState({});
  const [tab, setTab] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await constructionAdminApi.getPackageRequests({
        segment,
        quotation: tab,
        page,
        limit: PAGE_SIZE,
      });
      setRows(result.rows);
      setMeta(result.meta);
      setCounts(result.counts?.quotations || {});
      // Keep an open dialog in step with what just changed under it.
      setSelected((current) => (current ? result.rows.find((r) => r._id === current._id) || current : current));
    } catch (error) {
      toast.error(errorMessage(error, "Could not load quotations"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, segment, page]);

  const tabClass = (active) =>
    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors " +
    (active
      ? "border-[#FF6A00] bg-[#FFF3EB] text-[#FF6A00]"
      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50");

  const stateChip = (row) => {
    const info = STATE[stateOf(row)];
    return <StatusBadge tone={info.tone} label={info.label} />;
  };

  const priceCell = (row) =>
    row.contract?.price ? (
      <div>
        <p className="font-semibold tabular-nums text-gray-900">{fullMoney(row.contract.price)}</p>
        <p className="text-xs text-gray-500">Estimate {fullMoney(row.estimatedCost)}</p>
      </div>
    ) : (
      <div>
        <p className="text-sm text-gray-400">Not quoted</p>
        <p className="text-xs text-gray-500">Estimate {fullMoney(row.estimatedCost)}</p>
      </div>
    );

  const columns = [
    {
      key: "number",
      header: "Quotation",
      cell: (row) => (
        <div>
          <p className="font-semibold text-gray-900">{row.contract?.number || "Not sent yet"}</p>
          <p className="text-xs text-gray-500">
            {shortRef(row)} · {dateTime(row.contract?.sentAt || row.visit?.report?.submittedAt || row.updatedAt)}
          </p>
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
    {
      key: "package",
      header: "Package",
      cell: (row) => (
        <div>
          <p className="text-sm text-gray-900">{row.package?.name}</p>
          <p className="text-xs text-gray-500">{row.site?.city}</p>
        </div>
      ),
    },
    {
      key: "contractor",
      header: "Contractor",
      cell: (row) => <span className="text-sm text-gray-800">{row.assignedContractorId?.businessName || "—"}</span>,
    },
    { key: "price", header: "Price", cell: priceCell },
    { key: "state", header: "Status", cell: stateChip },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Button variant="outline" size="sm" onClick={() => setSelected(row)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" /> {stateOf(row) === "awaiting" ? "Create" : "View"}
        </Button>
      ),
    },
  ];

  const renderMobileCard = (row) => (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{row.contract?.number || `Request ${shortRef(row)}`}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {row.contact?.name} · {row.site?.city}
          </p>
        </div>
        {stateChip(row)}
      </div>
      <p className="mt-2 text-xs text-gray-600">{row.package?.name}</p>
      <div className="mt-2">{priceCell(row)}</div>
      <div className="mt-3 border-t border-gray-200/80 pt-2">
        <Button size="sm" variant="outline" className="h-8 w-full text-xs" onClick={() => setSelected(row)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" /> {stateOf(row) === "awaiting" ? "Create quotation" : "View quotation"}
        </Button>
      </div>
    </div>
  );

  const title = segment === "commercial" ? "Commercial Quotations" : "Residential Quotations";

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <PageHeader
        eyebrow="Construction · End to End"
        title={title}
        description={`Quotations for ${segment} site visits. Once a contractor sends the site visit report, write the price and terms here and send them to the customer to accept.`}
        actions={
          <div className="flex gap-2">
            {PAGES.map((p) => (
              <button
                key={p.segment}
                type="button"
                onClick={() => navigate(p.path)}
                className={tabClass(p.segment === segment)}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            className={tabClass(tab === t.value)}
            onClick={() => {
              setTab(t.value);
              setPage(1);
            }}
          >
            {t.label} ({counts[t.value] || 0})
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
          icon: <FileSignature className="h-10 w-10" />,
          title: tab === "all" ? "No quotations yet" : `No ${TABS.find((t) => t.value === tab)?.label.toLowerCase()} quotations`,
          description:
            tab === "all"
              ? "A quotation appears here once a contractor has sent the site visit report for a booking."
              : "Try another tab.",
        }}
      />

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-2xl`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">
              {selected?.contract?.number ? `Quotation ${selected.contract.number}` : `Quotation for request ${selected ? shortRef(selected) : ""}`}
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
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Site</p>
                  <p className="mt-1 flex items-start gap-1.5 text-gray-900">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span>
                      {selected.site?.address || [selected.site?.city, selected.site?.area].filter(Boolean).join(" · ")}
                      {selected.site?.landmark ? <span className="block text-xs text-gray-500">Landmark: {selected.site.landmark}</span> : null}
                    </span>
                  </p>
                  {selected.site?.location?.coordinates?.length === 2 ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${selected.site.location.coordinates[1]},${selected.site.location.coordinates[0]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs font-semibold text-[#FF6A00] hover:underline"
                    >
                      Open the pin in maps
                    </a>
                  ) : null}
                  <p className="mt-0.5 text-xs text-gray-500">
                    {selected.package?.name} · estimate {fullMoney(selected.estimatedCost)}
                  </p>
                </div>
              </div>

              {/* The booking the quotation is for */}
              <div className="overflow-hidden rounded-xl border border-gray-200 text-sm">
                <div className="flex justify-between px-3 py-2.5">
                  <span className="text-gray-500">Package</span>
                  <span className="text-right font-medium text-gray-900">
                    {selected.package?.name} · {selected.package?.segment}
                  </span>
                </div>
                <div className="flex justify-between border-t border-gray-100 px-3 py-2.5">
                  <span className="text-gray-500">Rate when booked</span>
                  <span className="tabular-nums text-gray-900">
                    {fullMoney(selected.package?.price)} {selected.package?.unit}
                  </span>
                </div>
                <div className="flex justify-between border-t border-gray-100 px-3 py-2.5">
                  <span className="text-gray-500">Area</span>
                  <span className="tabular-nums text-gray-900">
                    {Number(selected.site?.totalBuiltUpArea || 0).toLocaleString("en-IN")} sq.ft ·{" "}
                    {selected.site?.floors} floor{selected.site?.floors === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex justify-between border-t border-gray-100 px-3 py-2.5">
                  <span className="text-gray-500">Contractor</span>
                  <span className="text-right text-gray-900">
                    {selected.assignedContractorId?.businessName || "—"}
                    {selected.assignedContractorId?.phone ? (
                      <a href={`tel:${selected.assignedContractorId.phone}`} className="ml-2 text-[#FF6A00] hover:underline">
                        {selected.assignedContractorId.phone}
                      </a>
                    ) : null}
                  </span>
                </div>
                <div className="flex justify-between border-t border-gray-100 px-3 py-2.5">
                  <span className="text-gray-500">Visiting fee</span>
                  <span className="text-gray-900">
                    {selected.payment?.status === "paid"
                      ? `Paid ${fullMoney(selected.payment.amount)}${selected.payment.paidAt ? ` · ${dateTime(selected.payment.paidAt)}` : ""}`
                      : selected.payment?.status === "refunded"
                        ? "Refunded"
                        : "No fee"}
                  </span>
                </div>
                {selected.notes ? (
                  <div className="border-t border-gray-100 px-3 py-2.5">
                    <p className="text-xs text-gray-500">Customer's note</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-gray-900">{selected.notes}</p>
                  </div>
                ) : null}
              </div>

              {/* The quotation itself: full details, and the form to write or revise it */}
              <ContractPanel key={`${selected._id}-${selected.contract?.revision || 0}`} request={selected} onChanged={load} />

              {/* What the quotation is based on */}
              <SiteVisitSection request={selected} />

              {stateOf(selected) === "awaiting" && !selected.visit?.report ? (
                <p className="text-sm text-gray-500">The site visit report has not been sent yet.</p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="shrink-0 gap-2 border-t border-gray-100 px-4 py-3 sm:px-5">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setSelected(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
