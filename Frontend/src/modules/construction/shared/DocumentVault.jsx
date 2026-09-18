import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ChevronDown, FileText, History, Plus, Shield, X,
} from "lucide-react";
import { DocumentPicker } from "./FilePicker";
import { dateTime, shortDate } from "./format";

/**
 * The project document vault (BRD C19).
 *
 * "All project papers in one organised place. Older versions are kept and
 * clearly marked as superseded. These papers are needed years later, for
 * resale, insurance or repairs."
 *
 * Two things the UI has to get right, both of them about years-later:
 *
 *   The MISSING list is as important as the filed one. A customer at handover
 *   needs to know the completion certificate never arrived, and nothing in a
 *   list of what IS there communicates what is not.
 *
 *   A superseded version must be reachable but never mistakable for current.
 *   Folded behind "3 versions", greyed, and labelled — never sitting in the
 *   main list where someone might build off last month's drawing.
 *
 * Shared by the customer and contractor screens; `api` is the surface's own
 * client so neither side has to know about the other's routes.
 */
export default function DocumentVault({ projectId, api, canUpload = true, side = "customer" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [supersedes, setSupersedes] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api.listProjectDocuments(projectId));
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load the documents");
    } finally {
      setLoading(false);
    }
  }, [api, projectId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
    );
  }

  const groups = data?.groups || [];
  const missing = data?.missingTypes || [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-900">Project documents</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Kept permanently — you will want these years from now.
          </p>
        </div>
        {canUpload && (
          <button
            type="button"
            onClick={() => { setSupersedes(null); setShowAdd(true); }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
          {error}
        </p>
      )}

      {/* What is still missing — the question that actually matters at handover. */}
      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5" />
            {missing.length} document type{missing.length === 1 ? "" : "s"} not filed yet
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {missing.map((type) => (
              <li
                key={type}
                className="rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200"
              >
                {type}
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
          <FileText className="mx-auto mb-2 h-7 w-7 text-slate-300" />
          <p className="text-xs font-bold text-slate-800">No documents yet</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Drawings, agreements, approvals, bills and warranty papers belong here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.documentType}>
              <h3 className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                {group.documentType}
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((doc) => (
                  <li key={doc._id}>
                    <DocumentRow
                      doc={doc}
                      side={side}
                      canUpload={canUpload}
                      onSupersede={() => { setSupersedes(doc); setShowAdd(true); }}
                      onHistory={() => setHistoryFor(doc)}
                      onRevoke={async (reason) => {
                        try {
                          await api.revokeProjectDocument(projectId, doc._id, reason);
                          await load();
                        } catch (err) {
                          setError(err?.response?.data?.message || "Could not withdraw it");
                        }
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {showAdd && (
        <AddDocumentDialog
          availableTypes={data?.availableTypes || []}
          supersedes={supersedes}
          onClose={() => { setShowAdd(false); setSupersedes(null); }}
          onSubmit={async (body) => {
            await api.addProjectDocument(projectId, body);
            setShowAdd(false);
            setSupersedes(null);
            await load();
          }}
        />
      )}

      {historyFor && (
        <HistoryDialog
          projectId={projectId}
          api={api}
          doc={historyFor}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}

function DocumentRow({ doc, canUpload, onSupersede, onHistory, onRevoke }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div
      className={`rounded-xl border p-3 ${
        doc.isRevoked ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <a
            href={doc.fileUrl}
            target="_blank"
            rel="noreferrer"
            className={`block truncate text-xs font-bold ${
              doc.isRevoked ? "text-slate-400 line-through" : "text-slate-900 hover:text-amber-700"
            }`}
          >
            {doc.title}
          </a>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-slate-500">
            <span>{shortDate(doc.createdAt)}</span>
            <span>· by {doc.uploadedByType.toLowerCase()}</span>
            {doc.version > 1 && <span>· version {doc.version}</span>}
            {doc.visibleToCustomer === false && (
              <span className="inline-flex items-center gap-0.5 font-semibold text-violet-700">
                <Shield className="h-3 w-3" /> internal
              </span>
            )}
          </p>
          {doc.isRevoked && (
            <p className="mt-1 rounded-lg bg-rose-50 px-2 py-1 text-[10.5px] text-rose-700">
              Withdrawn: {doc.revokedReason}
            </p>
          )}
        </div>
      </div>

      {!doc.isRevoked && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
          {doc.version > 1 && (
            <button
              type="button"
              onClick={onHistory}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-bold text-slate-600 hover:bg-slate-100"
            >
              <History className="h-3 w-3" /> {doc.version} versions
            </button>
          )}
          {canUpload && (
            <>
              <button
                type="button"
                onClick={onSupersede}
                className="rounded-lg px-2 py-1 text-[10.5px] font-bold text-slate-600 hover:bg-slate-100"
              >
                Upload new version
              </button>
              <button
                type="button"
                onClick={() => setConfirming((v) => !v)}
                className="rounded-lg px-2 py-1 text-[10.5px] font-bold text-rose-600 hover:bg-rose-50"
              >
                Withdraw
              </button>
            </>
          )}
        </div>
      )}

      {confirming && (
        <div className="mt-2 rounded-lg bg-slate-50 p-2.5">
          <p className="text-[10.5px] leading-relaxed text-slate-600">
            The document stays in the record, marked as withdrawn. It is never deleted.
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is it being withdrawn?"
            className="mt-2 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] outline-none focus:border-slate-500"
          />
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-[10.5px] font-bold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={reason.trim().length < 5}
              onClick={() => { onRevoke(reason.trim()); setConfirming(false); }}
              className="rounded-lg bg-rose-600 px-2.5 py-1 text-[10.5px] font-bold text-white disabled:opacity-50"
            >
              Withdraw it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddDocumentDialog({ availableTypes, supersedes, onClose, onSubmit }) {
  const [documentType, setDocumentType] = useState(supersedes?.documentType || availableTypes[0] || "");
  const [title, setTitle] = useState(supersedes ? `${supersedes.title} (revised)` : "");
  const [fileUrl, setFileUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const valid = documentType && title.trim() && fileUrl;

  return (
    <Modal title={supersedes ? "Upload a new version" : "Add a document"} onClose={onClose}>
      {supersedes && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          This will become version {(supersedes.version || 1) + 1}. Version{" "}
          {supersedes.version || 1} is kept and marked superseded — it is never deleted.
        </p>
      )}

      <label className="block text-[11px] font-bold text-slate-700" htmlFor="doc-type">
        What kind of document
      </label>
      <select
        id="doc-type"
        value={documentType}
        onChange={(e) => setDocumentType(e.target.value)}
        disabled={Boolean(supersedes)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500 disabled:bg-slate-50"
      >
        {availableTypes.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>

      <label className="mt-3 block text-[11px] font-bold text-slate-700" htmlFor="doc-title">
        Name it
      </label>
      <input
        id="doc-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Approved structural drawing, rev B"
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500"
      />

      <div className="mt-3">
        <p className="text-[11px] font-bold text-slate-700">The file</p>
        <div className="mt-1">
          <DocumentPicker
            value={fileUrl}
            onChange={setFileUrl}
            folder="construction/project-documents"
            label="Upload document"
          />
        </div>
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{error}</p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-700"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onSubmit({
                documentType,
                title: title.trim(),
                fileUrl,
                supersedesId: supersedes?._id,
              });
            } catch (err) {
              setError(err?.response?.data?.message || "Could not save it");
            } finally {
              setBusy(false);
            }
          }}
          className="flex-1 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : supersedes ? "File new version" : "Add document"}
        </button>
      </div>
    </Modal>
  );
}

function HistoryDialog({ projectId, api, doc, onClose }) {
  const [versions, setVersions] = useState(null);

  useEffect(() => {
    api.projectDocumentHistory(projectId, doc._id)
      .then((r) => setVersions(r?.versions || []))
      .catch(() => setVersions([]));
  }, [api, projectId, doc._id]);

  return (
    <Modal title={doc.title} onClose={onClose}>
      <p className="mb-3 text-[11px] text-slate-500">
        Every version is kept. The current one is at the top.
      </p>
      {versions === null ? (
        <div className="h-20 animate-pulse rounded-lg bg-slate-200/70" />
      ) : (
        <ol className="space-y-2">
          {versions.map((v) => (
            <li
              key={v._id}
              className={`rounded-lg border p-2.5 ${
                v.isLatest ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <a
                  href={v.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-[11px] font-bold text-slate-900 hover:underline"
                >
                  Version {v.version} — {v.title}
                </a>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    v.isLatest ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-700"
                  }`}
                >
                  {v.isLatest ? "Current" : "Superseded"}
                </span>
              </div>
              <p className="mt-0.5 text-[10.5px] text-slate-500">
                Filed {dateTime(v.createdAt)}
                {v.supersededAt ? ` · replaced ${shortDate(v.supersededAt)}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-black text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
