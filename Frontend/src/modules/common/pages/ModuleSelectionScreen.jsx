import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useEnabledModules } from "../hooks/useEnabledModules";
import { rememberUserModulePath } from "../utils/enabledModules";
import { useAuth } from "@core/context/AuthContext";
import AppMobileFrame from "../components/AppMobileFrame";
import ModulePictogram from "../components/ModulePictograms";

/**
 * The service picker: every service is one box of the same size, Construction first.
 *
 * Deliberately plain and unlike a template — a warm paper background, one dark ink, a single
 * typeface (Poppins), each box a flat tint of its service's own colour, and hand-drawn
 * pictograms instead of an icon set. The arrow is a typographic character, not an icon.
 */

const INK = "#1F1A17";
const INK_SOFT = "#5E564F";
const PAPER = "#F7F3EC";
const LINE = "#E4DCCF";
const FONT = "'Poppins', sans-serif";

/**
 * `tint` is the box's flat background. It is also handed to the pictogram as its "paper"
 * colour, so the windows and cut-outs in the drawing match the box exactly.
 * `labelColor` is a deeper shade of the accent for small text, where the accent alone is too pale.
 */
const ALL_MODULE_DEFINITIONS = [
  {
    id: "construction",
    moduleKey: "construction",
    title: "Construction",
    tagline: "Site visits and quotes",
    path: "/construction",
    accent: "#E8590C",
    tint: "#FBE2D2",
    labelColor: "#B9440A",
  },
  {
    id: "food",
    moduleKey: "food",
    title: "Food delivery",
    tagline: "Meals from local restaurants",
    path: "/food/user",
    accent: "#C4432B",
    tint: "#F5DDD5",
    labelColor: "#A5331F",
  },
  {
    id: "quickCommerce",
    moduleKey: "quickCommerce",
    title: "Quick commerce",
    tagline: "Groceries in minutes",
    path: "/quick",
    accent: "#2F7D5B",
    tint: "#D7EBDF",
    labelColor: "#22694A",
  },
  {
    id: "porter",
    moduleKey: "porter",
    title: "Courier",
    tagline: "Send parcels across town",
    path: "/porter",
    accent: "#2C5F8A",
    tint: "#D6E3EF",
    labelColor: "#244F73",
  },
  {
    id: "taxi",
    moduleKey: "taxi",
    title: "Taxi",
    tagline: "Cabs and autos",
    path: "/taxi",
    accent: "#C99512",
    tint: "#F6E8BF",
    labelColor: "#7A5A05",
  },
  {
    id: "bikeRent",
    moduleKey: "bikeRent",
    title: "Bike rental",
    tagline: "Self-drive, by the hour",
    path: "/bike-rent",
    accent: "#6B4C9A",
    tint: "#E4DCF0",
    labelColor: "#563A82",
  },
  {
    id: "serviceProvider",
    moduleKey: "serviceProvider",
    title: "Home services",
    tagline: "Repairs and cleaning",
    path: "/services",
    accent: "#1F7A7A",
    tint: "#D0E8E7",
    labelColor: "#186363",
  },
];

export default function ModuleSelectionScreen() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { modules: enabledModules, loading: modulesLoading } = useEnabledModules();
  const [searchQuery, setSearchQuery] = useState("");

  // Construction leads the list; a module switched off in settings simply is not there.
  const activeModules = useMemo(
    () => ALL_MODULE_DEFINITIONS.filter((m) => enabledModules[m.moduleKey] !== false),
    [enabledModules],
  );

  const filteredModules = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return activeModules;
    return activeModules.filter((m) => [m.title, m.tagline].some((text) => text.toLowerCase().includes(query)));
  }, [activeModules, searchQuery]);

  const handleSelectModule = (moduleItem) => {
    rememberUserModulePath(moduleItem.path);
    try {
      localStorage.setItem("selected_module", moduleItem.moduleKey);
    } catch {
      /* ignore */
    }
    navigate(moduleItem.path);
  };

  return (
    <AppMobileFrame bgClassName="bg-[#F7F3EC]">
      <div className="w-full" style={{ fontFamily: FONT, color: INK }}>
        <header
          className="sticky top-0 z-40 flex items-center justify-between px-5 py-4 backdrop-blur"
          style={{ backgroundColor: `${PAPER}F2`, borderBottom: `1px solid ${LINE}` }}
        >
          <button type="button" onClick={() => navigate("/modules")} className="flex items-baseline gap-2">
            <span className="text-[19px] font-bold leading-none tracking-[0.16em]">SMSPRO</span>
            <span className="h-[7px] w-[7px] translate-y-[-1px] bg-[#E8590C]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => navigate(isAuthenticated ? "/food/user/profile" : "/user/auth/login")}
            className="rounded-full px-4 py-1.5 text-[13px] font-medium transition hover:bg-black/5"
            style={{ border: `1px solid ${INK}` }}
          >
            {isAuthenticated ? "Account" : "Sign in"}
          </button>
        </header>

        <main className="px-5 pb-10 pt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: INK_SOFT }}>
            Choose a service
          </p>
          <h1 className="mt-2 text-[32px] font-semibold leading-[1.15] tracking-tight">What do you need today?</h1>

          {activeModules.length > 3 ? (
            <label className="mt-5 block">
              <span className="sr-only">Search services</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search — construction, taxi, groceries"
                className="w-full rounded-xl bg-white px-4 py-3 text-[14px] outline-none transition placeholder:text-[#9A9088] focus:border-[#1F1A17]"
                style={{ border: `1px solid ${LINE}` }}
              />
            </label>
          ) : null}

          {modulesLoading ? (
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="aspect-square animate-pulse rounded-2xl" style={{ backgroundColor: "#EAE3D7" }} />
              ))}
            </div>
          ) : filteredModules.length === 0 ? (
            <div className="mt-8 rounded-2xl bg-white p-8 text-center" style={{ border: `1px solid ${LINE}` }}>
              <p className="text-[15px] font-semibold">No service matches “{searchQuery}”</p>
              <p className="mt-1 text-[13px]" style={{ color: INK_SOFT }}>
                Try another word, or clear the search to see everything.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-4 rounded-full px-4 py-2 text-[13px] font-medium text-white"
                style={{ backgroundColor: INK }}
              >
                Show all services
              </button>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-3">
              {filteredModules.map((item, idx) => (
                <motion.button
                  key={item.id}
                  type="button"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * idx, duration: 0.3 }}
                  onClick={() => handleSelectModule(item)}
                  className="group flex aspect-square flex-col justify-between rounded-2xl p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]"
                  style={{ backgroundColor: item.tint, border: `1px solid ${item.accent}33` }}
                >
                  <ModulePictogram moduleKey={item.moduleKey} accent={item.accent} ink={INK} paper={item.tint} size={64} />

                  <span className="block">
                    <span className="block text-[17px] font-semibold leading-tight">{item.title}</span>
                    <span className="mt-1 block text-[12px] leading-snug" style={{ color: INK_SOFT }}>
                      {item.tagline}
                    </span>
                    <span
                      className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold"
                      style={{ color: item.labelColor }}
                    >
                      Open
                      <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
                    </span>
                  </span>
                </motion.button>
              ))}
            </div>
          )}
        </main>
      </div>

      <footer
        className="px-5 py-5 text-center text-[11.5px]"
        style={{ color: INK_SOFT, borderTop: `1px solid ${LINE}`, fontFamily: FONT }}
      >
        &copy; 2026 SMSPRO. All rights reserved.
      </footer>
    </AppMobileFrame>
  );
}
