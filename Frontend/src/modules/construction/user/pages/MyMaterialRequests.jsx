import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, Layers, MapPin } from "lucide-react";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader, EmptyState } from "../components/ui";
import { fullMoney, shortDate } from "../../shared/format";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const STATUS = {
  new: { label: "Sent — awaiting review", tone: "bg-amber-50 text-amber-800" },
  quoted: { label: "Quote ready — respond", tone: "bg-blue-50 text-blue-800" },
  accepted: { label: "Accepted — preparing delivery", tone: "bg-emerald-50 text-emerald-800" },
  rejected: { label: "Quote declined", tone: "bg-slate-100 text-slate-700" },
  dispatched: { label: "On the way", tone: "bg-blue-50 text-blue-800" },
  delivered: { label: "Delivered", tone: "bg-emerald-50 text-emerald-800" },
  cancelled: { label: "Cancelled", tone: "bg-slate-100 text-slate-700" },
};

const shortRef = (id) => `#${String(id).slice(-6).toUpperCase()}`;
const displayTotal = (r) => (r.quotation?.status && r.quotation.status !== 'none' ? r.quotation.grandTotal : r.estimatedTotal);

/** Every basket of materials the customer has asked a quote for, newest first. */
export default function MyMaterialRequests() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    constructionApi
      .listMyMaterialRequests()
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e) => { if (!cancelled) toast.error(errorMessage(e, "Could not load your material requests")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <ConstructionPageShell>
      <ConstructionPageHeader
        title="Material Requests"
        subtitle={loading ? "Loading…" : `${rows.length} request${rows.length === 1 ? "" : "s"}`}
        backTo="/construction/materials"
      />
      <div className="px-4 py-6">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200/80" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No material requests yet"
            detail="Add materials to a request from the Materials section and send it for a quote. You can follow it here."
            action={
              <button
                type="button"
                onClick={() => navigate("/construction/materials")}
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-white"
              >
                Browse materials
              </button>
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => {
              const status = STATUS[r.status] || STATUS.new;
              return (
                <li key={r._id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/construction/material-requests/${r._id}`)}
                    className="group flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-2xs transition-all hover:border-blue-400/80 active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-extrabold text-slate-900">
                          {r.items?.length || 0} material{(r.items?.length || 0) === 1 ? "" : "s"}
                        </p>
                        <span className="font-mono text-[11px] font-bold text-slate-400">{shortRef(r._id)}</span>
                      </div>
                      <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${status.tone}`}>
                        {status.label}
                      </span>
                      <p className="mt-2 flex items-center gap-1 text-xs font-medium text-slate-500">
                        <MapPin className="h-3 w-3" />
                        {r.delivery?.city} · {fullMoney(displayTotal(r))} · {shortDate(r.createdAt)}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 group-hover:text-blue-600" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ConstructionPageShell>
  );
}
