import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, Clock, HardHat, Minus, ShieldCheck, ChevronRight, Building2 } from "lucide-react";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader } from "../components/ui";

const formatBudget = ({ min, max } = {}) => {
  if (min == null && max == null) return null;
  const short = (n) => {
    const value = Number(n);
    if (!Number.isFinite(value)) return null;
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(value % 10000000 ? 1 : 0)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(value % 100000 ? 1 : 0)} L`;
    return `₹${value.toLocaleString("en-IN")}`;
  };
  if (min != null && max != null) return `${short(min)} – ${short(max)}`;
  if (min != null) return `From ${short(min)}`;
  return `Up to ${short(max)}`;
};

/**
 * BRD C2 — Service Detail Page.
 * Sets early expectations: covers, excludes, timeline, and typical budget.
 */
export default function ServiceDetail() {
  const { idOrSlug } = useParams();
  const navigate = useNavigate();
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    constructionApi
      .getServiceDetail(idOrSlug)
      .then((data) => {
        if (!cancelled) setService(data);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error?.response?.data?.message || "Could not load this service");
          navigate("/construction", { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idOrSlug, navigate]);

  const budget = formatBudget(service?.typicalBudget);

  return (
    <ConstructionPageShell showBottomNav={false}>
      <ConstructionPageHeader
        title={loading ? "Loading Service…" : service?.name || "Service Details"}
        subtitle="Transparent scope · Written quotes · Verified contractors"
        backTo="/construction"
        right={
          <button
            type="button"
            onClick={() => navigate("/construction/enquiries")}
            className="rounded-xl bg-amber-500/10 px-3 py-1.5 text-xs font-extrabold text-amber-700 hover:bg-amber-500/20 transition-colors"
          >
            My Enquiries
          </button>
        }
      />

      {loading ? (
        <div className="space-y-4 px-4 py-6">
          <div className="h-44 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-6 w-2/3 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-4 w-1/2 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-32 animate-pulse rounded-xl bg-slate-200/80" />
        </div>
      ) : !service ? null : (
        <div className="space-y-6 px-4 py-6 pb-28">
          {/* Cover Hero */}
          {service.coverImage ? (
            <div className="relative overflow-hidden rounded-xl shadow-md border border-slate-200">
              <img
                src={service.coverImage}
                alt={service.name}
                className="h-52 w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
              {service.category ? (
                <span className="absolute bottom-3 left-3.5 rounded-md bg-amber-500/90 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white backdrop-blur-md">
                  {service.category.name}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="flex h-36 w-full items-center justify-center rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/60 border border-amber-200 text-amber-600 shadow-2xs">
              <Building2 className="h-12 w-12 stroke-[1.8]" />
            </div>
          )}

          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{service.name}</h1>

            {service.description ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-600 font-medium">{service.description}</p>
            ) : null}

            {(service.typicalDurationText || budget) && (
              <div className="mt-4 flex flex-wrap gap-2.5">
                {service.typicalDurationText ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                    <Clock className="h-4 w-4 text-slate-500 stroke-[2.2]" />
                    {service.typicalDurationText}
                  </span>
                ) : null}
                {budget ? (
                  <span className="inline-flex items-center rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-extrabold text-amber-800 ring-1 ring-amber-500/20">
                    Typically {budget}
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* Included Items */}
          {service.covers?.length ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs space-y-3">
              <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                What this usually includes
              </h2>
              <ul className="space-y-2.5">
                {service.covers.map((item, index) => (
                  <li key={index} className="flex gap-3 text-sm leading-relaxed text-slate-700 font-medium">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mt-0.5">
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Excluded Items */}
          {service.excludes?.length ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4.5 shadow-2xs space-y-3">
              <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Not included by default
              </h2>
              <ul className="space-y-2.5">
                {service.excludes.map((item, index) => (
                  <li key={index} className="flex gap-3 text-sm leading-relaxed text-slate-600 font-medium">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 mt-0.5">
                      <Minus className="h-3.5 w-3.5 stroke-[2.5]" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                Your contractor will specify the exact inclusions and exclusions in their itemised written quote after visiting the site.
              </p>
            </section>
          ) : null}

          {/* 4-Step Process Guide */}
          <section className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/60 to-amber-100/30 p-4.5 shadow-2xs space-y-3.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-600 stroke-[2.2]" />
              <h2 className="text-xs font-extrabold text-slate-900">How the process works</h2>
            </div>
            <ol className="space-y-2.5">
              {[
                "Submit your enquiry with site details & photographs",
                "Verified contractors arrange an on-site visit & measurements",
                "Receive written, itemised quotes side by side",
                "Pay in stages through escrow — money released only upon your approval",
              ].map((step, index) => (
                <li key={index} className="flex gap-3 text-xs leading-relaxed font-semibold text-slate-700">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-black text-amber-700 shadow-2xs ring-1 ring-amber-200">
                    {index + 1}
                  </span>
                  <span className="mt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {/* Sticky Bottom Action Bar */}
      {!loading && service ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-xl shadow-lg">
          <div className="mx-auto max-w-lg">
            <button
              type="button"
              onClick={() => navigate(`/construction/services/${service.slug || service.id}/enquire`)}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-extrabold text-slate-950 shadow-xs hover:bg-amber-400 active:scale-[0.98] transition-all"
            >
              Get a Free Quote <ChevronRight className="h-4 w-4 stroke-[2.5] group-hover:translate-x-0.5 transition-transform" />
            </button>
            <p className="mt-2 text-center text-[11px] font-medium text-slate-400">
              100% Free · No obligation · Contractor visits before quoting
            </p>
          </div>
        </div>
      ) : null}
    </ConstructionPageShell>
  );
}

