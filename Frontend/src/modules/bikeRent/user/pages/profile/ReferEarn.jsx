import { Gift } from "lucide-react";
import {
  BikeRentPageShell,
  BikeRentPageHeader,
  EmptyState,
} from "../../components/ui";
import { getBikeRentProfilePath } from "../../utils/routes";

export default function ReferEarnPage() {
  return (
    <BikeRentPageShell>
      <BikeRentPageHeader
        title="Refer & Earn"
        subtitle="Invite friends, earn rewards"
        backTo={getBikeRentProfilePath()}
      />
      <main className="px-4 py-6">
        <EmptyState
          icon={Gift}
          title="Referrals are coming soon"
          subtitle="Your referral code and rewards will be managed through account settings when the feature is available."
        />
      </main>
    </BikeRentPageShell>
  );
}
