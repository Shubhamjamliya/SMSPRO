import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { MessageCircle, Phone } from "lucide-react";
import {
  TaxiPageShell,
  TaxiPageHeader,
  SectionLabel,
  PrimaryButton,
} from "../../components/ui";
import AccordionList from "../../components/ui/Accordion";
import {
  getTaxiLiveChatPath,
  getTaxiCallSupportPath,
  getTaxiSupportPath,
} from "../../utils/routes";
import { getSupportTopic } from "../../utils/mock/support";

export default function SupportTopicDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const topic = getSupportTopic(slug);

  if (!topic) {
    return (
      <TaxiPageShell>
        <TaxiPageHeader title="Topic not found" backTo={getTaxiSupportPath()} />
        <main className="px-4 py-8 text-center text-sm text-gray-500">
          This help topic is unavailable.
        </main>
      </TaxiPageShell>
    );
  }

  return (
    <TaxiPageShell>
      <TaxiPageHeader
        title={topic.title}
        subtitle="Help Center"
        backTo={getTaxiSupportPath()}
      />

      <main className="space-y-5 px-4 py-4">
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs leading-relaxed text-gray-600">
            {topic.explanation}
          </p>
        </section>

        <section>
          <SectionLabel>Common solutions</SectionLabel>
          <ol className="space-y-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            {topic.solutions.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-gray-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FF6A00]/10 text-[10px] font-extrabold text-[#FF6A00]">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <SectionLabel>Helpful tips</SectionLabel>
          <ul className="space-y-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            {topic.tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-gray-600">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF6A00]" />
                {tip}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionLabel>Related FAQs</SectionLabel>
          <AccordionList items={topic.faqs} />
        </section>

        <section className="space-y-2.5 pb-2">
          <PrimaryButton onClick={() => navigate(getTaxiLiveChatPath())}>
            <MessageCircle className="h-4 w-4" />
            Live Chat
          </PrimaryButton>
          <PrimaryButton
            variant="outline"
            onClick={() => {
              navigate(getTaxiCallSupportPath());
              toast.message("Opening call support");
            }}
          >
            <Phone className="h-4 w-4" />
            Contact Support
          </PrimaryButton>
        </section>
      </main>
    </TaxiPageShell>
  );
}
