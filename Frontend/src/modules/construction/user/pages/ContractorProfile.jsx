import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BadgeCheck, Building2, MapPin, ShieldCheck, Star } from "lucide-react";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader, SectionLabel } from "../components/ui";
import { shortDate, fullMoney } from "../../shared/format";
import { TRUST_BANDS } from "./Contractors";

/**
 * BRD C7 — the contractor's public page.
 *
 * "Verification badges, trust score, photographs of completed work, the kinds of
 * work they specialise in, and reviews from past customers. This is where trust
 * is actually created. Without it, every contractor looks identical."
 *
 * The order on this page is the order trust is built in: who checked them, what
 * they have actually built, then what their customers said. The trust score sits
 * near the top but never alone — a number with no evidence behind it is just a
 * number, and the BRD is explicit that the photographs and reviews are the point.
 *
 * A contractor with no history shows "New" rather than a low score. That is the
 * honest answer, and pretending otherwise would rank a brand-new firm below one
 * with a string of complaints.
 */
export default function ContractorProfile() {
  const { contractorId } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    constructionApi
      .getContractorProfile(contractorId)
      .then((r) => { if (!cancelled) setC(r); })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.message || "Could not load this contractor");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [contractorId]);

  if (loading) {
    return (
      <ConstructionPageShell>
        <ConstructionPageHeader title="Contractor" backTo="/construction/contractors" />
        <div className="space-y-3 p-4">
          <div className="h-32 animate-pulse rounded-xl bg-slate-200/70" />
          <div className="h-40 animate-pulse rounded-xl bg-slate-200/70" />
        </div>
      </ConstructionPageShell>
    );
  }

  if (!c) {
    return (
      <ConstructionPageShell>
        <ConstructionPageHeader title="Contractor" backTo="/construction/contractors" />
        <div className="p-4">
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
            {error || "Contractor not found"}
          </p>
        </div>
      </ConstructionPageShell>
    );
  }

  const band = TRUST_BANDS[c.trustBand] || TRUST_BANDS.new;

  return (
    <ConstructionPageShell>
      <ConstructionPageHeader
        title={c.businessName}
        subtitle={c.contractorCode || "Verified contractor"}
        backTo="/construction/contractors"
      />

      <div className="space-y-5 px-4 py-4">
        {/* ---- who they are ---- */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3.5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
              {c.profileImage ? (
                <img src={c.profileImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-6 w-6 text-slate-400" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                <span className="truncate">{c.businessName}</span>
                {c.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 fill-blue-500 text-white" />}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-600">
                {c.totalRatings > 0 ? (
                  <span className="inline-flex items-center gap-0.5 font-bold text-amber-600">
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                    {c.rating} · {c.totalRatings} review{c.totalRatings === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span>No reviews yet</span>
                )}
                {c.completedProjects > 0 && <span>{c.completedProjects} projects completed</span>}
                {c.yearsExperience > 0 && <span>{c.yearsExperience} years in business</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${band.tone}`}>
                  {band.label}
                  {c.trustScore != null ? ` · ${c.trustScore}/100` : ""}
                </span>
                {c.isAvailable === false && (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                    Fully booked right now
                  </span>
                )}
              </div>
            </div>
          </div>

          {c.about && (
            <p className="mt-3 border-t border-slate-100 pt-3 text-[12px] leading-relaxed text-slate-600">
              {c.about}
            </p>
          )}

          {c.cities?.length > 0 && (
            <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              <MapPin className="h-3.5 w-3.5" /> Works in {c.cities.join(", ")}
            </p>
          )}
        </section>

        {/* ---- what we checked ---- */}
        {c.verifiedDocuments?.length > 0 && (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="flex items-center gap-1.5 text-xs font-black text-emerald-900">
              <ShieldCheck className="h-4 w-4" /> Checked by SMS Pro
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-emerald-800">
              Our team has seen and verified these documents. The files themselves stay
              private to the contractor.
            </p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {c.verifiedDocuments.map((d) => (
                <li
                  key={d}
                  className="rounded-md bg-white px-2 py-1 text-[10.5px] font-bold text-emerald-800 ring-1 ring-emerald-200"
                >
                  {d}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---- what they have built ---- */}
        <section>
          <SectionLabel>Work they have done</SectionLabel>
          {(c.portfolio || []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-7 text-center text-[12px] text-slate-500">
              This contractor has not added photographs of past work yet.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {c.portfolio.map((p) => (
                <li key={p.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {p.images?.length > 0 && (
                    <div className="flex gap-1 overflow-x-auto">
                      {p.images.map((img, i) => (
                        <a
                          key={`${img}-${i}`}
                          href={img}
                          target="_blank"
                          rel="noreferrer"
                          className="h-32 w-40 shrink-0 bg-slate-100"
                        >
                          <img src={img} alt={p.title} loading="lazy" className="h-full w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="p-3">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <span className="truncate">{p.title}</span>
                      {p.isVerified && (
                        <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[9.5px] font-bold text-blue-700">
                          Checked
                        </span>
                      )}
                    </p>
                    {p.description && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
                        {p.description}
                      </p>
                    )}
                    <p className="mt-1 flex flex-wrap gap-x-2 text-[10.5px] text-slate-400">
                      {p.location && <span>{p.location}</span>}
                      {p.completedAt && <span>· {shortDate(p.completedAt)}</span>}
                      {p.projectValue > 0 && <span>· {fullMoney(p.projectValue)}</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- what customers said ---- */}
        <section>
          <SectionLabel>
            Reviews {c.reviews?.length > 0 ? `(${c.reviews.length})` : ""}
          </SectionLabel>
          {(c.reviews || []).length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-7 text-center text-[12px] leading-relaxed text-slate-500">
              No reviews yet. Reviews can only be left by customers whose project
              actually finished on the platform.
            </p>
          ) : (
            <ul className="space-y-2">
              {c.reviews.map((r, i) => (
                <li key={`${r.at}-${i}`} className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={`h-3.5 w-3.5 ${
                            n <= r.rating ? "fill-amber-500 text-amber-500" : "text-slate-200"
                          }`}
                        />
                      ))}
                    </span>
                    <span className="text-[10.5px] text-slate-400">{shortDate(r.at)}</span>
                  </div>
                  {r.review && (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-slate-700">{r.review}</p>
                  )}
                  <p className="mt-1.5 text-[10.5px] text-slate-500">
                    {r.by}
                    {r.service ? ` · ${r.service}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <button
          type="button"
          onClick={() => navigate("/construction")}
          className="w-full rounded-xl bg-slate-900 px-4 py-3 text-xs font-black text-white"
        >
          Start an enquiry
        </button>
        <p className="px-1 pb-2 text-center text-[10.5px] leading-relaxed text-slate-500">
          You cannot pick a contractor directly — raise an enquiry and verified firms,
          including this one, will send you written quotes to compare.
        </p>
      </div>
    </ConstructionPageShell>
  );
}
