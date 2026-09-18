import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Clock, FileText, LogOut, XCircle } from "lucide-react";
import contractorApi from "../services/contractorApi";
import { setContractorAuth, clearContractorAuth, getContractorUser } from "../utils/authContractor";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;

const DOC_LABEL = {
  contractor_license: "Contractor licence",
  business_registration: "Business registration",
  gst_certificate: "GST certificate",
  labour_license: "Labour licence",
  pf_registration: "PF registration",
  esi_registration: "ESI registration",
  insurance: "Insurance",
  trade_certificate: "Trade certificate",
  iso_certificate: "ISO certificate",
  other: "Document",
};

/**
 * BRD W4 — verification status.
 *
 * "Waiting without information is the main reason applicants give up", so this
 * screen always says exactly where the application stands and what is still
 * outstanding, document by document.
 */
export default function ContractorStatus() {
  const navigate = useNavigate();
  const [contractor, setContractor] = useState(getContractorUser());
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [me, docs] = await Promise.all([
        contractorApi.getMe(),
        contractorApi.listDocuments().catch(() => []),
      ]);
      setContractor(me);
      setDocuments(docs);
      // Keep the cached session in step, so the route guard sends them to the
      // dashboard the moment approval lands.
      const token = localStorage.getItem("auth_contractor");
      if (token) setContractorAuth(token, me);
      if (me?.status === "approved") navigate("/contractor/dashboard", { replace: true });
      if (me?.status === "onboarding" || me?.status === "rejected") {
        navigate("/contractor/register", { replace: true });
      }
    } catch (error) {
      toast.error(errorMessage(error, "Could not load your status"));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const signOut = () => {
    clearContractorAuth();
    navigate("/contractor/login", { replace: true });
  };

  const pending = documents.filter((d) => d.status === "pending").length;
  const verified = documents.filter((d) => d.status === "verified").length;
  const rejected = documents.filter((d) => d.status === "rejected");

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5">
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-bold tracking-tight text-gray-900">
            {contractor?.businessName || "Your registration"}
          </h1>
          {contractor?.contractorCode ? (
            <p className="text-xs text-gray-500">{contractor.contractorCode}</p>
          ) : null}
        </div>
        <button type="button" onClick={signOut} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Sign out">
          <LogOut className="h-4.5 w-4.5" />
        </button>
      </header>

      <div className="px-4 py-6">
        {loading ? (
          <div className="space-y-3">
            <div className="h-28 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <h2 className="text-[15px] font-bold text-amber-900">
                    Your registration is being verified
                  </h2>
                  <p className="mt-1 text-[13px] leading-relaxed text-amber-800">
                    Our team is checking your licences and registrations. This usually takes a
                    couple of working days. We will notify you as soon as it is done.
                  </p>
                  {contractor?.submittedAt ? (
                    <p className="mt-2 text-xs text-amber-700">
                      Submitted {new Date(contractor.submittedAt).toLocaleDateString("en-IN", {
                        day: "numeric", month: "long", year: "numeric",
                      })}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {rejected.length ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex gap-3">
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-red-900">
                      {rejected.length} document{rejected.length === 1 ? "" : "s"} need attention
                    </h3>
                    <ul className="mt-1.5 space-y-1">
                      {rejected.map((d) => (
                        <li key={d._id} className="text-[13px] leading-relaxed text-red-800">
                          <strong>{d.label || DOC_LABEL[d.type]}</strong>
                          {d.rejectionReason ? ` — ${d.rejectionReason}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}

            <section className="mt-6">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="text-[13px] font-bold uppercase tracking-wider text-gray-500">
                  Your documents
                </h3>
                <span className="text-xs text-gray-500 tabular-nums">
                  {verified} verified · {pending} pending
                </span>
              </div>

              <ul className="space-y-2">
                {documents.map((d) => (
                  <li key={d._id} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
                    {d.status === "verified" ? (
                      <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-600" />
                    ) : d.status === "rejected" ? (
                      <XCircle className="h-4.5 w-4.5 shrink-0 text-red-500" />
                    ) : (
                      <FileText className="h-4.5 w-4.5 shrink-0 text-gray-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {d.label || DOC_LABEL[d.type] || d.type}
                      </p>
                      <p className="text-xs text-gray-500">
                        {d.expiresAt
                          ? `Expires ${new Date(d.expiresAt).toLocaleDateString("en-IN")}`
                          : "No expiry"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      d.status === "verified" ? "bg-emerald-50 text-emerald-700"
                        : d.status === "rejected" ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700"}`}
                    >
                      {d.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <button
              type="button"
              onClick={() => { setLoading(true); load(); }}
              className="mt-6 w-full rounded-xl border border-gray-300 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Check again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
