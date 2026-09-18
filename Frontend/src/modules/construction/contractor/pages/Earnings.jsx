import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import contractorApi from "../services/contractorApi";
import ContractorShell from "../components/ContractorShell";
import { fullMoney, shortDate, STAGE_STATUS_LABEL_CONTRACTOR } from "../../shared/format";

/**
 * BRD W17 — earnings and settlements.
 *
 * Four figures, in the order a contractor actually asks about them:
 *   in my wallet          money they can withdraw today
 *   awaiting approval     work they have finished and claimed
 *   held for my projects  money that exists but is not theirs yet
 *   earned to date        the cumulative number
 *
 * "Held for your projects" is the figure that makes escrow bearable from the
 * contractor's side: it proves the customer's money is real and sitting there,
 * which is the whole promise BRD §13 makes to them.
 */
export default function Earnings() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await contractorApi.getEarnings();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message || "Could not load your earnings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <ContractorShell title="Earnings">
        <div className="space-y-3">
          <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />
          <div className="h-48 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      </ContractorShell>
    );
  }

  if (error) {
    return (
      <ContractorShell title="Earnings">
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      </ContractorShell>
    );
  }

  const projectById = new Map((data?.projects || []).map((p) => [String(p._id), p]));

  return (
    <ContractorShell
      title="Earnings"
      subtitle="What you have been paid, and what is waiting"
    >
      <div className="grid grid-cols-2 gap-3">
        <Figure
          label="In your wallet"
          value={data?.walletBalance}
          tone="text-gray-900"
          note="Available to withdraw"
        />
        <Figure
          label="Awaiting approval"
          value={data?.awaitingApproval}
          tone="text-amber-700"
          note="Stages you have claimed"
        />
        <Figure
          label="Held for your projects"
          value={data?.heldAgainstYourProjects}
          tone="text-blue-700"
          note="Customer money already paid in"
        />
        <Figure
          label="Earned to date"
          value={data?.totalEarned}
          tone="text-emerald-700"
          note="Across all projects"
        />
      </div>

      <p className="rounded-xl bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-800">
        Money shown as <span className="font-medium">held</span> is the customer&apos;s payment
        sitting in escrow against your projects. It reaches your wallet stage by stage, as each
        one is approved.
      </p>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Recent stages</h2>
        {(data?.recentStages || []).length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
            Nothing here yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {data.recentStages.map((s) => {
              const project = projectById.get(String(s.projectId));
              const released = s.status === "payment_released";
              return (
                <li key={s._id}>
                  <button
                    type="button"
                    onClick={() => project && navigate(`/contractor/projects/${project._id}`)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {s.name}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {project?.title || project?.projectNumber || "Project"}
                        {" · "}
                        {STAGE_STATUS_LABEL_CONTRACTOR[s.status] || s.status}
                        {released && s.releasedAt ? ` · ${shortDate(s.releasedAt)}` : ""}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-sm font-semibold ${
                        released ? "text-emerald-700" : "text-gray-400"
                      }`}
                    >
                      {released ? `+${fullMoney(s.releasedAmount)}` : fullMoney(s.amount)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(data?.projects || []).length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">By project</h2>
          <ul className="space-y-2">
            {data.projects.map((p) => {
              const held = Math.max(
                0,
                (Number(p.fundedAmount) || 0) - (Number(p.releasedAmount) || 0) - (Number(p.refundedAmount) || 0),
              );
              return (
                <li
                  key={p._id}
                  className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {p.title || p.projectNumber}
                    </p>
                    <p className="text-xs text-gray-500">{fullMoney(p.agreedValue)} contract</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span className="text-emerald-700">
                      {fullMoney(p.releasedAmount)} paid to you
                    </span>
                    {held > 0.005 && (
                      <span className="text-blue-700">{fullMoney(held)} held</span>
                    )}
                    {Number(p.retentionPercent) > 0 && (
                      <span className="text-gray-500">{p.retentionPercent}% retention</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </ContractorShell>
  );
}

function Figure({ label, value, tone, note }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone}`}>{fullMoney(value)}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-gray-400">{note}</p>
    </div>
  );
}
