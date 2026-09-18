import { ShieldCheck } from "lucide-react";
import {
  BikeRentPageShell,
  BikeRentPageHeader,
  EmptyState,
} from "../../components/ui";
import { getBikeRentProfilePath } from "../../utils/routes";

export default function SecurityPage() {
  return (
    <BikeRentPageShell>
      <BikeRentPageHeader
        title="Security"
        subtitle="Protect your account"
        backTo={getBikeRentProfilePath()}
      />
      <main className="px-4 py-6">
        <EmptyState
          icon={ShieldCheck}
          title="Security settings are managed in your account"
          subtitle="Password, device, and sign-in controls will appear here when account security settings are available."
        />
      </main>
    </BikeRentPageShell>
  );
}
