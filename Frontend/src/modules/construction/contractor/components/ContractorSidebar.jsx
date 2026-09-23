import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Building2, CalendarClock, ChevronRight, FileText, HardHat, Home, Inbox,
  LogOut, ShieldCheck, User, Wallet, X,
} from "lucide-react";
import { clearContractorAuth, getContractorUser } from "../utils/authContractor";

/**
 * The contractor's full menu.
 *
 * The bottom bar carries five destinations because that is what fits on a phone.
 * Everything else a contractor occasionally needs — earnings, trust score, their
 * own profile, signing out — lives here, so nothing is buried and nothing is
 * crammed into the tab bar.
 *
 * Grouped by what the contractor is trying to do rather than by how the code is
 * organised: today's work, money, and their own account.
 */
const GROUPS = [
  {
    title: "Work",
    items: [
      { to: "/contractor/dashboard", label: "Home", icon: Home, hint: "What needs you today" },
      { to: "/contractor/leads", label: "Enquiries", icon: Inbox, hint: "New work matched to you" },
      { to: "/contractor/package-requests", label: "Package visits", icon: Building2, hint: "Paid site visits near you" },
      { to: "/contractor/visits", label: "Site visits", icon: CalendarClock, hint: "Scheduled and recorded" },
      { to: "/contractor/quotations", label: "Quotations", icon: FileText, hint: "Build and send quotes" },
      { to: "/contractor/projects", label: "Projects", icon: HardHat, hint: "Stages, progress and payment" },
    ],
  },
  {
    title: "Money",
    items: [
      { to: "/contractor/earnings", label: "Earnings", icon: Wallet, hint: "Paid, held and awaiting" },
    ],
  },
  {
    title: "You",
    items: [
      { to: "/contractor/profile", label: "My profile", icon: User, hint: "Your details and photo" },
      { to: "/contractor/score", label: "Trust score", icon: ShieldCheck, hint: "How customers see you" },
    ],
  },
];

export default function ContractorSidebar({ open, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const contractor = getContractorUser();

  // Escape closes it, and the page behind must not scroll while it is open.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const go = (to) => { onClose(); navigate(to); };

  const signOut = () => {
    clearContractorAuth();
    navigate("/contractor/login", { replace: true });
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-[60] bg-black/40 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        role="presentation"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-[61] flex w-[17.5rem] max-w-[85vw] flex-col bg-white shadow-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!open}
        aria-label="Contractor menu"
      >
        {/* ---- who you are ---- */}
        <div className="flex items-start gap-3 border-b border-gray-100 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
            {contractor?.profileImage ? (
              <img src={contractor.profileImage} alt="" className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-5 w-5 text-gray-400" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-gray-900">
              {contractor?.businessName || "Contractor"}
            </p>
            <p className="truncate text-[11px] text-gray-500">
              {contractor?.contractorCode || contractor?.phone || ""}
            </p>
            {contractor?.status === "approved" && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                <ShieldCheck className="h-3 w-3" /> Verified
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ---- the menu ---- */}
        <nav className="flex-1 overflow-y-auto py-2">
          {GROUPS.map((group) => (
            <div key={group.title} className="px-2 py-1.5">
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {group.title}
              </p>
              <ul>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname.startsWith(item.to);
                  return (
                    <li key={item.to}>
                      <button
                        type="button"
                        onClick={() => go(item.to)}
                        aria-current={active ? "page" : undefined}
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition ${
                          active ? "bg-orange-50" : "hover:bg-gray-50"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            active ? "text-orange-600" : "text-gray-400"
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-[13px] font-semibold ${
                              active ? "text-orange-700" : "text-gray-800"
                            }`}
                          >
                            {item.label}
                          </span>
                          <span className="block truncate text-[10.5px] text-gray-400">
                            {item.hint}
                          </span>
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-100 p-2">
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-red-50"
          >
            <LogOut className="h-4 w-4 shrink-0 text-red-500" />
            <span className="text-[13px] font-semibold text-red-600">Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
