import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import {
  BikeRentPageShell,
  BikeRentPageHeader,
  SectionLabel,
} from "../../components/ui";
import AccordionList from "../../components/ui/Accordion";
import {
  getBikeRentSupportPath,
  getBikeRentTopicPath,
} from "../../utils/routes";
import { BIKE_RENT_FAQS } from "../../utils/supportContent";

export function HelpCenterPage({ backTo = getBikeRentSupportPath() }) {
  const navigate = useNavigate();

  return (
    <BikeRentPageShell>
      <BikeRentPageHeader
        title="Help Center"
        subtitle="Guides & articles"
        backTo={backTo}
      />
      <main className="space-y-5 px-4 py-4">
        <section>
          <SectionLabel>Bike Rent guides</SectionLabel>
            <div className="space-y-2">
              {BIKE_RENT_FAQS.map((faq) => (
                <button
                  key={faq.id}
                  type="button"
                  onClick={() =>
                    navigate(getBikeRentTopicPath(faq.id))
                  }
                  className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 text-left shadow-sm active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-gray-900">
                      {faq.q}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-gray-500">
                      View answer
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </button>
              ))}
            </div>
        </section>
      </main>
    </BikeRentPageShell>
  );
}

export function FaqsPage({ backTo = getBikeRentSupportPath() }) {
  return (
    <BikeRentPageShell>
      <BikeRentPageHeader title="FAQs" subtitle="Quick answers" backTo={backTo} />
      <main className="space-y-5 px-4 py-4">
        <section>
          <SectionLabel>Bike Rent FAQs</SectionLabel>
          <AccordionList
            items={BIKE_RENT_FAQS.map((faq) => ({
              id: faq.id,
              question: faq.q,
              answer: faq.a,
            }))}
          />
        </section>
      </main>
    </BikeRentPageShell>
  );
}

export function ContactSupportPage({ backTo = getBikeRentSupportPath() }) {
  const navigate = useNavigate();
  return (
    <BikeRentPageShell>
      <BikeRentPageHeader
        title="Contact Support"
        subtitle="Choose a channel"
        backTo={backTo}
      />
      <main className="space-y-2.5 px-4 py-4">
        {[
          { title: "Call", subtitle: "Speak to customer care", to: "/bike-rent/support/call" },
          { title: "Email", subtitle: "Write to support", to: "/bike-rent/support/email" },
          { title: "Live Chat", subtitle: "Chat with an agent", to: "/bike-rent/support/chat" },
        ].map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => navigate(item.to)}
            className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3.5 text-left shadow-sm active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-gray-900">
                {item.title}
              </span>
              <span className="mt-0.5 block text-[11px] text-gray-500">
                {item.subtitle}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </button>
        ))}
      </main>
    </BikeRentPageShell>
  );
}

export default HelpCenterPage;
