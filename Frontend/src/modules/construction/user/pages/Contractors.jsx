import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BadgeCheck, Building2, MapPin, Search, SlidersHorizontal, Star, X,
} from "lucide-react";
import constructionApi from "../services/api";
import { ConstructionPageShell, ConstructionPageHeader, EmptyState } from "../components/ui";

/**
 * BRD C8 — search and filter the verified contractor network.
 *
 * "Choice is the main reason a customer would use a platform rather than ask a
 * relative."
 *
 * Only approved, active contractors are ever listed — the server enforces that,
 * not this screen. What the screen adds is the ability to narrow: by trade, by
 * city, by rating, and by whether the firm can actually take work on right now.
 *
 * That last filter is the one customers do not know to ask for and care about
 * most: a five-star contractor already running four jobs is not going to start
 * yours next week.
 */
const BANDS = {
  new: { label: "New", tone: "bg-slate-100 text-slate-600" },
  building: { label: "Building reputation", tone: "bg-amber-100 text-amber-800" },
  good: { label: "Good", tone: "bg-blue-100 text-blue-800" },
  excellent: { label: "Excellent", tone: "bg-emerald-100 text-emerald-800" },
};

export default function Contractors() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [search, setSearch] = useState(params.get("search") || "");
  const [city, setCity] = useState(params.get("city") || "");
  const [minRating, setMinRating] = useState(params.get("minRating") || "");
  const [availableOnly, setAvailableOnly] = useState(params.get("available") === "true");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await constructionApi.searchContractors({
        limit: 30,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(minRating ? { minRating } : {}),
        ...(availableOnly ? { available: "true" } : {}),
      });
      setRows(result.rows);
      setMeta(result.meta);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load contractors");
    } finally {
      setLoading(false);
    }
  }, [search, city, minRating, availableOnly]);

  useEffect(() => {
    const t = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  // Keep the URL in step so a filtered list can be shared or reopened.
  useEffect(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set("search", search.trim());
    if (city.trim()) p.set("city", city.trim());
    if (minRating) p.set("minRating", minRating);
    if (availableOnly) p.set("available", "true");
    setParams(p, { replace: true });
  }, [search, city, minRating, availableOnly, setParams]);

  const activeFilters = [city, minRating, availableOnly ? "available" : ""].filter(Boolean).length;

  const clearAll = () => {
    setCity("");
    setMinRating("");
    setAvailableOnly(false);
  };

  return (
    <ConstructionPageShell>
      <ConstructionPageHeader
        title="Verified contractors"
        subtitle={loading ? "Loading…" : `${meta.total} checked and approved`}
        backTo="/construction"
      />

      <div className="space-y-4 px-4 py-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-xs font-medium outline-none focus:border-amber-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md bg-slate-200 text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`relative flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border transition ${
              activeFilters > 0
                ? "border-amber-400 bg-amber-50 text-amber-700"
                : "border-slate-200 bg-white text-slate-500"
            }`}
            aria-label="Filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilters > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700" htmlFor="filter-city">
                City
              </label>
              <input
                id="filter-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Indore"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <p className="text-[11px] font-bold text-slate-700">Minimum rating</p>
              <div className="mt-1.5 flex gap-1.5">
                {["", "3", "4", "4.5"].map((v) => (
                  <button
                    key={v || "any"}
                    type="button"
                    onClick={() => setMinRating(v)}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                      minRating === v
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    {v ? `${v}★+` : "Any"}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(e) => setAvailableOnly(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-amber-500"
              />
              <span>
                <span className="block text-[11px] font-bold text-slate-800">
                  Only show contractors who can start now
                </span>
                <span className="block text-[10.5px] leading-relaxed text-slate-500">
                  Hides firms already running as many projects as they have said
                  they can handle.
                </span>
              </span>
            </label>

            {activeFilters > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] font-bold text-amber-700"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
            {error}
          </p>
        )}

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200/70" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No contractors match"
            detail={
              activeFilters > 0 || search
                ? "Try widening the filters — or clear them to see everyone."
                : "We are still building the contractor network in your area."
            }
            action={
              activeFilters > 0 ? (
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white"
                >
                  Clear filters
                </button>
              ) : null
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {rows.map((c) => (
              <li key={c.id}>
                <ContractorCard
                  contractor={c}
                  onClick={() => navigate(`/construction/contractors/${c.id}`)}
                />
              </li>
            ))}
          </ul>
        )}

        {!loading && rows.length > 0 && (
          <p className="px-1 text-[11px] leading-relaxed text-slate-500">
            Everyone listed here has had their documents checked by our team. You
            still choose who quotes for your work.
          </p>
        )}
      </div>
    </ConstructionPageShell>
  );
}

export function ContractorCard({ contractor: c, onClick, extra }) {
  const band = BANDS[c.trustBand] || BANDS.new;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-amber-400/60 active:scale-[0.99]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
        {c.profileImage ? (
          <img src={c.profileImage} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Building2 className="h-5 w-5 text-slate-400" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-black text-slate-900">{c.businessName}</span>
          {c.isVerified && (
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 fill-blue-500 text-white" />
          )}
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
          {c.totalRatings > 0 ? (
            <span className="inline-flex items-center gap-0.5 font-bold text-amber-600">
              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
              {c.rating} ({c.totalRatings})
            </span>
          ) : (
            <span className="font-medium">No ratings yet</span>
          )}
          {c.completedProjects > 0 && <span>· {c.completedProjects} completed</span>}
          {c.yearsExperience > 0 && <span>· {c.yearsExperience} yrs</span>}
        </span>

        {c.cities?.length > 0 && (
          <span className="mt-1 flex items-center gap-1 text-[10.5px] text-slate-500">
            <MapPin className="h-3 w-3" /> {c.cities.slice(0, 3).join(", ")}
          </span>
        )}

        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${band.tone}`}>
            {band.label}
            {c.trustScore != null ? ` · ${c.trustScore}` : ""}
          </span>
          {c.isAvailable === false && (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
              Fully booked
            </span>
          )}
          {c.similarProjectsCompleted > 0 && (
            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
              {c.similarProjectsCompleted} similar job
              {c.similarProjectsCompleted === 1 ? "" : "s"}
            </span>
          )}
        </span>

        {extra}
      </span>
    </button>
  );
}

export { BANDS as TRUST_BANDS };
