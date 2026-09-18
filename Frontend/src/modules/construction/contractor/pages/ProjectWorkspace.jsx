import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import contractorApi from "../services/contractorApi";
import ContractorShell from "../components/ContractorShell";
import MoneyBar from "../../shared/MoneyBar";
import StageTimeline from "../../shared/StageTimeline";
import { PhotoPicker } from "../../shared/FilePicker";
import DocumentVault from "../../shared/DocumentVault";
import MessageThread from "../../shared/MessageThread";
import DisputePanel from "../../shared/DisputePanel";
import {
  fullMoney,
  dateTime,
  shortDate,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
} from "../../shared/format";

/**
 * BRD W14–W16 — where the contractor actually works a project.
 *
 * The submission form is the important part. BRD W16 makes photographs the thing
 * that unlocks payment, so the form refuses to submit without one and says so
 * up front rather than after a failed attempt — a contractor who has climbed
 * down off a site to file a claim should not be told at the last step that they
 * needed a photograph they can no longer take.
 *
 * Stages are submitted in order. Rather than letting a contractor fill in a form
 * that the server will reject, later stages simply do not offer the form and
 * explain which stage is blocking.
 */
export default function ProjectWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [activeStageId, setActiveStageId] = useState(null);
  const [tab, setTab] = useState("work");
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const result = await contractorApi.getProject(id);
      setData(result);
      setError("");
      // Land on whatever needs attention, not on stage 1 forever.
      const stages = result?.stages || [];
      const next = stages.find((s) => ["in_progress", "rejected", "submitted_for_approval"].includes(s.status))
        || stages.find((s) => s.status === "pending");
      setActiveStageId((current) => current || (next ? String(next._id) : null));
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load this project");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    contractorApi.unreadMessages(id).then(setUnread).catch(() => {});
  }, [id, tab]);

  const project = data?.project;
  const stages = useMemo(() => data?.stages || [], [data]);
  const activeStage = useMemo(
    () => stages.find((s) => String(s._id) === String(activeStageId)) || null,
    [stages, activeStageId],
  );

  // Which stage is the contractor allowed to work on? The first that is not done.
  const currentSequence = useMemo(() => {
    const open = stages.find((s) => !["approved", "payment_released", "skipped"].includes(s.status));
    return open?.sequence ?? null;
  }, [stages]);

  if (loading) {
    return (
      <ContractorShell title="Project">
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-2xl bg-gray-100" />
          <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      </ContractorShell>
    );
  }

  if (!project) {
    return (
      <ContractorShell title="Project">
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error || "Project not found"}
        </p>
        <button
          type="button"
          onClick={() => navigate("/contractor/projects")}
          className="mt-4 text-sm font-medium text-blue-700"
        >
          ← Back to projects
        </button>
      </ContractorShell>
    );
  }

  return (
    <ContractorShell
      title={project.title || project.projectNumber}
      subtitle={[
        project.projectNumber,
        project.customerId?.name,
        project.customerId?.phone,
      ].filter(Boolean).join(" · ")}
      action={
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${
            PROJECT_STATUS_TONE[project.status] || "bg-gray-100 text-gray-600 ring-gray-200"
          }`}
        >
          {PROJECT_STATUS_LABEL[project.status] || project.status}
        </span>
      }
    >
      <WorkspaceTabs active={tab} unread={unread} onChange={setTab} />

      {tab === "documents" && (
        <DocumentVault projectId={id} api={contractorApi} side="contractor" />
      )}

      {tab === "messages" && (
        <MessageThread
          projectId={id}
          api={contractorApi}
          side="contractor"
          peerName={project.customerId?.name || "the customer"}
        />
      )}

      {tab === "disputes" && (
        <DisputePanel
          projectId={id}
          api={contractorApi}
          stages={stages}
          side="contractor"
        />
      )}

      {tab === "work" && (
      <>
      {flash && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{flash}</p>
      )}
      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {project.status === "awaiting_funding" && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
          <span className="font-medium">Do not start work yet.</span> The customer has not paid
          the money in, so nothing is held against this project and no stage can be claimed.
        </p>
      )}

      {project.status === "on_hold" && (
        <p className="rounded-xl bg-orange-50 px-4 py-3 text-sm leading-relaxed text-orange-800">
          <span className="font-medium">This project is on hold.</span>{" "}
          {project.holdReason || "Our team has paused it."} You cannot claim stages until it resumes.
        </p>
      )}

      <MoneyBar
        money={{
          agreedValue: project.agreedValue,
          fundedAmount: project.fundedAmount,
          releasedAmount: project.releasedAmount,
          refundedAmount: project.refundedAmount,
          retentionHeld: project.retentionHeld,
          retentionDueAt: project.retentionDueAt,
        }}
        side="contractor"
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Stages</h2>
        <StageTimeline
          stages={stages}
          side="contractor"
          activeId={activeStageId}
          onSelect={(s) =>
            setActiveStageId((c) => (String(s._id) === String(c) ? null : String(s._id)))
          }
        />
      </section>

      {activeStage && (
        <StageWorkPanel
          key={activeStage._id}
          stage={activeStage}
          project={project}
          isCurrent={activeStage.sequence === currentSequence}
          blockedBy={
            activeStage.sequence !== currentSequence
              ? stages.find((s) => s.sequence === currentSequence)
              : null
          }
          onDone={async (message) => {
            setFlash(message);
            await load();
          }}
          onError={setError}
        />
      )}
      </>
      )}
    </ContractorShell>
  );
}

/**
 * Workspace tabs (BRD W14-W16, C19, C20, Q15).
 *
 * "Work" leads, because a contractor opening a project is nearly always here to
 * record progress or claim a stage. Documents, the conversation and disputes are
 * things they come to when something has gone sideways.
 */
function WorkspaceTabs({ active, unread, onChange }) {
  const TABS = [
    ["work", "Work"],
    ["documents", "Documents"],
    ["messages", "Messages"],
    ["disputes", "Disputes"],
  ];

  return (
    <div className="-mx-4 mb-4 border-b border-gray-200 bg-white px-2">
      <div className="flex gap-0.5 overflow-x-auto">
        {TABS.map(([value, label]) => {
          const isActive = active === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange(value)}
              aria-current={isActive ? "page" : undefined}
              className={`relative shrink-0 px-3.5 py-2.5 text-xs font-bold transition-colors ${
                isActive ? "text-orange-600" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {label}
              {value === "messages" && unread > 0 && (
                <span className="ml-1.5 inline-flex min-w-[1.1rem] justify-center rounded-full bg-orange-500 px-1 text-[10px] leading-[1.1rem] text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
              {isActive && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-orange-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StageWorkPanel({ stage, project, isCurrent, blockedBy, onDone, onError }) {
  const [notes, setNotes] = useState(stage.notes || "");
  const [photos, setPhotos] = useState([]);
  const [progress, setProgress] = useState(Number(stage.progressPercent) || 0);
  const [busy, setBusy] = useState("");

  const workable = project.status === "active" && isCurrent;
  const canSubmit = workable && ["pending", "in_progress", "rejected"].includes(stage.status);

  const retentionPct = Number(project.retentionPercent) || 0;
  const retained = stage.isRetention
    ? 0
    : Math.round(((Number(stage.amount) || 0) * retentionPct) / 100 * 100) / 100;
  const payable = Math.round(((Number(stage.amount) || 0) - retained) * 100) / 100;

  const saveProgress = async () => {
    setBusy("progress");
    try {
      await contractorApi.updateStageProgress(stage._id, { progressPercent: progress, notes });
      await onDone("Progress saved. The customer can see it.");
    } catch (err) {
      onError(err?.response?.data?.message || "Could not save progress");
    } finally {
      setBusy("");
    }
  };

  const submit = async () => {
    setBusy("submit");
    try {
      await contractorApi.submitStage(stage._id, {
        progressPercent: 100,
        notes: notes.trim(),
        photos,
      });
      await onDone("Sent to the customer for approval.");
      setPhotos([]);
    } catch (err) {
      onError(err?.response?.data?.message || "Could not submit this stage");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">{stage.name}</h2>
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{fullMoney(payable)}</span> to you
          {retained > 0 && ` · ${fullMoney(retained)} retention`}
        </p>
      </div>

      {stage.description && (
        <p className="mt-1 text-sm leading-relaxed text-gray-600">{stage.description}</p>
      )}
      {stage.targetDate && (
        <p className="mt-1 text-xs text-gray-500">Target date {shortDate(stage.targetDate)}</p>
      )}

      {stage.status === "rejected" && stage.rejectionReason && (
        <div className="mt-4 rounded-xl bg-rose-50 px-3.5 py-3">
          <p className="text-xs font-medium text-rose-900">The customer sent this back</p>
          <p className="mt-1 text-sm leading-relaxed text-rose-800">{stage.rejectionReason}</p>
        </div>
      )}

      {stage.status === "submitted_for_approval" && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-3 text-sm leading-relaxed text-amber-800">
          Submitted {dateTime(stage.submittedAt)}. Waiting for the customer to approve — the
          payment is released the moment they do.
        </p>
      )}

      {stage.status === "payment_released" && (
        <p className="mt-4 rounded-xl bg-emerald-50 px-3.5 py-3 text-sm leading-relaxed text-emerald-800">
          {fullMoney(stage.releasedAmount)} was released to your wallet
          {stage.releasedAt ? ` on ${shortDate(stage.releasedAt)}` : ""}.
          {Number(stage.retainedAmount) > 0 &&
            ` ${fullMoney(stage.retainedAmount)} is held as retention until the defect liability period ends.`}
        </p>
      )}

      {!isCurrent && blockedBy && !["approved", "payment_released"].includes(stage.status) && (
        <p className="mt-4 rounded-xl bg-gray-50 px-3.5 py-3 text-sm leading-relaxed text-gray-600">
          Stages are approved in order. Finish{" "}
          <span className="font-medium">{blockedBy.name}</span> first.
        </p>
      )}

      {canSubmit && (
        <div className="mt-5 space-y-4 border-t border-gray-100 pt-5">
          <div>
            <label htmlFor="progress" className="block text-xs font-medium text-gray-700">
              How far along is this stage? {progress}%
            </label>
            <input
              id="progress"
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="mt-2 w-full accent-gray-900"
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-xs font-medium text-gray-700">
              What was done
            </label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the work completed in this stage."
              className="mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-3 text-sm outline-none focus:border-gray-500"
            />
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700">
              Photographs of the completed work
              <span className="ml-1 font-normal text-gray-500">— required</span>
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              This is the evidence the customer approves against. Clear photographs get
              approved faster and disputed less.
            </p>
            <div className="mt-2">
              <PhotoPicker
                values={photos}
                onChange={setPhotos}
                max={10}
                folder="construction/stages"
                label="Add site photographs"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveProgress}
              disabled={Boolean(busy)}
              className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 disabled:opacity-50"
            >
              {busy === "progress" ? "Saving…" : "Save progress"}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={photos.length === 0 || Boolean(busy)}
              className="flex-1 rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "submit" ? "Submitting…" : "Submit for approval"}
            </button>
          </div>
          {photos.length === 0 && (
            <p className="text-center text-xs text-gray-500">
              Add at least one photograph to submit this stage.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
