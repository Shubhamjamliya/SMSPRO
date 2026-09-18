import { useEffect, useState } from "react";
import { Phone, Siren } from "lucide-react";
import {
  BikeRentPageShell,
  BikeRentPageHeader,
  PrimaryButton,
} from "../../components/ui";
import { getBikeRentSupportPath } from "../../utils/routes";
import bikeRentUserApi from "../../services/userApi";
import { SOS_INSTRUCTIONS } from "../../utils/supportContent";

export default function EmergencySos() {
  const [supportPhone, setSupportPhone] = useState("");

  useEffect(() => {
    bikeRentUserApi
      .getPublicSettings()
      .then((settings) => setSupportPhone(settings?.supportPhone || ""))
      .catch(() => setSupportPhone(""));
  }, []);

  return (
    <BikeRentPageShell>
      <BikeRentPageHeader
        title="Emergency SOS"
        subtitle="Get help immediately"
        backTo={getBikeRentSupportPath()}
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
                Move to a safe place and contact local emergency services if you
                are in immediate danger.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 px-0.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">Emergency instructions</h2>
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

        {supportPhone ? (
          <a href={`tel:${supportPhone}`}>
            <PrimaryButton variant="danger">
              <Phone className="h-4 w-4" />
              Call Bike Rent support
            </PrimaryButton>
          </a>
        ) : null}
      </main>
    </BikeRentPageShell>
  );
}
