import { Mail, MessageCircle, Phone } from "lucide-react";
import {
  BikeRentPageShell,
  BikeRentPageHeader,
  EmptyState,
  PrimaryButton,
} from "../../components/ui";
import {
  getBikeRentCallSupportPath,
  getBikeRentEmailSupportPath,
  getBikeRentSupportPath,
} from "../../utils/routes";

export default function LiveChat() {
  return (
    <BikeRentPageShell>
      <BikeRentPageHeader
        title="Live Chat"
        subtitle="Contact support another way"
        backTo={getBikeRentSupportPath()}
      />

      <main className="space-y-3 px-4 py-6">
        <EmptyState
          icon={MessageCircle}
          title="Chat coming soon"
          subtitle="For now, contact our support team by email or phone."
        />
        <a href={getBikeRentEmailSupportPath()}><PrimaryButton><Mail className="h-4 w-4" />Email support</PrimaryButton></a>
        <a href={getBikeRentCallSupportPath()}><PrimaryButton variant="outline"><Phone className="h-4 w-4" />Call support</PrimaryButton></a>
      </main>
    </BikeRentPageShell>
  );
}
