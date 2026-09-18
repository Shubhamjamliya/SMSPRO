import { toast } from "sonner";
import { Check, Sparkles } from "lucide-react";
import {
  TaxiPageShell,
  TaxiPageHeader,
  SectionLabel,
  PrimaryButton,
} from "../../components/ui";
import { getTaxiProfilePath } from "../../utils/routes";
import { SUBSCRIPTION } from "../../utils/mock/profile";

export default function SubscriptionPage() {
  const plan = SUBSCRIPTION;

  return (
    <TaxiPageShell>
      <TaxiPageHeader
        title="Subscription"
        subtitle="Membership benefits"
        backTo={getTaxiProfilePath()}
      />
      <main className="space-y-5 px-4 py-4">
        <section className="rounded-2xl border border-[#FF6A00]/20 bg-gradient-to-br from-[#FFF7F0] to-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#FF6A00]" />
            <span className="rounded-full bg-[#FF6A00]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#FF6A00]">
              {plan.status}
            </span>
          </div>
          <h2 className="mt-2 text-lg font-black text-gray-900">
            {plan.planName}
          </h2>
          <p className="mt-0.5 text-sm font-bold text-[#FF6A00]">
            {plan.priceLabel}
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            Renews on {plan.renewsOn}
          </p>
        </section>

        <section>
          <SectionLabel>Benefits</SectionLabel>
          <ul className="space-y-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            {plan.benefits.map((b) => (
              <li key={b} className="flex items-start gap-2 text-xs text-gray-700">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                {b}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionLabel>Upgrade plan</SectionLabel>
          <div className="space-y-2">
            {plan.upgrades.map((u) => (
              <div
                key={u.id}
                className={`flex items-center justify-between rounded-2xl border px-3.5 py-3 shadow-sm ${
                  u.current
                    ? "border-[#FF6A00] bg-[#FFF4ED]"
                    : "border-gray-100 bg-white"
                }`}
              >
                <div>
                  <p className="text-sm font-bold text-gray-900">{u.name}</p>
                  <p className="text-[11px] text-gray-500">{u.price}</p>
                </div>
                {u.current ? (
                  <span className="text-[10px] font-bold uppercase text-[#FF6A00]">
                    Current
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      toast.message(`Upgrade to ${u.name}`, {
                        description: "Placeholder — no payment started.",
                      })
                    }
                    className="rounded-lg bg-[#FF6A00] px-3 py-1.5 text-[11px] font-bold text-white"
                  >
                    Upgrade
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <PrimaryButton
          onClick={() => toast.message("Upgrade flow (placeholder)")}
        >
          Upgrade Plan
        </PrimaryButton>
      </main>
    </TaxiPageShell>
  );
}
