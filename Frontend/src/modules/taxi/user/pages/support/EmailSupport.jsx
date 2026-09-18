import { toast } from "sonner";
import { Mail } from "lucide-react";
import {
  TaxiPageShell,
  TaxiPageHeader,
  PrimaryButton,
} from "../../components/ui";
import { getTaxiSupportPath } from "../../utils/routes";
import { SUPPORT_CONTACT } from "../../utils/mock/support";

export default function EmailSupport() {
  return (
    <TaxiPageShell>
      <TaxiPageHeader
        title="Email Support"
        subtitle="We reply within 24 hours"
        backTo={getTaxiSupportPath()}
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
            {SUPPORT_CONTACT.email}
          </p>
        </section>

        <PrimaryButton
          onClick={() =>
            toast.message("Compose email", {
              description: `Placeholder mailto ${SUPPORT_CONTACT.email}`,
            })
          }
        >
          <Mail className="h-4 w-4" />
          Compose email
        </PrimaryButton>
      </main>
    </TaxiPageShell>
  );
}
