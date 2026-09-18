import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Minus, Sparkles, TrendingUp } from "lucide-react";
import contractorApi from "../services/contractorApi";
import ContractorShell from "../components/ContractorShell";

/**
 * BRD W18 — the contractor's trust score.
 *
 * "Gives contractors a concrete reason to behave well, and gives customers
 * something to compare."
 *
 * The first half of that sentence is what this screen is for, and it only works
 * if the contractor can see WHY the number is what it is and WHAT to do about
 * it. So the layout is: the number, then what is costing you the most points,
 * then the full breakdown. A bare score with no explanation changes nobody's
 * behaviour — it just feels arbitrary and unfair.
 *
 * A new contractor is shown "New", never a low number. Scoring someone at 15/100
 * because they have not finished a project yet would be both meaningless and
 * discouraging, and it would push them below contractors with actual complaints.
 */
const BAND_STYLE = {
  new: { label: "New contractor", ring: "ring-slate-300", text: "text-slate-700", bg: "bg-slate-100" },
  building: { label: "Building reputation", ring: "ring-amber-300", text: "text-amber-700", bg: "bg-amber-50" },
  good: { label: "Good", ring: "ring-blue-300", text: "text-blue-700", bg: "bg-blue-50" },
  excellent: { label: "Excellent", ring: "ring-emerald-300", text: "text-emerald-700", bg: "bg-emerald-50" },
};

const AREA_LABEL = {
  completion: "Finishing what you start",
  rating: "Customer ratings",
  disputes: "Complaint history",
  compliance: "Documents up to date",
  response: "Answering enquiries quickly",
};

export default function TrustScore() {
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    contractorApi
      .getMyScore()
      .then((s) => { if (!cancelled) setScore(s); })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.message || "Could not load your score");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <ContractorShell title="Trust score">
        <div className="space-y-3">
          <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
          <div className="h-48 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      </ContractorShell>
    );
  }

  if (error || !score) {
    return (
      <ContractorShell title="Trust score">
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error || "No score yet"}
        </p>
      </ContractorShell>
    );
  }

  const band = BAND_STYLE[score.band] || BAND_STYLE.new;
  const delta = Number(score.score) - Number(score.previousScore || 0);
  const hasPrevious = Number(score.previousScore) > 0;

  return (
    <ContractorShell
      title="Trust score"
      subtitle="What customers see, and how to improve it"
    >
      <div className="space-y-5">
        {/* ---- the number ---- */}
        <section className={`rounded-2xl border p-5 text-center ${band.bg} ${band.ring} ring-1`}>
          {score.isProvisional ? (
            <>
              <Sparkles className={`mx-auto h-6 w-6 ${band.text}`} />
              <p className={`mt-2 text-2xl font-extrabold ${band.text}`}>New</p>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-gray-600">
                Customers see &ldquo;New&rdquo; rather than a number until you have finished
                a few projects. That is deliberate — a low score from having no history
                would be unfair and would push you below contractors with real complaints.
              </p>
              <p className="mt-2 text-[11px] font-semibold text-gray-500">
                {score.stats?.projectsCompleted || 0} of 3 projects completed
              </p>
            </>
          ) : (
            <>
              <p className={`text-4xl font-extrabold ${band.text}`}>{score.score}</p>
              <p className="mt-0.5 text-xs font-medium text-gray-500">out of 100</p>
              <p className={`mt-2 text-sm font-bold ${band.text}`}>{band.label}</p>
              {hasPrevious && (
                <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600">
                  {delta > 0 ? (
                    <><ArrowUp className="h-3 w-3 text-emerald-600" /> up {delta.toFixed(1)}</>
                  ) : delta < 0 ? (
                    <><ArrowDown className="h-3 w-3 text-rose-600" /> down {Math.abs(delta).toFixed(1)}</>
                  ) : (
                    <><Minus className="h-3 w-3" /> unchanged</>
                  )}{" "}
                  since the last update
                </p>
              )}
            </>
          )}
        </section>

        {/* ---- what to fix first ---- */}
        {score.improvements?.length > 0 && (
          <section>
            <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider text-gray-500">
              <TrendingUp className="h-3.5 w-3.5" /> Where you can gain most
            </h2>
            <ul className="space-y-2">
              {score.improvements.slice(0, 3).map((item) => (
                <li
                  key={item.area}
                  className="rounded-xl border border-gray-200 bg-white p-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">
                        {AREA_LABEL[item.area] || item.area}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                        {item.detail}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
                      +{item.pointsAvailable}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---- full breakdown ---- */}
        <section>
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-gray-500">
            How it is worked out
          </h2>
          <ul className="space-y-2.5">
            {Object.entries(score.components || {}).map(([key, c]) => (
              <li key={key} className="rounded-xl border border-gray-200 bg-white p-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-bold text-gray-900">
                    {AREA_LABEL[key] || key}
                  </p>
                  <p className="shrink-0 text-xs font-semibold text-gray-500">
                    {c.value}/100 · worth {c.weight}%
                  </p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${
                      c.value >= 80 ? "bg-emerald-500" : c.value >= 50 ? "bg-amber-500" : "bg-rose-500"
                    }`}
                    style={{ width: `${Math.min(100, c.value)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{c.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- the raw numbers ---- */}
        <section>
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-gray-500">
            The figures behind it
          </h2>
          <dl className="grid grid-cols-2 gap-2.5">
            {[
              ["Projects completed", score.stats?.projectsCompleted],
              ["Projects cancelled", score.stats?.projectsCancelled],
              ["Average rating", score.stats?.averageRating ? `${score.stats.averageRating} / 5` : "—"],
              ["Complaints upheld", score.stats?.disputesUpheld],
              ["Expired documents", score.stats?.expiredDocuments],
              [
                "Typical reply time",
                score.stats?.medianResponseHours
                  ? `${Math.round(score.stats.medianResponseHours)}h`
                  : "—",
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-gray-200 bg-white p-3">
                <dt className="text-[11px] text-gray-500">{label}</dt>
                <dd className="mt-0.5 text-sm font-bold text-gray-900">{value ?? 0}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="px-1 pb-2 text-[11px] leading-relaxed text-gray-500">
          Recalculated every night from your actual record — it is never adjusted by hand.
          {score.calculatedAt
            ? ` Last updated ${new Date(score.calculatedAt).toLocaleDateString("en-IN")}.`
            : ""}
        </p>
      </div>
    </ContractorShell>
  );
}
