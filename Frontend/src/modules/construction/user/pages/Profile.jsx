import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { toast } from "sonner";
import {
  User, HardHat, FileText, ClipboardList, Wallet, MapPin,
  ShieldCheck, HelpCircle, LogOut, ChevronRight, Settings,
  Phone, Mail, ArrowLeft, RefreshCw, Building2, CheckCircle2, Lock, X, Layers,
} from "lucide-react";
import { clearUserSession } from "@food/utils/auth";
import { clearAuthState } from "@/app/slices/authSlice";
import { ConstructionPageShell, ConstructionPageHeader } from "../components/ui";

/**
 * BRD C1–C23 — Customer Profile & Construction Hub.
 * Minimalist profile screen with all account options & escrow wallet.
 */
export default function Profile() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth?.user);
  const [showEscrowInfo, setShowEscrowInfo] = useState(false);

  const handleLogout = () => {
    clearUserSession();
    dispatch(clearAuthState());
    toast.success("Logged out successfully");
    navigate("/user/auth/login", { replace: true });
  };

  return (
    <ConstructionPageShell>
      <ConstructionPageHeader
        title="Profile & Settings"
        subtitle="Manage account, site addresses & escrow preferences"
        backTo="/construction"
      />

      <div className="space-y-5 px-4 py-5">
        {/* User Card */}
        <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900 p-4.5 text-white shadow-md">
          <div className="flex items-center gap-3.5 relative z-10">
            {user?.profileImage ? (
              <img
                src={user.profileImage}
                alt=""
                className="h-14 w-14 shrink-0 rounded-lg object-cover ring-2 ring-amber-500/60"
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-slate-950 font-black text-lg shadow-2xs">
                {String(user?.name || user?.fullName || "U").charAt(0).toUpperCase()}
              </span>
            )}

            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-extrabold text-white">
                {user?.name || user?.fullName || "Valued Customer"}
              </h2>
              <div className="mt-0.5 space-y-0.5 text-xs text-slate-300 font-medium">
                {user?.phone ? (
                  <p className="flex items-center gap-1 truncate">
                    <Phone className="h-3 w-3 text-amber-400 shrink-0" />
                    {user.phone}
                  </p>
                ) : null}
                {user?.email ? (
                  <p className="flex items-center gap-1 truncate">
                    <Mail className="h-3 w-3 text-amber-400 shrink-0" />
                    {user.email}
                  </p>
                ) : null}
              </div>
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-[9.5px] font-extrabold text-amber-300 border border-amber-500/30">
                <ShieldCheck className="h-3 w-3 text-amber-400" /> Verified Account
              </span>
            </div>
          </div>
        </div>

        {/* Construction Workspace Quick Menu */}
        <section className="space-y-2.5">
          <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            Construction Workspace
          </h3>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              {
                title: "My Enquiries",
                subtitle: "Track requests",
                icon: ClipboardList,
                to: "/construction/enquiries",
                tone: "bg-blue-500/10 text-blue-600",
              },
              {
                title: "My Quotations",
                subtitle: "Inspect & compare",
                icon: FileText,
                to: "/construction/quotations",
                tone: "bg-amber-500/10 text-amber-600",
              },
              {
                title: "Active Projects",
                subtitle: "Milestones & payouts",
                icon: HardHat,
                to: "/construction/projects",
                tone: "bg-emerald-500/10 text-emerald-600",
              },
              {
                title: "Material Requests",
                subtitle: "Quotes & delivery",
                icon: Layers,
                to: "/construction/material-requests",
                tone: "bg-cyan-500/10 text-cyan-600",
              },
              {
                title: "Escrow Wallet",
                subtitle: "Held funds",
                icon: Wallet,
                to: "/food/user/wallet?from=construction",
                tone: "bg-purple-500/10 text-purple-600",
              },
            ].map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => navigate(item.to)}
                className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 text-left shadow-2xs hover:border-amber-400/80 transition-all active:scale-[0.98]"
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.tone} group-hover:scale-105 transition-transform`}>
                  <item.icon className="h-4 w-4 stroke-[2.2]" />
                </span>
                <div className="mt-2.5">
                  <p className="text-xs font-extrabold text-slate-900 group-hover:text-amber-700 transition-colors">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-[10.5px] font-medium text-slate-500">{item.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Options List Group */}
        <section className="space-y-2.5">
          <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
            Preferences & Support
          </h3>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs divide-y divide-slate-100">
            {[
              {
                label: "Saved Delivery & Site Addresses",
                desc: "Manage construction locations",
                icon: MapPin,
                action: () => navigate("/user/addresses"),
              },
              {
                label: "Escrow Guarantee & Protection Rules",
                desc: "How stage payouts stay safe",
                icon: Lock,
                action: () => setShowEscrowInfo(true),
              },
              {
                label: "Switch to Contractor Portal",
                desc: "Register or manage business",
                icon: Building2,
                action: () => navigate("/contractor"),
              },
              {
                label: "Customer Support & Help Center",
                desc: "Contact support team",
                icon: HelpCircle,
                action: () => toast.info("Support Team: support@smspro.in"),
              },
            ].map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={item.action}
                className="group flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-slate-50 transition-colors"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-amber-500/10 group-hover:text-amber-700 transition-colors">
                  <item.icon className="h-4 w-4 stroke-[2]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-slate-900 group-hover:text-amber-700 transition-colors">
                    {item.label}
                  </p>
                  <p className="text-[10.5px] font-medium text-slate-500">{item.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-amber-600 transition-colors stroke-[2.5]" />
              </button>
            ))}
          </div>
        </section>

        {/* Logout Button */}
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/60 py-3 text-xs font-extrabold text-rose-700 hover:bg-rose-100/60 transition-colors"
        >
          <LogOut className="h-4 w-4 stroke-[2.5]" /> Log Out of Account
        </button>

        <p className="text-center text-[10.5px] font-medium text-slate-400">
          SMS Pro Construction Module · v2.4.0
        </p>
      </div>

      {/* Escrow Guarantee Modal */}
      {showEscrowInfo ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 backdrop-blur-xs sm:items-center sm:justify-center p-0 sm:p-4">
          <div className="w-full rounded-t-xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-xl border border-slate-200 space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                <ShieldCheck className="h-4.5 w-4.5 text-amber-600 stroke-[2.2]" />
                Escrow Payment Protection
              </div>
              <button
                type="button"
                onClick={() => setShowEscrowInfo(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="space-y-2.5 text-xs text-slate-700 font-medium leading-relaxed">
              <li className="flex gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5 stroke-[2.5]" />
                <span><strong>Funds held safely:</strong> Deposits are held securely in SMS Pro escrow accounts.</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5 stroke-[2.5]" />
                <span><strong>Release upon approval:</strong> Payouts released stage by stage only when you confirm completion.</span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5 stroke-[2.5]" />
                <span><strong>Defect Retention:</strong> Retention percentage held until defect liability period completes.</span>
              </li>
            </ul>

            <button
              type="button"
              onClick={() => setShowEscrowInfo(false)}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-xs font-extrabold text-white hover:bg-slate-800 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </ConstructionPageShell>
  );
}
