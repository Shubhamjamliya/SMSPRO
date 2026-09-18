import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import {
  BikeRentPageShell,
  BikeRentPageHeader,
  PrimaryButton,
} from "../../components/ui";
import { getBikeRentSupportPath } from "../../utils/routes";
import bikeRentUserApi from "../../services/userApi";

export default function EmailSupport() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    bikeRentUserApi
      .getPublicSettings()
      .then((settings) => {
        setEmail(settings?.supportEmail || "");
        setMessage(settings?.outOfServiceMessage || "");
      })
      .catch(() => {});
  }, []);

  return (
    <BikeRentPageShell>
      <BikeRentPageHeader
        title="Email Support"
        subtitle="We reply within 24 hours"
        backTo={getBikeRentSupportPath()}
      />

      <main className="space-y-4 px-4 py-4">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Mail className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-sm font-extrabold text-gray-900">
            Write to us
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Include your Ride ID, screenshots, and a short description of the
            issue for faster resolution.
          </p>
          <p className="mt-4 rounded-xl bg-gray-50 px-3 py-2.5 text-sm font-bold text-gray-900">
            {email || "Support email is unavailable"}
          </p>
          {message ? <p className="mt-3 text-xs text-gray-500">{message}</p> : null}
        </section>

        {email ? (
          <a href={`mailto:${email}`}>
            <PrimaryButton><Mail className="h-4 w-4" />Compose email</PrimaryButton>
          </a>
        ) : null}
      </main>
    </BikeRentPageShell>
  );
}
