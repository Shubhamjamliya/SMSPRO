import { useNavigate, useParams } from "react-router-dom";
import { MessageCircle, Phone } from "lucide-react";
import {
  BikeRentPageShell,
  BikeRentPageHeader,
  PrimaryButton,
  EmptyState,
} from "../../components/ui";
import {
  getBikeRentLiveChatPath,
  getBikeRentCallSupportPath,
  getBikeRentSupportPath,
} from "../../utils/routes";
import { BIKE_RENT_FAQS } from "../../utils/supportContent";

export default function SupportTopicDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const topic = BIKE_RENT_FAQS.find((faq) => faq.id === slug);

  if (!topic) {
    return (
      <BikeRentPageShell>
        <BikeRentPageHeader title="Topic not found" backTo={getBikeRentSupportPath()} />
        <main className="px-4 py-8">
          <EmptyState
            title="Topic not found"
            subtitle="This help topic is unavailable."
          />
        </main>
      </BikeRentPageShell>
    );
  }

  return (
    <BikeRentPageShell>
      <BikeRentPageHeader
        title={topic.q}
        subtitle="Help Center"
        backTo={getBikeRentSupportPath()}
      />

      <main className="space-y-5 px-4 py-4">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-sm leading-relaxed text-gray-700">{topic.a}</p>
        </section>

        <section className="space-y-2.5 pb-2">
          <PrimaryButton onClick={() => navigate(getBikeRentLiveChatPath())}>
            <MessageCircle className="h-4 w-4" />
            Live Chat
          </PrimaryButton>
          <PrimaryButton
            variant="outline"
            onClick={() => navigate(getBikeRentCallSupportPath())}
          >
            <Phone className="h-4 w-4" />
            Contact Support
          </PrimaryButton>
        </section>
      </main>
    </BikeRentPageShell>
  );
}
