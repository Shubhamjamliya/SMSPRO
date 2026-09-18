import React, { useEffect, useMemo, useState } from "react";
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
  Crown,
  Award,
  ArrowRight,
  Layers,
  Check,
  Wrench,
  ChevronDown,
} from "lucide-react";
import { useLocation as useAppLocation } from "@food/hooks/useLocation";
import { useLocationSelector } from "@food/components/user/UserLayout";
import constructionApi from "../services/api";
import { ConstructionPageShell } from "../components/ui";
import { fullMoney, PROJECT_STATUS_LABEL } from "../../shared/format";
import useModuleBackHandler from "@/modules/common/hooks/useModuleBackHandler";

// ── Residential Packages (Light Theme) ──────────────────────────────────────
const RESIDENTIAL_PACKAGES = [
  {
    id: "silver",
    name: "Silver Package",
    tagline: "Essential Construction",
    price: "₹1,650",
    unit: "per sq.ft",
    badge: "Standard",
    badgeColor: "bg-slate-100 text-slate-700 border-slate-300 font-bold",
    cardBg: "bg-gradient-to-b from-slate-50/80 via-white to-slate-50/40 border-slate-200/90 hover:border-slate-400",
    priceBg: "bg-slate-50 border-slate-200 text-slate-900",
    iconBg: "bg-slate-100 text-slate-700",
    btnStyle: "bg-slate-900 text-white hover:bg-slate-800",
    checkColor: "text-slate-600",
    icon: ShieldCheck,
    features: [
      "Ultratech / TATA TMT Steel Grade A",
      "Double Charged Vitrified Tiles (2x2 ft)",
      "Flush Main Door & Internal Doors",
      "Standard Electrical (Anchor / Cello)",
      "Essential Plumbing Fittings (Cera)",
      "10-Year Structural Warranty",
    ],
  },
  {
    id: "gold",
    name: "Gold Package",
    tagline: "Premium Quality & Finish",
    price: "₹1,950",
    unit: "per sq.ft",
    badge: "★ Most Popular",
    badgeColor: "bg-amber-500 text-slate-950 font-black shadow-sm",
    cardBg: "bg-gradient-to-b from-amber-50/80 via-white to-orange-50/30 border-amber-300 shadow-lg shadow-amber-500/10 ring-2 ring-amber-400/40 hover:border-amber-500",
    priceBg: "bg-amber-50/80 border-amber-200 text-amber-900",
    iconBg: "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20",
    btnStyle: "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black hover:bg-amber-400 shadow-md shadow-amber-500/20",
    checkColor: "text-amber-500",
    popular: true,
    icon: Crown,
    features: [
      "Premium Cement & TATA Tiscon TMT Steel",
      "Double Charged Vitrified Tiles (4x2 ft)",
      "Teak Wood Main Door Frame & Shutter",
      "Jaquar / Cera Premium Bath Fittings",
      "Full Modular Kitchen Setup",
      "3D Architectural & Floor Plan Elevation",
      "15-Year Structural Warranty",
    ],
  },
  {
    id: "diamond",
    name: "Diamond Package",
    tagline: "Luxury Living Standards",
    price: "₹2,450",
    unit: "per sq.ft",
    badge: "Luxury",
    badgeColor: "bg-cyan-500 text-white font-bold",
    cardBg: "bg-gradient-to-b from-cyan-50/80 via-white to-blue-50/30 border-cyan-200/90 hover:border-cyan-400",
    priceBg: "bg-cyan-50/80 border-cyan-200 text-cyan-900",
    iconBg: "bg-cyan-500 text-white shadow-md shadow-cyan-500/20",
    btnStyle: "bg-cyan-600 text-white hover:bg-cyan-500 font-extrabold",
    checkColor: "text-cyan-600",
    icon: Sparkles,
    features: [
      "Grade A+ TMT Steel & Waterproof Concrete",
      "Italian Marble Flooring in Living Room",
      "Teak Wood Doors & Soundproof Windows",
      "Kohler / Grohe Designer Sanitary Ware",
      "Designer False Ceiling & Cove Lighting",
      "Solar Water Heating Provisions",
      "20-Year Structural Warranty",
    ],
  },
  {
    id: "platinum",
    name: "Platinum Package",
    tagline: "Bespoke Royal Architecture",
    price: "₹2,950",
    unit: "per sq.ft",
    badge: "Elite Architectural",
    badgeColor: "bg-purple-600 text-white font-bold",
    cardBg: "bg-gradient-to-b from-purple-50/80 via-white to-indigo-50/30 border-purple-200/90 hover:border-purple-400",
    priceBg: "bg-purple-50/80 border-purple-200 text-purple-900",
    iconBg: "bg-purple-600 text-white shadow-md shadow-purple-600/20",
    btnStyle: "bg-purple-600 text-white hover:bg-purple-500 font-extrabold",
    checkColor: "text-purple-600",
    icon: Award,
    features: [
      "Imported Italian Marble & Hardwood Flooring",
      "Smart Home Automation & Keyless Locks",
      "Fully Loaded German Modular Kitchen",
      "VRV Central Air Conditioning Infrastructure",
      "Custom Landscaping & Private Terrace Garden",
      "Dedicated Senior Architect & Site Manager",
      "Lifetime Structural Warranty",
    ],
  },
];

// ── Commercial Services (Light Theme) ───────────────────────────────────────
const COMMERCIAL_SERVICES = [
  {
    id: "comm-office",
    name: "Corporate Office Fitouts",
    tagline: "Modern Workspaces & Cabin Layouts",
    price: "₹1,200",
    unit: "per sq.ft",
    badge: "Office",
    icon: Building2,
    badgeColor: "bg-blue-100 text-blue-800 border-blue-200",
    cardBg: "bg-gradient-to-b from-blue-50/60 via-white to-slate-50/30 border-blue-200 hover:border-blue-400",
    btnStyle: "bg-blue-600 text-white hover:bg-blue-500 font-extrabold",
    description: "Turnkey office interiors, acoustic glass partitions, workstation wiring, HVAC & reception counters.",
  },
  {
    id: "comm-retail",
    name: "Retail Showrooms & Outlets",
    tagline: "High-Footfall Brand Outlets",
    price: "₹1,450",
    unit: "per sq.ft",
    badge: "Retail",
    icon: Sparkles,
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
    cardBg: "bg-gradient-to-b from-emerald-50/60 via-white to-slate-50/30 border-emerald-200 hover:border-emerald-400",
    btnStyle: "bg-emerald-600 text-white hover:bg-emerald-500 font-extrabold",
    description: "High-impact store facades, display shelving, spot lighting, security systems & POS counter setups.",
  },
  {
    id: "comm-building",
    name: "Commercial Turnkey Building",
    tagline: "Multi-Storey Commercial Complexes",
    price: "₹1,850",
    unit: "per sq.ft",
    badge: "Turnkey",
    icon: HardHat,
    badgeColor: "bg-amber-100 text-amber-900 border-amber-200",
    cardBg: "bg-gradient-to-b from-amber-50/60 via-white to-slate-50/30 border-amber-200 hover:border-amber-400",
    btnStyle: "bg-amber-500 text-slate-950 hover:bg-amber-400 font-black",
    description: "Full RCC structure, glass curtain walling, elevator shafts, parking basements & fire compliance.",
  },
  {
    id: "comm-warehouse",
    name: "Warehouses & Industrial Sheds",
    tagline: "PEB Sheds & Heavy Logistics",
    price: "₹1,100",
    unit: "per sq.ft",
    badge: "Industrial",
    icon: Layers,
    badgeColor: "bg-slate-100 text-slate-800 border-slate-300",
    cardBg: "bg-gradient-to-b from-slate-50/80 via-white to-slate-50/30 border-slate-200 hover:border-slate-400",
    btnStyle: "bg-slate-900 text-white hover:bg-slate-800 font-extrabold",
    description: "Pre-Engineered Building (PEB) steel structures, heavy load flooring, loading docks & ventilation.",
  },
];

// ── Residential Custom Addon Services ─────────────────────────────────────────
const RESIDENTIAL_ADDONS = [
  {
    id: "elevation_3d",
    name: "3D Elevation & Structural CAD",
    pricePerSqft: 35,
    unitText: "₹35 / sq.ft",
    desc: "Bespoke 3D VR Architectural model & structural drawings.",
    icon: Sparkles,
  },
  {
    id: "modular_kitchen",
    name: "Full Modular Kitchen & Chimney",
    flatPrice: 85000,
    unitText: "₹85,000 flat",
    desc: "Soft-close cabinets, quartz countertop & SS sink.",
    icon: Wrench,
  },
  {
    id: "false_ceiling",
    name: "Interior False Ceiling & Lighting",
    pricePerSqft: 45,
    unitText: "₹45 / sq.ft",
    desc: "Gypsum false ceiling with COB LED strip profiles.",
    icon: Layers,
  },
  {
    id: "sump_tank",
    name: "Underground Sump & Roof Tank",
    flatPrice: 65000,
    unitText: "₹65,000 flat",
    desc: "10,000L RCC sump tank + 1,000L roof tank.",
    icon: HardHat,
  },
  {
    id: "smart_home",
    name: "Smart Home Automation Wiring",
    flatPrice: 40000,
    unitText: "₹40,000 flat",
    desc: "Touch panels, video door phone & smart switches.",
    icon: ShieldCheck,
  },
  {
    id: "compound_wall",
    name: "Exterior Compound Wall & Gate",
    flatPrice: 75000,
    unitText: "₹75,000 flat",
    desc: "Brick compound wall with heavy metal sliding gate.",
    icon: Building2,
  },
];

export default function ConstructionHome() {
  useModuleBackHandler(true);
  const navigate = useNavigate();
  const { location } = useAppLocation();
  const { openLocationSelector } = useLocationSelector();

  // Active Category Section: 'residential' | 'commercial'
  const [selectedCategory, setSelectedCategory] = useState("residential");
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [live, setLive] = useState({ projects: [], quotes: 0, enquiries: 0 });

  // ── Interactive Residential Requirement Builder State ────────────────────
  const [isRequirementModalOpen, setIsRequirementModalOpen] = useState(false);
  const [builderPackage, setBuilderPackage] = useState(RESIDENTIAL_PACKAGES[1]); // Default Gold
  const [plotArea, setPlotArea] = useState(1200);
  const [floors, setFloors] = useState(2); // G+1 (2 floors)
  const [selectedAddons, setSelectedAddons] = useState(["elevation_3d", "modular_kitchen"]);
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    phone: "",
    city: "",
    startDate: "Next 30 Days",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // ── Calculation Logic ────────────────────────────────────────────────────
  const ratePerSqft = useMemo(() => {
    return parseInt(String(builderPackage?.price || "1950").replace(/[^\d]/g, ""), 10) || 1950;
  }, [builderPackage]);

  const totalBuiltupArea = useMemo(() => {
    return Math.max(100, Number(plotArea || 0) * Number(floors || 1));
  }, [plotArea, floors]);

  const basePackageCost = useMemo(() => {
    return totalBuiltupArea * ratePerSqft;
  }, [totalBuiltupArea, ratePerSqft]);

  const addonsCost = useMemo(() => {
    return selectedAddons.reduce((acc, addonId) => {
      const addon = RESIDENTIAL_ADDONS.find((a) => a.id === addonId);
      if (!addon) return acc;
      if (addon.flatPrice) return acc + addon.flatPrice;
      if (addon.pricePerSqft) return acc + addon.pricePerSqft * totalBuiltupArea;
      return acc;
    }, 0);
  }, [selectedAddons, totalBuiltupArea]);

  const totalEstimatedCost = useMemo(() => {
    return basePackageCost + addonsCost;
  }, [basePackageCost, addonsCost]);

  const handleOpenRequirementBuilder = (pkg = null) => {
    if (pkg) setBuilderPackage(pkg);
    setIsRequirementModalOpen(true);
  };

  const toggleAddon = (addonId) => {
    setSelectedAddons((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId]
    );
  };

  const handleSubmitRequirement = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!customerInfo.name.trim() || !customerInfo.phone.trim()) {
      toast.error("Please enter your name and contact phone number.");
      return;
    }
    setIsSubmitting(true);
    try {
      const selectedAddonDocs = RESIDENTIAL_ADDONS.filter((a) => selectedAddons.includes(a.id));
      const addonNames = selectedAddonDocs.map((a) => a.name).join(", ") || "None";

      const enquiryPayload = {
        title: `Residential Construction (${builderPackage.name}) - ${totalBuiltupArea} sq.ft`,
        description: `--- RESIDENTIAL REQUIREMENT BREAKDOWN ---
Package Tier: ${builderPackage.name} (${builderPackage.price}/sq.ft)
Plot Area: ${plotArea} sq.ft | Floors: ${floors} (Total Built-up: ${totalBuiltupArea} sq.ft)
Selected Add-ons: ${addonNames}
Base Package Cost: ₹${basePackageCost.toLocaleString('en-IN')}
Add-ons Total Cost: ₹${addonsCost.toLocaleString('en-IN')}
Estimated Total Budget: ₹${totalEstimatedCost.toLocaleString('en-IN')}

--- CUSTOMER CONTACT ---
Name: ${customerInfo.name}
Phone: ${customerInfo.phone}
Site Location: ${customerInfo.city || location?.city || "Indore"}
Target Start Date: ${customerInfo.startDate}
Additional Notes: ${customerInfo.notes || "None"}`,
        location: {
          city: customerInfo.city || location?.city || "Indore",
          address: location?.formattedAddress || customerInfo.city || "Indore",
        },
      };

      await constructionApi.createEnquiry(enquiryPayload);
      toast.success("Residential Requirement Submitted Successfully! Our architect will contact you shortly.");
      setIsRequirementModalOpen(false);
      navigate("/construction/enquiries");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to submit requirement. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendWhatsAppRequirement = () => {
    const selectedAddonDocs = RESIDENTIAL_ADDONS.filter((a) => selectedAddons.includes(a.id));
    const addonNames = selectedAddonDocs.map((a) => a.name).join(", ") || "None";
    const msg = `*SMSPRO Residential Construction Requirement*
----------------------------------------
*Package:* ${builderPackage.name} (${builderPackage.price}/sq.ft)
*Built-up Area:* ${totalBuiltupArea} sq.ft (${plotArea} sq.ft × ${floors} floor${floors > 1 ? "s" : ""})
*Selected Custom Services:* ${addonNames}
*Base Cost:* ₹${basePackageCost.toLocaleString('en-IN')}
*Addons Cost:* ₹${addonsCost.toLocaleString('en-IN')}
*Estimated Total:* ₹${totalEstimatedCost.toLocaleString('en-IN')}

*Customer Name:* ${customerInfo.name || "Customer"}
*Phone:* ${customerInfo.phone || "N/A"}
*Location:* ${customerInfo.city || location?.city || "Indore"}
*Start Date:* ${customerInfo.startDate}
${customerInfo.notes ? `*Notes:* ${customerInfo.notes}` : ""}`;

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const handlePackageClick = (pkg) => {
    handleOpenRequirementBuilder(pkg);
  };

  const handleBackendServiceClick = (service) => {
    navigate(`/construction/services/${service.slug || service._id}`);
  };

  return (
    <ConstructionPageShell showServiceSwitcher>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-amber-500/20">
        
        {/* ── Top Bar: Search Bar ──────────────────────────────────────── */}
        <div className="bg-white/95 backdrop-blur-xl border-b border-slate-200/80 px-4 py-3 sticky top-0 z-30 shadow-xs">
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
        <main className="max-w-7xl mx-auto px-4 py-6 space-y-7">

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
                          4 Packages (Silver, Gold, Diamond, Platinum)
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

                        <button
                          type="button"
                          onClick={() => handleOpenRequirementBuilder()}
                          className="px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition-all self-start sm:self-auto"
                        >
                          <Sparkles className="w-4 h-4 fill-current" />
                          <span>Build Custom Requirement</span>
                        </button>
                      </div>

                      {/* Tier Cards List in App View */}
                      <div className="grid grid-cols-1 gap-4.5">
                        {RESIDENTIAL_PACKAGES.map((pkg) => {
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
                                  onClick={() => handlePackageClick(pkg)}
                                  className={`w-full py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 ${pkg.btnStyle}`}
                                >
                                  Get Free Quote
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
                        {COMMERCIAL_SERVICES.map((comm) => {
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
                                  onClick={() => handlePackageClick(comm)}
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

        </main>
      </div>

      {/* ───────────────────────────────────────────────────────────────── */}
      {/* ── INTERACTIVE RESIDENTIAL REQUIREMENT BUILDER MODAL ───────────── */}
      {/* ───────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isRequirementModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl p-5 sm:p-7 shadow-2xl border border-slate-200 my-auto overflow-hidden text-slate-900 font-sans space-y-5"
            >
              {/* Top Accent Bar */}
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400" />

              {/* Modal Header */}
              <div className="flex items-start justify-between gap-3 pt-1">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-amber-100 text-amber-900 border border-amber-200">
                      <HomeIcon className="w-5 h-5 stroke-[2.2]" />
                    </span>
                    <h3 className="text-lg sm:text-xl font-black text-slate-900">
                      Custom Residential Requirement
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    Select your package, plot area, and custom add-on services for real-time cost estimation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRequirementModalOpen(false)}
                  className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitRequirement} className="space-y-5">
                
                {/* ── STEP 1: Select Package Tier ───────────────────────────── */}
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                    1. Select Construction Package Tier
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {RESIDENTIAL_PACKAGES.map((pkg) => {
                      const isSelected = builderPackage.id === pkg.id;
                      return (
                        <div
                          key={pkg.id}
                          onClick={() => setBuilderPackage(pkg)}
                          className={`cursor-pointer p-3 rounded-2xl border transition-all text-center space-y-1 ${
                            isSelected
                              ? "bg-amber-50 border-amber-500 ring-2 ring-amber-400/40 shadow-sm"
                              : "bg-white border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <h4 className="text-xs font-black text-slate-900 truncate">{pkg.name}</h4>
                          <p className="text-xs font-extrabold text-amber-700">{pkg.price}</p>
                          <span className="text-[10px] text-slate-500 block">per sq.ft</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── STEP 2: Plot Area & Floors (Live Built-up Calculation) ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-800 block">
                      Plot Built-up Area (sq.ft)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="200"
                        max="20000"
                        value={plotArea}
                        onChange={(e) => setPlotArea(Number(e.target.value) || 0)}
                        placeholder="e.g. 1200"
                        className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs font-bold text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                        required
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        sq.ft
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-800 block">
                      Number of Floors
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { num: 1, label: "G" },
                        { num: 2, label: "G+1" },
                        { num: 3, label: "G+2" },
                        { num: 4, label: "G+3" },
                      ].map((f) => (
                        <button
                          key={f.num}
                          type="button"
                          onClick={() => setFloors(f.num)}
                          className={`py-2 rounded-xl text-xs font-extrabold transition-all border ${
                            floors === f.num
                              ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="sm:col-span-2 flex items-center justify-between border-t border-slate-200/80 pt-2 text-xs font-bold text-slate-600">
                    <span>Total Calculated Built-up Area:</span>
                    <span className="text-sm font-black text-slate-900 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200">
                      {totalBuiltupArea.toLocaleString("en-IN")} sq.ft
                    </span>
                  </div>
                </div>

                {/* ── STEP 3: Custom Add-on Services Checklist ──────────────── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                      3. Select Custom Add-on Services
                    </label>
                    <span className="text-[11px] font-bold text-amber-700">
                      {selectedAddons.length} Selected
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 scrollbar-thin">
                    {RESIDENTIAL_ADDONS.map((addon) => {
                      const isChecked = selectedAddons.includes(addon.id);
                      const IconComp = addon.icon;
                      return (
                        <div
                          key={addon.id}
                          onClick={() => toggleAddon(addon.id)}
                          className={`cursor-pointer p-3 rounded-2xl border transition-all flex items-start gap-2.5 ${
                            isChecked
                              ? "bg-amber-50/70 border-amber-400 shadow-2xs"
                              : "bg-white border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                            isChecked ? "bg-amber-500 border-amber-500 text-slate-950" : "border-slate-300 bg-white"
                          }`}>
                            {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>

                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center justify-between gap-1">
                              <h5 className="text-xs font-extrabold text-slate-900 truncate">
                                {addon.name}
                              </h5>
                              <span className="text-[10px] font-black text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded-md shrink-0">
                                {addon.unitText}
                              </span>
                            </div>
                            <p className="text-[10.5px] text-slate-500 leading-tight line-clamp-1 font-medium">
                              {addon.desc}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── STEP 4: Real-time Price Estimate Summary Card ─────────── */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 rounded-2xl shadow-lg space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                    <span>Base Package Cost ({builderPackage.name}):</span>
                    <span className="font-extrabold text-white">₹{basePackageCost.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                    <span>Custom Add-ons Total ({selectedAddons.length} services):</span>
                    <span className="font-extrabold text-amber-300">₹{addonsCost.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="border-t border-slate-700/80 pt-2 flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
                      Estimated Project Cost:
                    </span>
                    <span className="text-xl sm:text-2xl font-black text-amber-400">
                      ₹{totalEstimatedCost.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                {/* ── STEP 5: Final Contact & Site Details ──────────────────── */}
                <div className="space-y-3 pt-1">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                    4. Contact & Project Location Details
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Your Full Name *"
                      value={customerInfo.name}
                      onChange={(e) => setCustomerInfo((c) => ({ ...c, name: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs font-medium text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                      required
                    />
                    <input
                      type="tel"
                      placeholder="Mobile Phone Number *"
                      value={customerInfo.phone}
                      onChange={(e) => setCustomerInfo((c) => ({ ...c, phone: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs font-medium text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Site City / Location (e.g. Indore)"
                      value={customerInfo.city}
                      onChange={(e) => setCustomerInfo((c) => ({ ...c, city: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs font-medium text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    />
                    <select
                      value={customerInfo.startDate}
                      onChange={(e) => setCustomerInfo((c) => ({ ...c, startDate: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs font-medium text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    >
                      <option value="Immediately">Start Immediately</option>
                      <option value="Next 30 Days">Start Next 30 Days</option>
                      <option value="Within 3 Months">Within 3 Months</option>
                    </select>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Specific design preferences, custom materials, or special notes..."
                    value={customerInfo.notes}
                    onChange={(e) => setCustomerInfo((c) => ({ ...c, notes: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 bg-white py-2 px-3 text-xs font-medium text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 resize-none"
                  />
                </div>

                {/* ── STEP 6: Action Buttons ────────────────────────────────── */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleSendWhatsAppRequirement}
                    className="w-full sm:w-1/2 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                  >
                    <span>Send via WhatsApp</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-1/2 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-500/20 active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <span>Submitting Requirement...</span>
                    ) : (
                      <>
                        <span>Submit Final Requirement</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ConstructionPageShell>
  );
}
