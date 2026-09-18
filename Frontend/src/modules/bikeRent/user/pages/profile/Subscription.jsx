import { Sparkles } from "lucide-react";
import {
  BikeRentPageShell,
  BikeRentPageHeader,
  EmptyState,
} from "../../components/ui";
import { getBikeRentProfilePath } from "../../utils/routes";

export default function SubscriptionPage() {
  return (
    <BikeRentPageShell>
      <BikeRentPageHeader
        title="Subscription"
        subtitle="Account settings"
        backTo={getBikeRentProfilePath()}
      />
      <main className="px-4 py-6">
        <EmptyState
          icon={Sparkles}
          title="Subscriptions are not available yet"
          subtitle="Membership options will appear in your account settings when Bike Rent subscriptions are enabled."
        />
      </main>
    </BikeRentPageShell>
  );
}
