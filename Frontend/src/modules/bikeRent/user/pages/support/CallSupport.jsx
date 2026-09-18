import { useEffect, useState } from "react";
import { Clock3, Phone } from "lucide-react";
import {
  BikeRentPageShell,
  BikeRentPageHeader,
  PrimaryButton,
} from "../../components/ui";
import { getBikeRentSupportPath } from "../../utils/routes";
import bikeRentUserApi from "../../services/userApi";

export default function CallSupport() {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    bikeRentUserApi
      .getPublicSettings()
      .then((settings) => {
        setPhone(settings?.supportPhone || "");
        setMessage(settings?.outOfServiceMessage || "");
      })
      .catch(() => {});
  }, []);

  return (
    <BikeRentPageShell>
      <BikeRentPageHeader
        title="Call Support"
        subtitle="Customer care"
        backTo={getBikeRentSupportPath()}
      />

      <main className="space-y-4 px-4 py-4">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF6A00]/10 text-[#FF6A00]">
            <Phone className="h-6 w-6" />
          </span>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-gray-400">
            Customer care number
          </p>
          <p className="mt-1 text-2xl font-black tracking-tight text-gray-900">
            {phone || "Support number unavailable"}
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1.5 text-[11px] font-semibold text-gray-600">
            <Clock3 className="h-3.5 w-3.5 text-[#FF6A00]" />
            Support hours are set by your local Bike Rent service.
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            {message || "Call us for booking and account help."}
          </p>
        </section>

        {phone ? (
          <a href={`tel:${phone}`}>
            <PrimaryButton><Phone className="h-4 w-4" />Call now</PrimaryButton>
          </a>
        ) : null}
      </main>
    </BikeRentPageShell>
  );
}
