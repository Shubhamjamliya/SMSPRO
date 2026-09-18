import { toast } from "sonner";
import { Ambulance, MapPinned, Phone, Siren, ShieldAlert } from "lucide-react";
import {
  TaxiPageShell,
  TaxiPageHeader,
  SectionLabel,
  PrimaryButton,
} from "../../components/ui";
import { getTaxiSupportPath } from "../../utils/routes";
import { SOS_ACTIONS, SOS_INSTRUCTIONS } from "../../utils/mock/support";

const ICONS = {
  "emergency-contact": Phone,
  police: ShieldAlert,
  ambulance: Ambulance,
  share: MapPinned,
};

const TONE = {
  orange: "border-[#FF6A00]/20 bg-[#FFF4ED] text-[#FF6A00]",
  red: "border-red-200 bg-red-50 text-red-600",
  blue: "border-sky-200 bg-sky-50 text-sky-700",
};

export default function EmergencySos() {
  const onAction = (action) => {
    toast.message(action.title, {
      description: "Placeholder action — no call was placed.",
    });
  };

  return (
    <TaxiPageShell>
      <TaxiPageHeader
        title="Emergency SOS"
        subtitle="Get help immediately"
        backTo={getTaxiSupportPath()}
      />

      <main className="space-y-5 px-4 py-4">
        <section className="rounded-2xl border border-red-200 bg-gradient-to-br from-red-600 to-red-500 p-4 text-white shadow-md">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
              <Siren className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-extrabold">You are in SOS mode</h2>
              <p className="mt-1 text-xs leading-relaxed text-white/90">
                Use the actions below only in a real emergency. Placeholder
                buttons will not dial emergency services.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-2.5">
          {SOS_ACTIONS.map((action) => {
            const Icon = ICONS[action.id] || Phone;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => onAction(action)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3.5 text-left shadow-sm active:scale-[0.99] ${TONE[action.tone]}`}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/80">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-gray-900">
                    {action.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-gray-600">
                    {action.subtitle}
                  </span>
                </span>
              </button>
            );
          })}
        </section>

        <section>
          <SectionLabel>Emergency instructions</SectionLabel>
          <ul className="space-y-2.5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            {SOS_INSTRUCTIONS.map((line, i) => (
              <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-gray-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-50 text-[10px] font-extrabold text-red-600">
                  {i + 1}
                </span>
                {line}
              </li>
            ))}
          </ul>
        </section>

        <PrimaryButton
          variant="danger"
          onClick={() =>
            toast.message("Safety desk alerted", {
              description: "Placeholder — no real alert was sent.",
            })
          }
        >
          Alert Just Order Safety Desk
        </PrimaryButton>
      </main>
    </TaxiPageShell>
  );
}
