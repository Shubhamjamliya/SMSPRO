import {
  Award,
  Building2,
  Crown,
  HardHat,
  Home,
  Layers,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

/**
 * Presentation for admin-managed packages.
 *
 * The back end stores only a `theme` and an `icon` KEY per package. The real
 * class names live here, written out in full: Tailwind finds classes by scanning
 * source text, so building them from a variable ("bg-" + colour) would ship none
 * of them. Keep every class as a literal string.
 */

export const PACKAGE_ICONS = {
  shield: { label: "Shield", Icon: ShieldCheck },
  crown: { label: "Crown", Icon: Crown },
  sparkles: { label: "Sparkles", Icon: Sparkles },
  award: { label: "Award", Icon: Award },
  building: { label: "Building", Icon: Building2 },
  hardhat: { label: "Hard hat", Icon: HardHat },
  layers: { label: "Layers", Icon: Layers },
  home: { label: "Home", Icon: Home },
};

export const PACKAGE_THEME_OPTIONS = [
  { value: "slate", label: "Slate", swatch: "bg-slate-500" },
  { value: "amber", label: "Amber (highlighted)", swatch: "bg-amber-500" },
  { value: "cyan", label: "Cyan", swatch: "bg-cyan-500" },
  { value: "purple", label: "Purple", swatch: "bg-purple-600" },
  { value: "blue", label: "Blue", swatch: "bg-blue-600" },
  { value: "emerald", label: "Emerald", swatch: "bg-emerald-500" },
];

/** Residential cards: badge, card, price box, icon tile, button and tick colours. */
const RESIDENTIAL_THEMES = {
  slate: {
    badgeColor: "bg-slate-100 text-slate-700 border-slate-300 font-bold",
    cardBg: "bg-gradient-to-b from-slate-50/80 via-white to-slate-50/40 border-slate-200/90 hover:border-slate-400",
    priceBg: "bg-slate-50 border-slate-200 text-slate-900",
    iconBg: "bg-slate-100 text-slate-700",
    btnStyle: "bg-slate-900 text-white hover:bg-slate-800",
    checkColor: "text-slate-600",
  },
  amber: {
    badgeColor: "bg-amber-500 text-slate-950 font-black shadow-sm",
    cardBg: "bg-gradient-to-b from-amber-50/80 via-white to-orange-50/30 border-amber-300 shadow-lg shadow-amber-500/10 ring-2 ring-amber-400/40 hover:border-amber-500",
    priceBg: "bg-amber-50/80 border-amber-200 text-amber-900",
    iconBg: "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20",
    btnStyle: "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black hover:bg-amber-400 shadow-md shadow-amber-500/20",
    checkColor: "text-amber-500",
  },
  cyan: {
    badgeColor: "bg-cyan-500 text-white font-bold",
    cardBg: "bg-gradient-to-b from-cyan-50/80 via-white to-blue-50/30 border-cyan-200/90 hover:border-cyan-400",
    priceBg: "bg-cyan-50/80 border-cyan-200 text-cyan-900",
    iconBg: "bg-cyan-500 text-white shadow-md shadow-cyan-500/20",
    btnStyle: "bg-cyan-600 text-white hover:bg-cyan-500 font-extrabold",
    checkColor: "text-cyan-600",
  },
  purple: {
    badgeColor: "bg-purple-600 text-white font-bold",
    cardBg: "bg-gradient-to-b from-purple-50/80 via-white to-indigo-50/30 border-purple-200/90 hover:border-purple-400",
    priceBg: "bg-purple-50/80 border-purple-200 text-purple-900",
    iconBg: "bg-purple-600 text-white shadow-md shadow-purple-600/20",
    btnStyle: "bg-purple-600 text-white hover:bg-purple-500 font-extrabold",
    checkColor: "text-purple-600",
  },
  blue: {
    badgeColor: "bg-blue-600 text-white font-bold",
    cardBg: "bg-gradient-to-b from-blue-50/80 via-white to-indigo-50/30 border-blue-200/90 hover:border-blue-400",
    priceBg: "bg-blue-50/80 border-blue-200 text-blue-900",
    iconBg: "bg-blue-600 text-white shadow-md shadow-blue-600/20",
    btnStyle: "bg-blue-600 text-white hover:bg-blue-500 font-extrabold",
    checkColor: "text-blue-600",
  },
  emerald: {
    badgeColor: "bg-emerald-600 text-white font-bold",
    cardBg: "bg-gradient-to-b from-emerald-50/80 via-white to-teal-50/30 border-emerald-200/90 hover:border-emerald-400",
    priceBg: "bg-emerald-50/80 border-emerald-200 text-emerald-900",
    iconBg: "bg-emerald-600 text-white shadow-md shadow-emerald-600/20",
    btnStyle: "bg-emerald-600 text-white hover:bg-emerald-500 font-extrabold",
    checkColor: "text-emerald-600",
  },
};

/** Commercial cards use a lighter set: badge, card and button only. */
const COMMERCIAL_THEMES = {
  slate: {
    badgeColor: "bg-slate-100 text-slate-800 border-slate-300",
    cardBg: "bg-gradient-to-b from-slate-50/80 via-white to-slate-50/30 border-slate-200 hover:border-slate-400",
    btnStyle: "bg-slate-900 text-white hover:bg-slate-800 font-extrabold",
  },
  amber: {
    badgeColor: "bg-amber-100 text-amber-900 border-amber-200",
    cardBg: "bg-gradient-to-b from-amber-50/60 via-white to-slate-50/30 border-amber-200 hover:border-amber-400",
    btnStyle: "bg-amber-500 text-slate-950 hover:bg-amber-400 font-black",
  },
  cyan: {
    badgeColor: "bg-cyan-100 text-cyan-800 border-cyan-200",
    cardBg: "bg-gradient-to-b from-cyan-50/60 via-white to-slate-50/30 border-cyan-200 hover:border-cyan-400",
    btnStyle: "bg-cyan-600 text-white hover:bg-cyan-500 font-extrabold",
  },
  purple: {
    badgeColor: "bg-purple-100 text-purple-800 border-purple-200",
    cardBg: "bg-gradient-to-b from-purple-50/60 via-white to-slate-50/30 border-purple-200 hover:border-purple-400",
    btnStyle: "bg-purple-600 text-white hover:bg-purple-500 font-extrabold",
  },
  blue: {
    badgeColor: "bg-blue-100 text-blue-800 border-blue-200",
    cardBg: "bg-gradient-to-b from-blue-50/60 via-white to-slate-50/30 border-blue-200 hover:border-blue-400",
    btnStyle: "bg-blue-600 text-white hover:bg-blue-500 font-extrabold",
  },
  emerald: {
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
    cardBg: "bg-gradient-to-b from-emerald-50/60 via-white to-slate-50/30 border-emerald-200 hover:border-emerald-400",
    btnStyle: "bg-emerald-600 text-white hover:bg-emerald-500 font-extrabold",
  },
};

const formatRupees = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

/**
 * Turns a package from the API into the object the customer screens render.
 *
 * `price` becomes a display string ("₹1,650") on purpose: the requirement builder
 * parses the rate back out of it, and prices are whole rupees by validation, so
 * the round trip is exact.
 */
export function toDisplayPackage(pkg) {
  const themes = pkg.segment === "commercial" ? COMMERCIAL_THEMES : RESIDENTIAL_THEMES;
  const theme = themes[pkg.theme] || themes.slate;
  const icon = PACKAGE_ICONS[pkg.icon] || PACKAGE_ICONS.building;
  return {
    ...theme,
    id: pkg._id,
    segment: pkg.segment,
    name: pkg.name,
    tagline: pkg.tagline || "",
    price: formatRupees(pkg.price),
    unit: pkg.unit || "per sq.ft",
    visitingFee: Number(pkg.visitingFee) || 0,
    badge: pkg.badge || "",
    popular: Boolean(pkg.isPopular),
    features: pkg.features || [],
    description: pkg.description || "",
    icon: icon.Icon,
  };
}

export { formatRupees };
