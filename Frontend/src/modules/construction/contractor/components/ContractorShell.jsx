import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CalendarClock, FileText, HardHat, Home, Inbox, Menu, Wrench } from "lucide-react";
import { getContractorUser } from "../utils/authContractor";
import ContractorSidebar from "./ContractorSidebar";
import ContractorNotifications from "./ContractorNotifications";
import { CONSTRUCTION_FONT } from "../../shared/fonts";

const TABS = [
  { to: "/contractor/dashboard", label: "Home", icon: Home },
  { to: "/contractor/leads", label: "Enquiries", icon: Inbox },
  { to: "/contractor/jobs", label: "Jobs", icon: Wrench },
  { to: "/contractor/visits", label: "Visits", icon: CalendarClock },
  { to: "/contractor/quotations", label: "Quotes", icon: FileText },
  { to: "/contractor/projects", label: "Projects", icon: HardHat },
];

/**
 * The working contractor's app frame — header plus a bottom tab bar.
 *
 * Home first, then the order a job actually moves through: an enquiry arrives,
 * becomes a job, needs a site visit, gets quoted, and — once the customer
 * accepts — becomes a project with money held against it.
 *
 * Home earns its place because the dashboard is the landing page after login;
 * without it a contractor sitting on their own dashboard sees a nav bar with
 * nothing highlighted, which reads as broken.
 *
 * Earnings and Trust score are deliberately NOT tabs. Neither is a stage of the
 * pipeline, and at six tabs the bar is already at its limit on a small phone.
 * Both are reached from the dashboard, which is where a contractor goes looking
 * for money anyway.
 */
export default function ContractorShell({ title, subtitle, children, action }) {
  const navigate = useNavigate();
  const location = useLocation();
  const contractor = getContractorUser();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 pb-20 antialiased" style={{ fontFamily: CONSTRUCTION_FONT }}>
      <ContractorSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-4 py-3.5 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
          {/* The bar below holds five destinations; everything else lives in here. */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="-ml-1.5 shrink-0 rounded-lg p-2 text-gray-600 hover:bg-gray-100"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-bold tracking-tight text-gray-900">{title}</h1>
            <p className="truncate text-xs text-gray-500">
              {subtitle || contractor?.businessName || ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {action}
            {/* Signing out lives in the menu; the bell is what a contractor reaches for constantly. */}
            <ContractorNotifications />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 py-5">{children}</div>

      <nav
        className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white"
        aria-label="Contractor sections"
      >
        <div className="mx-auto flex max-w-lg">
          {TABS.map((tab) => {
            // Earnings and Trust score use this shell but are not tabs, and
            // both are reached from the dashboard. Falling back to Home keeps
            // one tab lit rather than leaving the bar looking dead.
            const onATab = TABS.some((t) => t.to !== "/contractor/dashboard"
              && location.pathname.startsWith(t.to));
            const active = tab.to === "/contractor/dashboard"
              ? !onATab
              : location.pathname.startsWith(tab.to);
            const Icon = tab.icon;
            return (
              <button
                key={tab.to}
                type="button"
                onClick={() => navigate(tab.to)}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-2.5 text-[10px] font-semibold transition-colors ${
                  active ? "text-orange-600" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="w-full truncate text-center">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
