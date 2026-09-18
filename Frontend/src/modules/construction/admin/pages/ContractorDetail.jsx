import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, Check, ExternalLink, ShieldAlert, X,
} from "lucide-react";
import { PageHeader, SectionCard, StatusBadge } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import constructionAdminApi from "../services/adminApi";
import { CN_ADMIN_PAGE_CLASS, CN_DIALOG_CONTENT_CLASS } from "../utils/adminTheme";

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

const STATUS_LABEL = {
  onboarding: "Registering",
  pending_approval: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
};

/** StatusBadge has no alias for `pending_approval` — map tone explicitly. */
const STATUS_TONE = {
  onboarding: "info",
  pending_approval: "warning",
  approved: "success",
  rejected: "danger",
};

const money = (n) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN")}`;

function Row({ label, children }) {
  return (
    <div className="flex gap-3 border-b border-gray-100 py-2.5 last:border-0">
      <span className="w-40 shrink-0 text-[13px] text-gray-500">{label}</span>
      <span className="min-w-0 flex-1 text-[14px] text-gray-900">{children || "—"}</span>
    </div>
  );
}

/**
 * BRD A3 — one contractor's full record, and the screen where licences are
 * actually verified (Rule 6).
 *
 * Approval is deliberately blocked in the UI while any document is unverified
 * or expired. The server refuses it too; showing why here saves your team a
 * pointless round trip and makes the rule visible rather than mysterious.
 */
export default function ContractorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // 'reject' | 'suspend' | { doc }
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await constructionAdminApi.getContractor(id));
    } catch (error) {
      toast.error(errorMessage(error, "Could not load this contractor"));
      navigate("/admin/construction/contractors", { replace: true });
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn, successMessage) => {
    setBusy(true);
    try {
      await fn();
      toast.success(successMessage);
      setDialog(null);
      setReason("");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "That did not work"));
    } finally {
      setBusy(false);
    }
  };

  if (loading || !data) {
    return (
      <div className={CN_ADMIN_PAGE_CLASS}>
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  const { contractor, documents, portfolio } = data;
  const pendingDocs = documents.filter((d) => d.status === "pending");
  const expiredDocs = documents.filter(
    (d) => d.expiresAt && new Date(d.expiresAt).getTime() < Date.now(),
  );
  const blockers = [];
  if (documents.length === 0) blockers.push("No documents uploaded");
  if (pendingDocs.length) blockers.push(`${pendingDocs.length} document(s) not verified yet`);
  if (expiredDocs.length) blockers.push(`${expiredDocs.length} document(s) expired`);

  const canApprove = contractor.status !== "approved" && blockers.length === 0;

  return (
    <div className={CN_ADMIN_PAGE_CLASS}>
      <button
        type="button"
        onClick={() => navigate("/admin/construction/contractors")}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to contractors
      </button>

      <PageHeader
        eyebrow={contractor.contractorCode || "Contractor"}
        title={contractor.businessName}
        description={`${contractor.ownerName} · ${contractor.phone}${contractor.email ? ` · ${contractor.email}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={contractor.status} tone={STATUS_TONE[contractor.status]} label={STATUS_LABEL[contractor.status]} />
            {contractor.status !== "approved" ? (
              <Button
                disabled={!canApprove || busy}
                isLoading={busy}
                onClick={() => act(() => constructionAdminApi.approveContractor(id), "Contractor approved")}
              >
                <Check className="mr-1.5 h-4 w-4" /> Approve
              </Button>
            ) : null}
            {contractor.status === "pending_approval" ? (
              <Button variant="outline" onClick={() => setDialog("reject")} disabled={busy}>
                Reject
              </Button>
            ) : null}
            {contractor.status === "approved" && contractor.isActive !== false ? (
              <Button variant="outline" className="border-red-200 text-red-600" onClick={() => setDialog("suspend")} disabled={busy}>
                Suspend
              </Button>
            ) : null}
            {contractor.isActive === false ? (
              <Button
                variant="outline"
                onClick={() => act(() => constructionAdminApi.activateContractor(id), "Contractor reactivated")}
                disabled={busy}
              >
                Reactivate
              </Button>
            ) : null}
          </div>
        }
      />

      {blockers.length && contractor.status !== "approved" ? (
        <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Cannot approve yet
            </p>
            <ul className="mt-1 list-inside list-disc text-[13px] text-amber-800">
              {blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
            <p className="mt-1.5 text-xs text-amber-700">
              A verified badge backed by an unchecked licence is worse than no badge —
              customers are trusting it.
            </p>
          </div>
        </div>
      ) : null}

      {contractor.rejectionReason ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5">
          <p className="text-sm font-semibold text-red-900">Last rejection</p>
          <p className="mt-0.5 text-[13px] text-red-800">{contractor.rejectionReason}</p>
        </div>
      ) : null}

      <SectionCard title="Documents" subtitle="Verify each one before approving (BRD Rule 6)">
        {documents.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">No documents uploaded.</p>
        ) : (
          <ul className="space-y-2">
            {documents.map((d) => {
              const expired = d.expiresAt && new Date(d.expiresAt).getTime() < Date.now();
              return (
                <li key={d._id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {d.label || DOC_LABEL[d.type] || d.type}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {d.documentNumber ? `${d.documentNumber} · ` : ""}
                      {d.expiresAt
                        ? `Expires ${new Date(d.expiresAt).toLocaleDateString("en-IN")}`
                        : "No expiry"}
                    </p>
                    {expired ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                        <ShieldAlert className="h-3 w-3" /> Expired — ask for a current copy
                      </p>
                    ) : null}
                    {d.rejectionReason ? (
                      <p className="mt-1 text-xs text-red-600">{d.rejectionReason}</p>
                    ) : null}
                  </div>

                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#FF6A00] hover:underline"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </a>

                  <StatusBadge status={d.status} />

                  {d.status !== "verified" && !expired ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => act(() => constructionAdminApi.verifyDocument(d._id), "Document verified")}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                  {d.status !== "rejected" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-200 text-red-600"
                      disabled={busy}
                      onClick={() => setDialog({ doc: d })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Business details">
        <Row label="Business type">{contractor.businessType}</Row>
        <Row label="Experience">{contractor.yearsExperience} years</Row>
        <Row label="Work they take on">
          {contractor.trades?.map((t) => t.name).filter(Boolean).join(", ")}
        </Row>
        <Row label="Areas covered">{contractor.serviceAreas?.join(", ")}</Row>
        <Row label="Travel radius">
          {contractor.travelRadiusKm ? `${contractor.travelRadiusKm} km` : "—"}
        </Row>
        <Row label="Project size">
          {money(contractor.projectSizeMin)} – {money(contractor.projectSizeMax)}
        </Row>
        <Row label="Projects at once">{contractor.maxConcurrentProjects}</Row>
        <Row label="About">{contractor.about}</Row>
      </SectionCard>

      <SectionCard title="Identity and bank">
        <Row label="PAN">{contractor.documents?.panNumber}</Row>
        <Row label="Aadhaar">
          {contractor.documents?.aadhaarNumber
            ? contractor.documents.aadhaarNumber.replace(/.(?=.{4})/g, "•")
            : "—"}
        </Row>
        <Row label="GST">{contractor.documents?.gstNumber}</Row>
        <Row label="Bank">{contractor.bank?.bankName}</Row>
        <Row label="Account holder">{contractor.bank?.accountHolderName}</Row>
        <Row label="Account number">
          {contractor.bank?.accountNumber
            ? contractor.bank.accountNumber.replace(/.(?=.{4})/g, "•")
            : "—"}
        </Row>
        <Row label="IFSC">{contractor.bank?.ifscCode}</Row>
      </SectionCard>

      {portfolio?.length ? (
        <SectionCard title="Past work" subtitle={`${portfolio.length} entries`}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {portfolio.map((p) => (
              <li key={p._id} className="rounded-xl border border-gray-200 p-3">
                <p className="text-sm font-semibold text-gray-900">{p.title}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {p.location || "—"}
                  {p.projectValue ? ` · ${money(p.projectValue)}` : ""}
                </p>
                {p.description ? (
                  <p className="mt-1.5 line-clamp-2 text-xs text-gray-600">{p.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {contractor.statusHistory?.length ? (
        <SectionCard title="History" subtitle="Every status change, permanently recorded">
          <ul className="space-y-2">
            {[...contractor.statusHistory].reverse().map((h, i) => (
              <li key={i} className="flex gap-3 border-b border-gray-100 pb-2 last:border-0">
                <span className="w-40 shrink-0 text-xs text-gray-500">
                  {new Date(h.at).toLocaleString("en-IN")}
                </span>
                <span className="min-w-0 flex-1 text-[13px]">
                  <strong className="text-gray-900">{h.status}</strong>
                  {h.reason ? <span className="text-gray-600"> — {h.reason}</span> : null}
                  {h.changedByName ? (
                    <span className="text-gray-400"> ({h.changedByName})</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {/* Reason dialogs — every rejection and suspension must carry one. */}
      <Dialog open={Boolean(dialog)} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className={`${CN_DIALOG_CONTENT_CLASS} max-w-md`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">
              {dialog === "reject" ? "Reject this registration"
                : dialog === "suspend" ? "Suspend this contractor"
                  : "Reject this document"}
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 py-4 sm:px-5">
            <p className="mb-2.5 text-sm text-gray-600">
              {dialog === "reject"
                ? "The contractor sees this reason and resubmits through the same form, so be specific about what to fix."
                : dialog === "suspend"
                  ? "They lose access immediately. The reason is recorded permanently."
                  : "The contractor sees this and can upload a replacement."}
            </p>
            <Textarea
              rows={3}
              placeholder="Reason…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-gray-100 px-4 py-3 sm:px-5">
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={busy}
              disabled={!reason.trim()}
              onClick={() => {
                if (dialog === "reject") {
                  act(() => constructionAdminApi.rejectContractor(id, reason), "Registration rejected");
                } else if (dialog === "suspend") {
                  act(() => constructionAdminApi.suspendContractor(id, reason), "Contractor suspended");
                } else {
                  act(() => constructionAdminApi.rejectDocument(dialog.doc._id, reason), "Document rejected");
                }
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
