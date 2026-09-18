import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarClock, CheckCircle2, FileText, HardHat, Inbox, ShieldCheck, Wallet,
} from "lucide-react";
import contractorApi from "../services/contractorApi";
import ContractorShell from "../components/ContractorShell";
import { getContractorUser } from "../utils/authContractor";
import { fullMoney } from "../../shared/format";

/**
 * Approved-contractor landing page.
 *
 * The dashboard's job is to answer "what needs me today, and where is my money",
 * then get out of the way. Everything on it is a live figure that links to the
 * screen where the work is done — a dashboard that only describes the app is
 * just a menu with extra steps.
 *
 * Each panel fails independently: a contractor whose earnings call errors should
 * still see their waiting enquiries, so nothing here is fetched as a set.
 */
export default function ContractorDashboard() {
  const navigate = useNavigate();
  const [contractor, setContractor] = useState(getContractorUser());
  const [leads, setLeads] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [projects, setProjects] = useState(null);

  useEffect(() => {
    contractorApi.getMe().then(setContractor).catch(() => {});
    contractorApi.leadStats().then(setLeads).catch(() => {});
    contractorApi.getEarnings().then(setEarnings).catch(() => {});
    contractorApi
      .listProjects({ limit: 5, status: "active" })
      .then((r) => setProjects(r.rows))
      .catch(() => {});
  }, []);


  return (
    <ContractorShell
      title={contractor?.businessName || "Contractor"}
      subtitle={
        contractor?.contractorCode
          ? `Verified · ${contractor.contractorCode}`
          : "Verified contractor"
      }
      action={
        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3 w-3" /> Verified
        </span>
      }
    >
      <div className="space-y-5">
        {/* What needs attention, only when it actually does. */}
        {(leads?.newLeads > 0 || earnings?.awaitingApproval > 0) && (
          <section className="space-y-2">
            {leads?.newLeads > 0 && (
              <Alert
                tone="orange"
                onClick={() => navigate("/contractor/leads")}
                title={
                  leads.newLeads === 1
                    ? "1 new enquiry is waiting"
                    : `${leads.newLeads} new enquiries are waiting`
                }
                detail="A fast reply wins more work than a good price."
              />
            )}
            {earnings?.awaitingApproval > 0 && (
              <Alert
                tone="amber"
                onClick={() => navigate("/contractor/projects")}
                title={`${fullMoney(earnings.awaitingApproval)} awaiting customer approval`}
                detail="Released to your wallet as soon as each stage is approved."
              />
            )}
          </section>
        )}

        <section className="grid grid-cols-2 gap-3">
          <Figure
            label="In your wallet"
            value={fullMoney(earnings?.walletBalance)}
            icon={Wallet}
            onClick={() => navigate("/contractor/earnings")}
          />
          <Figure
            label="Held for your projects"
            value={fullMoney(earnings?.heldAgainstYourProjects)}
            icon={HardHat}
            tone="text-blue-700"
            onClick={() => navigate("/contractor/earnings")}
          />
        </section>

        {projects?.length > 0 && (
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[13px] font-bold uppercase tracking-wider text-gray-500">
                Live projects
              </h2>
              <button
                type="button"
                onClick={() => navigate("/contractor/projects")}
                className="text-xs font-semibold text-orange-600"
              >
                See all
              </button>
            </div>
            <ul className="space-y-2">
              {projects.map((p) => (
                <li key={p._id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/contractor/projects/${p._id}`)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {p.title || p.projectNumber}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {p.customerId?.name || p.projectNumber}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-emerald-700">
                      {fullMoney(p.releasedAmount)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-gray-500">
            Go to
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {[
              ["Enquiries", "New work matched to you", Inbox, "/contractor/leads"],
              ["Site visits", "Schedule and record visits", CalendarClock, "/contractor/visits"],
              ["Quotations", "Build and send quotes", FileText, "/contractor/quotations"],
              ["Projects", "Stages, progress and payment", HardHat, "/contractor/projects"],
              ["Trust score", "How customers rate you", ShieldCheck, "/contractor/score"],
              ["Earnings", "Paid, held and awaiting", Wallet, "/contractor/earnings"],
            ].map(([title, detail, Icon, to]) => (
              <li key={to}>
                <button
                  type="button"
                  onClick={() => navigate(to)}
                  className="flex h-full w-full flex-col gap-1.5 rounded-xl border border-gray-200 bg-white p-3.5 text-left transition hover:border-gray-300"
                >
                  <Icon className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-semibold text-gray-900">{title}</span>
                  <span className="text-xs leading-relaxed text-gray-500">{detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ContractorShell>
  );
}

function Alert({ tone, title, detail, onClick }) {
  const tones = {
    orange: "border-orange-200 bg-orange-50 text-orange-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-3.5 text-left ${tones[tone]}`}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-0.5 block text-xs leading-relaxed opacity-90">{detail}</span>
    </button>
  );
}

function Figure({ label, value, icon: Icon, tone = "text-gray-900", onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-gray-300"
    >
      <Icon className="h-4 w-4 text-gray-300" />
      <p className={`mt-2 text-lg font-semibold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </button>
  );
}
