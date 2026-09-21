import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Home as HomeIcon,
  HardHat,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  ChevronRight,
  Receipt,
  FileText,
  CheckCircle2,
  ArrowRight,
  Layers,
  Check,
  ChevronDown,
} from "lucide-react";
import { useLocation as useAppLocation } from "@food/hooks/useLocation";
import { useLocationSelector } from "@food/components/user/UserLayout";
import constructionApi from "../services/api";
import { ConstructionPageShell } from "../components/ui";
import MaterialsSection from "../components/MaterialsSection";
import BannerCarousel from "../components/BannerCarousel";
import { CONSTRUCTION_HOME_PATH, pathForServiceType, selectPackagePath } from "../serviceTypes";
import { fullMoney, PROJECT_STATUS_LABEL } from "../../shared/format";
import { toDisplayPackage } from "../../shared/packageTheme";
import useModuleBackHandler from "@/modules/common/hooks/useModuleBackHandler";

/** Shown in place of the package cards while they load, or when admin has added none. */
function PackagesEmpty({ loading, label }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-xs">
      <Building2 className="mx-auto h-10 w-10 text-slate-300 mb-2" />
      <p className="text-sm font-bold text-slate-800">
        {loading ? "Loading packages…" : `No ${label} packages are available right now`}
      </p>
      {!loading && (
        <p className="text-xs text-slate-500 mt-1">
          Please check back soon, or send us an enquiry and we will help you directly.
        </p>
      )}
    </div>
  );
}

/**
 * The Budget Friendly section. These come from their own admin-managed list, not
 * the general catalogue. A card is only actionable when admin has linked it to a
 * live catalogue service (`enquiryServiceKey`) — that service's page is where the
 * enquiry form lives. Otherwise it is shown for information and says nothing about
 * enquiring, rather than offering a button that leads nowhere.
 */
function BudgetFriendlyServices({ services, loading, searching, onEnquire, onConsult }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-64 animate-pulse rounded-3xl bg-slate-200/70" />
        ))}
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 sm:p-10 text-center shadow-xs">
        <Receipt className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 text-lg font-black text-slate-900">
          {searching ? "No budget friendly services match your search" : "No budget friendly services yet"}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
          {searching
            ? "Try a different word, or clear the search."
            : "We are adding these soon. Tell us what you need and our team will help you directly."}
        </p>
        <button
          type="button"
          onClick={onConsult}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black text-white shadow-lg shadow-slate-900/15 hover:bg-slate-800"
        >
          Request a Consultation
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-emerald-600" />
          Budget Friendly Services
        </h3>
        <p className="text-xs text-slate-500 font-medium">
          Practical construction solutions designed to keep your project within budget
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((service) => {
          const features = (service.features || []).slice(0, 4);
          const canEnquire = Boolean(service.enquiryServiceKey);
          return (
            <div
              key={service._id}
              className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all hover:border-emerald-400 hover:shadow-md"
            >
              {service.image ? (
                <img src={service.image} alt="" loading="lazy" className="h-36 w-full object-cover" />
              ) : (
                <div className="flex h-24 items-center justify-center bg-gradient-to-b from-emerald-50 to-white text-emerald-500">
                  <Receipt className="h-8 w-8" />
                </div>
              )}

              <div className="flex flex-1 flex-col gap-2 p-4">
                {service.badge ? (
                  <span className="self-start rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wider text-emerald-800">
                    {service.badge}
                  </span>
                ) : null}
                <div>
                  <h4 className="text-base font-black text-slate-900">{service.name}</h4>
                  {service.tagline ? (
                    <p className="text-xs font-medium text-slate-500">{service.tagline}</p>
                  ) : null}
                </div>
                {service.description ? (
                  <p className="line-clamp-3 text-xs font-medium leading-relaxed text-slate-600">
                    {service.description}
                  </p>
                ) : null}

                {features.length > 0 && (
                  <ul className="space-y-1 pt-1">
                    {features.map((item) => (
                      <li key={item} className="flex items-start gap-1.5 text-xs font-medium text-slate-700">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-auto space-y-3 border-t border-slate-100 pt-3">
                  <div>
                    {service.price != null ? (
                      <>
                        <span className="text-[11px] font-bold text-slate-500">From </span>
                        <span className="text-xl font-black text-slate-900">{fullMoney(service.price)}</span>
                        {service.unit ? (
                          <span className="ml-1 text-xs font-bold text-slate-500">{service.unit}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-xs font-extrabold text-slate-900">Quoted after a site visit</span>
                    )}
                    {service.typicalDurationText ? (
                      <span className="block text-[11px] font-medium text-slate-500">
                        {service.typicalDurationText}
                      </span>
                    ) : null}
                  </div>

                  {canEnquire ? (
                    <button
                      type="button"
                      onClick={() => onEnquire(service)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-extrabold text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-95"
                    >
                      View details &amp; enquire
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The construction home screen, and — through `serviceType` — its three sections.
 *
 * Which section is open comes from the address, not from local state: the router
 * renders this component at /construction (no `serviceType`, the section chooser)
 * and at each section's own path. That is what lets a section be linked to and
 * refreshed, and lets the back button return to the chooser.
 */
export default function ConstructionHome({ serviceType = null }) {
  // Back on the chooser leaves the module. Inside a section it must behave as
  // ordinary back — to the chooser — so the module handler is only active there.
  useModuleBackHandler(!serviceType);
  const navigate = useNavigate();
  const { location } = useAppLocation();
  const { openLocationSelector } = useLocationSelector();

  const selectedServiceType = serviceType;
  // Active Category Section: 'residential' | 'commercial'
  const [selectedCategory, setSelectedCategory] = useState("residential");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  // Residential and commercial packages are managed in the admin panel.
  const [packages, setPackages] = useState({ residential: [], commercial: [] });
  const [packagesLoading, setPackagesLoading] = useState(true);
  // Budget Friendly offerings: their own admin-managed list, separate from the catalogue.
  const [budgetItems, setBudgetItems] = useState([]);
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [live, setLive] = useState({ projects: [], quotes: 0, enquiries: 0 });

  // Searching in one section and then opening another should not carry the words along.
  useEffect(() => {
    setQuery("");
  }, [serviceType]);

  // Load Catalogue Data & Live Stats
  useEffect(() => {
    let cancelled = false;
    constructionApi
      .getCatalogue()
      .then((rows) => {
        if (!cancelled) setCategories(rows || []);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error?.response?.data?.message || "Could not load catalogue");
          setCategories([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    constructionApi
      .getBudgetServices()
      .then((rows) => {
        if (!cancelled) setBudgetItems(rows || []);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error?.response?.data?.message || "Could not load budget friendly services");
        }
      })
      .finally(() => {
        if (!cancelled) setBudgetLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    constructionApi
      .getPackages()
      .then((rows) => {
        if (cancelled) return;
        const display = (rows || []).map(toDisplayPackage);
        setPackages({
          residential: display.filter((p) => p.segment === "residential"),
          commercial: display.filter((p) => p.segment === "commercial"),
        });
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error?.response?.data?.message || "Could not load packages");
        }
      })
      .finally(() => {
        if (!cancelled) setPackagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const set = (patch) => {
      if (!cancelled) setLive((c) => ({ ...c, ...patch }));
    };

    constructionApi
      .listProjects({ limit: 3 })
      .then((r) => set({ projects: r.rows || [] }))
      .catch(() => {});
    constructionApi
      .listQuotations()
      .then((q) =>
        set({
          quotes: (q || []).filter((x) =>
            ["sent", "under_review"].includes(x.status)
          ).length,
        })
      )
      .catch(() => {});
    constructionApi
      .listEnquiries({ limit: 1 })
      .then((r) => set({ enquiries: r.meta?.total || 0 }))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const allBackendServices = useMemo(
    () =>
      categories.flatMap((c) =>
        (c.services || []).map((s) => ({
          ...s,
          categoryName: c.name,
          categoryId: c._id,
        }))
      ),
    [categories]
  );

  // The search box at the top also narrows the Budget Friendly list.
  const budgetServices = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return budgetItems;
    return budgetItems.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.tagline?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q)
    );
  }, [budgetItems, query]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return allBackendServices.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.categoryName?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q)
    );
  }, [query, allBackendServices]);

  const handleBackendServiceClick = (service) => {
    navigate(`/construction/services/${service.slug || service._id}`);
  };

  const serviceTypeOptions = [
    {
      id: "end-to-end",
      title: "End-to-End Service",
      description: "Complete construction management, from planning and design to handover.",
      detail: "Residential and Commercial",
      icon: HardHat,
      tone: "amber",
    },
    {
      id: "budget-friendly",
      title: "Budget Friendly Service",
      description: "Practical construction solutions designed to keep your project within budget.",
      detail: "Value-first planning and execution",
      icon: Receipt,
      tone: "emerald",
    },
    {
      id: "material-services",
      title: "Material Services",
      description: "Source quality construction materials with transparent pricing and reliable delivery.",
      detail: "Cement, steel, tiles and more",
      icon: Layers,
      tone: "blue",
    },
  ];

  const selectedServiceOption = serviceTypeOptions.find(
    (option) => option.id === selectedServiceType
  );

  return (
    <ConstructionPageShell showServiceSwitcher>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-amber-500/20">
        
        {/* ── Top Bar: Search Bar ──────────────────────────────────────── */}
        <div className={`bg-white/95 backdrop-blur-xl border-b border-slate-200/80 px-4 py-3 sticky top-0 z-30 shadow-xs ${!selectedServiceType ? "hidden" : ""}`}>
          <div className="max-w-7xl mx-auto">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Villa Construction, Office Fitouts, Interiors, Steel..."
                className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all font-medium shadow-2xs"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Main Content Area ──────────────────────────────────────────── */}
        {!selectedServiceType && (
          <section className="min-h-[calc(100vh-5rem)] flex items-center justify-center bg-slate-50 px-4 py-10">
            <div className="w-full max-w-5xl space-y-8">
              <BannerCarousel />

              <div className="text-center max-w-2xl mx-auto space-y-3">
                <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-amber-700 bg-amber-100 px-3 py-1.5 rounded-full border border-amber-200">
                  <Building2 className="w-4 h-4" />
                  Construction Services
                </span>
                <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-950">
                  What can we help you build?
                </h1>
                <p className="text-sm sm:text-base text-slate-500 font-medium">
                  Choose a service to get started with the right construction solution for your project.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {serviceTypeOptions.map((option, index) => {
                  const Icon = option.icon;
                  const toneClasses = {
                    amber: "bg-amber-500 text-slate-950 border-amber-400 shadow-amber-500/20",
                    emerald: "bg-emerald-500 text-white border-emerald-400 shadow-emerald-500/20",
                    blue: "bg-blue-600 text-white border-blue-500 shadow-blue-500/20",
                  };
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => navigate(pathForServiceType(option.id))}
                      className={`group relative text-left rounded-3xl border p-5 sm:p-6 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                        index === 0
                          ? "border-amber-300 ring-2 ring-amber-400/20 shadow-lg shadow-amber-500/10"
                          : "border-slate-200 shadow-sm hover:border-slate-300"
                      }`}
                    >
                      {index === 0 && (
                        <span className="absolute right-4 top-4 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-800">
                          Recommended
                        </span>
                      )}
                      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-md ${toneClasses[option.tone]}`}>
                        <Icon className="h-6 w-6" />
                      </span>
                      <h2 className="mt-5 text-lg font-black text-slate-950">{option.title}</h2>
                      <p className="mt-2 min-h-12 text-xs leading-relaxed text-slate-500 font-medium">
                        {option.description}
                      </p>
                      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                        <span className="text-[11px] font-extrabold text-slate-700">{option.detail}</span>
                        <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        <main className={`max-w-7xl mx-auto px-4 py-6 space-y-7 ${!selectedServiceType ? "hidden" : ""}`}>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(CONSTRUCTION_HOME_PATH)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 shadow-xs hover:border-amber-400 hover:text-amber-700"
            >
              <ArrowRight className="h-4 w-4 rotate-180" />
              All Services
            </button>
            <span className="text-xs font-bold text-slate-400">/</span>
            <span className="text-sm font-black text-slate-900">{selectedServiceOption?.title}</span>
          </div>

          {selectedServiceType === "budget-friendly" && (
            <BudgetFriendlyServices
              services={budgetServices}
              loading={budgetLoading}
              searching={Boolean(query.trim())}
              onEnquire={(service) => navigate(`/construction/services/${service.enquiryServiceKey}?budget=${service._id}`)}
              onConsult={() => navigate("/construction/enquiries")}
            />
          )}

          {selectedServiceType === "material-services" && (
            <MaterialsSection query={query} defaultCity={location?.city || ""} />
          )}

          {selectedServiceType === "end-to-end" && (
            <>

          {/* ── Search Mode Active ────────────────────────────────────────── */}
          {searchResults ? (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900">
                  Search Results ({searchResults.length})
                </h3>
              </div>
              {searchResults.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-xs">
                  <Building2 className="mx-auto h-10 w-10 text-slate-300 mb-2" />
                  <p className="text-sm font-bold text-slate-800">No matches found for "{query}"</p>
                  <p className="text-xs text-slate-500 mt-1">Try searching for "renovation", "commercial", or "villa".</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {searchResults.map((s) => (
                    <div
                      key={s._id}
                      onClick={() => handleBackendServiceClick(s)}
                      className="group cursor-pointer rounded-2xl border border-slate-200/90 bg-white p-4 hover:border-amber-400 shadow-2xs hover:shadow-md transition-all"
                    >
                      <h4 className="font-extrabold text-sm text-slate-900 group-hover:text-amber-600">
                        {s.name}
                      </h4>
                      <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                        {s.description}
                      </p>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 mt-3">
                        View Details <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <>
              {/* ── Live Active Projects Strip ────────────────────────────── */}
              {live.projects.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
                        Active Live Projects ({live.projects.length})
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate("/construction/projects")}
                      className="text-xs font-bold text-amber-600 hover:underline flex items-center gap-0.5"
                    >
                      See All <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                    {live.projects.map((p) => {
                      const agreed = Number(p.agreedValue) || 0;
                      const released = Number(p.releasedAmount) || 0;
                      const pct = agreed > 0 ? Math.round((released / agreed) * 100) : 0;
                      return (
                        <div
                          key={p._id}
                          onClick={() => navigate(`/construction/projects/${p._id}`)}
                          className="w-72 shrink-0 cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 hover:border-amber-400 shadow-xs hover:shadow-md transition-all"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="bg-amber-100 text-amber-900 font-extrabold px-2 py-0.5 rounded-md border border-amber-200">
                              {p.projectNumber || "Project"}
                            </span>
                            <span className="font-bold text-emerald-600">{pct}% Paid</span>
                          </div>
                          <h4 className="font-extrabold text-sm text-slate-900 truncate mt-2">
                            {p.title || p.projectNumber}
                          </h4>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {p.contractorId?.businessName || "Verified Contractor"}
                          </p>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                            <div className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── Construction Hero Banner (Light Mode) ────────────────── */}
              <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 sm:p-8 text-white shadow-xl">
                <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 max-w-2xl space-y-3">
                  <div className="inline-flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/40 px-3 py-1 rounded-full text-xs font-extrabold text-amber-300">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>SMSPRO Escrow Guarantee & Verified Quality</span>
                  </div>
                  <h2 className="text-2xl sm:text-4xl font-black text-white leading-tight tracking-tight">
                    Build Your Dream Property with <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300">100% Price & Escrow Protection</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
                    Get transparent per-sqft packages, customized architectural 3D designs, and staged escrow milestone payouts.
                  </p>
                </div>
              </section>

              {/* ── Quick Action Hub Tiles ──────────────────────────────────── */}
              <section className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => navigate("/construction/enquiries")}
                  className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-amber-400 shadow-xs hover:shadow-md transition-all text-center group"
                >
                  <div className="w-10 h-10 mx-auto rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <span className="block text-xs font-extrabold text-slate-900">Enquiries</span>
                  <span className="text-[10px] font-bold text-slate-500">{live.enquiries} Active</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/construction/quotations")}
                  className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-amber-400 shadow-xs hover:shadow-md transition-all text-center group"
                >
                  <div className="w-10 h-10 mx-auto rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <FileText className="w-5 h-5" />
                  </div>
                  <span className="block text-xs font-extrabold text-slate-900">My Quotes</span>
                  <span className="text-[10px] font-bold text-amber-600">{live.quotes} Pending</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/construction/projects")}
                  className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-amber-400 shadow-xs hover:shadow-md transition-all text-center group"
                >
                  <div className="w-10 h-10 mx-auto rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                    <HardHat className="w-5 h-5" />
                  </div>
                  <span className="block text-xs font-extrabold text-slate-900">My Projects</span>
                  <span className="text-[10px] font-bold text-slate-500">{live.projects.length} Ongoing</span>
                </button>
              </section>

              {/* ─────────────────────────────────────────────────────────── */}
              {/* ── TWO CATEGORY SECTIONS: RESIDENTIAL & COMMERCIAL ──────── */}
              {/* ─────────────────────────────────────────────────────────── */}
              <section className="space-y-6 pt-2">
                <div className="text-center max-w-xl mx-auto space-y-2">
                  <span className="text-xs font-extrabold uppercase tracking-widest text-amber-600 bg-amber-100 px-3 py-1 rounded-full border border-amber-200">
                    Category Selection
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
                    Select Your Construction Category
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium">
                    Choose between Residential home packages or Commercial business solutions.
                  </p>
                </div>

                {/* ── 2 Main Category Cards (Residential vs Commercial) ────── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Residential Category Card */}
                  <div
                    onClick={() => setSelectedCategory("residential")}
                    className={`cursor-pointer rounded-3xl p-5 sm:p-6 border transition-all duration-300 relative overflow-hidden flex items-center justify-between shadow-xs ${
                      selectedCategory === "residential"
                        ? "bg-gradient-to-r from-amber-500/10 via-white to-orange-500/10 border-amber-500 shadow-lg shadow-amber-500/10 ring-2 ring-amber-400/40"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="space-y-1.5 relative z-10">
                      <div className="flex items-center gap-2">
                        <span className="p-2.5 rounded-2xl bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20">
                          <HomeIcon className="w-5 h-5 stroke-[2.2]" />
                        </span>
                        <h3 className="text-lg font-black text-slate-900">Residential</h3>
                      </div>
                      <p className="text-xs text-slate-600 font-medium max-w-xs leading-relaxed">
                        Independent Houses, Villas, Duplexes & Turnkey Home Construction.
                      </p>
                      <div className="pt-2 flex items-center gap-2">
                        <span className="text-[11px] font-extrabold text-amber-800 bg-amber-100 border border-amber-200 px-2.5 py-0.5 rounded-full">
                          {packages.residential.length
                            ? `${packages.residential.length} Package${packages.residential.length === 1 ? "" : "s"} (${packages.residential.map((p) => p.name.replace(/ Package$/i, "")).join(", ")})`
                            : "Residential Packages"}
                        </span>
                      </div>
                    </div>

                    <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      selectedCategory === "residential" ? "border-amber-500 bg-amber-500 text-slate-950 shadow-sm" : "border-slate-300 bg-slate-50"
                    }`}>
                      {selectedCategory === "residential" && <Check className="w-4 h-4 stroke-[3]" />}
                    </div>
                  </div>

                  {/* Commercial Category Card */}
                  <div
                    onClick={() => setSelectedCategory("commercial")}
                    className={`cursor-pointer rounded-3xl p-5 sm:p-6 border transition-all duration-300 relative overflow-hidden flex items-center justify-between shadow-xs ${
                      selectedCategory === "commercial"
                        ? "bg-gradient-to-r from-blue-500/10 via-white to-cyan-500/10 border-blue-500 shadow-lg shadow-blue-500/10 ring-2 ring-blue-400/40"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="space-y-1.5 relative z-10">
                      <div className="flex items-center gap-2">
                        <span className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                          <Building2 className="w-5 h-5 stroke-[2.2]" />
                        </span>
                        <h3 className="text-lg font-black text-slate-900">Commercial</h3>
                      </div>
                      <p className="text-xs text-slate-600 font-medium max-w-xs leading-relaxed">
                        Corporate Offices, Retail Showrooms, Warehouses & Turnkey Complexes.
                      </p>
                      <div className="pt-2 flex items-center gap-2">
                        <span className="text-[11px] font-extrabold text-blue-800 bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded-full">
                          Commercial Services & Fitouts
                        </span>
                      </div>
                    </div>

                    <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      selectedCategory === "commercial" ? "border-blue-600 bg-blue-600 text-white shadow-sm" : "border-slate-300 bg-slate-50"
                    }`}>
                      {selectedCategory === "commercial" && <Check className="w-4 h-4 stroke-[3]" />}
                    </div>
                  </div>
                </div>

                {/* ── Category Display Area ──────────────────────────────── */}
                <AnimatePresence mode="wait">
                  {selectedCategory === "residential" ? (
                    /* ── RESIDENTIAL CARDS (Silver, Gold, Diamond, Platinum) ── */
                    <motion.div
                      key="residential-section"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                            <HomeIcon className="w-5 h-5 text-amber-600" />
                            Residential Construction Packages
                          </h3>
                          <p className="text-xs text-slate-500 font-medium">
                            Choose a plan tailored to your budget and specifications
                          </p>
                        </div>

                        {packages.residential.length > 0 && (
                          <button
                            type="button"
                            onClick={() => navigate(selectPackagePath())}
                            className="px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition-all self-start sm:self-auto"
                          >
                            <Sparkles className="w-4 h-4 fill-current" />
                            <span>Build Custom Requirement</span>
                          </button>
                        )}
                      </div>

                      {/* Tier Cards List in App View */}
                      <div className="grid grid-cols-1 gap-4.5">
                        {packages.residential.length === 0 && (
                          <PackagesEmpty loading={packagesLoading} label="residential" />
                        )}
                        {packages.residential.map((pkg) => {
                          const IconComponent = pkg.icon;
                          return (
                            <div
                              key={pkg.id}
                              className={`relative rounded-3xl border ${pkg.cardBg} p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-300`}
                            >
                              {pkg.popular && (
                                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black text-[10.5px] uppercase tracking-wider px-3.5 py-1 rounded-full shadow-md">
                                  {pkg.badge}
                                </div>
                              )}

                              <div className="space-y-4">
                                {/* Top Badge & Icon */}
                                <div className="flex items-center justify-between">
                                  <div className={`w-10 h-10 rounded-2xl ${pkg.iconBg} flex items-center justify-center`}>
                                    <IconComponent className="w-5 h-5 stroke-[2.2]" />
                                  </div>
                                  {!pkg.popular && (
                                    <span className={`text-[10.5px] px-2.5 py-0.5 rounded-full border ${pkg.badgeColor}`}>
                                      {pkg.badge}
                                    </span>
                                  )}
                                </div>

                                <div>
                                  <h4 className="text-lg font-black text-slate-900">{pkg.name}</h4>
                                  <p className="text-xs text-slate-500 font-medium">{pkg.tagline}</p>
                                </div>

                                {/* Price Tag Box */}
                                <div className={`p-3 rounded-2xl border ${pkg.priceBg}`}>
                                  <span className="text-2xl font-black">{pkg.price}</span>
                                  <span className="text-xs font-bold opacity-80 ml-1">{pkg.unit}</span>
                                </div>

                                {/* Included Features */}
                                <div className="space-y-2 pt-1">
                                  <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block">
                                    What's Included:
                                  </span>
                                  <ul className="space-y-2">
                                    {pkg.features.map((feat, idx) => (
                                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-700 font-medium">
                                        <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${pkg.checkColor}`} />
                                        <span>{feat}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>

                              {/* Action Button */}
                              <div className="pt-6">
                                <button
                                  type="button"
                                  onClick={() => navigate(selectPackagePath(pkg.id))}
                                  className={`w-full py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 ${pkg.btnStyle}`}
                                >
                                  Select Package
                                  <ArrowRight className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  ) : (
                    /* ── COMMERCIAL SECTION ────────────────────────────────── */
                    <motion.div
                      key="commercial-section"
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-6"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-blue-600" />
                            Commercial & Industrial Solutions
                          </h3>
                          <p className="text-xs text-slate-500 font-medium">
                            Turnkey contracting, office interiors, showrooms & industrial structures
                          </p>
                        </div>
                      </div>

                      {/* Commercial Cards List in App View */}
                      <div className="grid grid-cols-1 gap-4.5">
                        {packages.commercial.length === 0 && (
                          <PackagesEmpty loading={packagesLoading} label="commercial" />
                        )}
                        {packages.commercial.map((comm) => {
                          const IconComp = comm.icon;
                          return (
                            <div
                              key={comm.id}
                              className={`rounded-3xl border ${comm.cardBg} p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-300`}
                            >
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center border border-blue-200">
                                    <IconComp className="w-5 h-5 stroke-[2.2]" />
                                  </div>
                                  <span className={`text-[10.5px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${comm.badgeColor}`}>
                                    {comm.badge}
                                  </span>
                                </div>

                                <div>
                                  <h4 className="text-base font-black text-slate-900">{comm.name}</h4>
                                  <p className="text-xs text-slate-500 font-medium">{comm.tagline}</p>
                                </div>

                                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                                  <span className="text-xl font-black text-slate-900">{comm.price}</span>
                                  <span className="text-xs font-bold text-slate-500 ml-1">{comm.unit}</span>
                                </div>

                                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                                  {comm.description}
                                </p>
                              </div>

                              <div className="pt-5">
                                <button
                                  type="button"
                                  onClick={() => navigate(selectPackagePath(comm.id))}
                                  className={`w-full py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 ${comm.btnStyle}`}
                                >
                                  Request Commercial Estimate
                                  <ArrowRight className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Backend Services List Integration */}
                      {allBackendServices.length > 0 && (
                        <div className="pt-6 border-t border-slate-200 space-y-4">
                          <h4 className="text-sm font-black text-slate-900">
                            Available Contracting Services ({allBackendServices.length})
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {allBackendServices.map((srv) => (
                              <div
                                key={srv._id}
                                onClick={() => handleBackendServiceClick(srv)}
                                className="cursor-pointer p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-blue-400 shadow-2xs hover:shadow-md transition-all flex items-center justify-between group"
                              >
                                <div className="min-w-0 pr-2">
                                  <h5 className="text-xs font-extrabold text-slate-900 group-hover:text-blue-600 truncate">
                                    {srv.name}
                                  </h5>
                                  <span className="text-[10px] text-slate-500 block truncate">
                                    {srv.categoryName || "General Contracting"}
                                  </span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 shrink-0" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

              </section>
            </>
          )}
            </>
          )}

        </main>
      </div>

    </ConstructionPageShell>
  );
}
