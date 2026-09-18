import { toast } from "sonner";
import { Copy, Gift, Users } from "lucide-react";
import {
  TaxiPageShell,
  TaxiPageHeader,
  SectionLabel,
  PrimaryButton,
} from "../../components/ui";
import { getTaxiProfilePath } from "../../utils/routes";
import { REFERRAL } from "../../utils/mock/profile";

export default function ReferEarnPage() {
  const ref = REFERRAL;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref.code);
      toast.success("Referral code copied");
    } catch {
      toast.message(ref.code);
    }
  };

  return (
    <TaxiPageShell>
      <TaxiPageHeader
        title="Refer & Earn"
        subtitle="Invite friends, earn rewards"
        backTo={getTaxiProfilePath()}
      />
      <main className="space-y-5 px-4 py-4">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00]">
            <Gift className="h-5 w-5" />
          </span>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">
            Your referral code
          </p>
          <p className="mt-1 font-mono text-2xl font-black tracking-widest text-gray-900">
            {ref.code}
          </p>
          <button
            type="button"
            onClick={copy}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#FF6A00]"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy code
          </button>
        </section>

        <PrimaryButton
          onClick={() =>
            toast.message("Invite friends", {
              description: "Placeholder share sheet.",
            })
          }
        >
          <Users className="h-4 w-4" />
          Invite Friends
        </PrimaryButton>

        <section>
          <SectionLabel>Rewards</SectionLabel>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm">
              <p className="text-[10px] font-bold uppercase text-gray-400">
                You get
              </p>
              <p className="mt-1 text-sm font-extrabold text-gray-900">
                {ref.rewardLabel}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm">
              <p className="text-[10px] font-bold uppercase text-gray-400">
                Friend gets
              </p>
              <p className="mt-1 text-sm font-extrabold text-gray-900">
                {ref.friendReward}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm">
              <p className="text-[10px] font-bold uppercase text-gray-400">
                Invited
              </p>
              <p className="mt-1 text-sm font-extrabold text-gray-900">
                {ref.invited} friends
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm">
              <p className="text-[10px] font-bold uppercase text-gray-400">
                Earned
              </p>
              <p className="mt-1 text-sm font-extrabold text-emerald-600">
                ₹{ref.earned}
              </p>
            </div>
          </div>
        </section>
      </main>
    </TaxiPageShell>
  );
}
