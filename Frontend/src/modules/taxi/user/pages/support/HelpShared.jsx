import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import {
  TaxiPageShell,
  TaxiPageHeader,
  SectionLabel,
} from "../../components/ui";
import AccordionList from "../../components/ui/Accordion";
import {
  getTaxiSupportPath,
  getTaxiTopicPath,
} from "../../utils/routes";
import {
  HELP_CENTER_GROUPS,
  SUPPORT_FAQS,
  SUPPORT_TOPICS,
} from "../../utils/mock/support";

export function HelpCenterPage({ backTo = getTaxiSupportPath() }) {
  const navigate = useNavigate();

  return (
    <TaxiPageShell>
      <TaxiPageHeader
        title="Help Center"
        subtitle="Guides & articles"
        backTo={backTo}
      />
      <main className="space-y-5 px-4 py-4">
        {HELP_CENTER_GROUPS.map((group) => (
          <section key={group.id}>
            <SectionLabel>{group.title}</SectionLabel>
            <div className="space-y-2">
              {group.articles.map((article) => (
                <button
                  key={article.id}
                  type="button"
                  onClick={() =>
                    navigate(getTaxiTopicPath(SUPPORT_TOPICS[0].slug))
                  }
                  className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 text-left shadow-sm active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-gray-900">
                      {article.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-gray-500">
                      {article.readMins} min read
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>
    </TaxiPageShell>
  );
}

export function FaqsPage({ backTo = getTaxiSupportPath() }) {
  const grouped = useMemo(() => {
    const map = {};
    SUPPORT_FAQS.forEach((faq) => {
      if (!map[faq.category]) map[faq.category] = [];
      map[faq.category].push(faq);
    });
    return map;
  }, []);

  return (
    <TaxiPageShell>
      <TaxiPageHeader title="FAQs" subtitle="Quick answers" backTo={backTo} />
      <main className="space-y-5 px-4 py-4">
        {Object.entries(grouped).map(([category, items]) => (
          <section key={category}>
            <SectionLabel>{category}</SectionLabel>
            <AccordionList items={items} />
          </section>
        ))}
      </main>
    </TaxiPageShell>
  );
}

export function ContactSupportPage({ backTo = getTaxiSupportPath() }) {
  const navigate = useNavigate();
  return (
    <TaxiPageShell>
      <TaxiPageHeader
        title="Contact Support"
        subtitle="Choose a channel"
        backTo={backTo}
      />
      <main className="space-y-2.5 px-4 py-4">
        {[
          { title: "Call", subtitle: "Speak to customer care", to: "/taxi/support/call" },
          { title: "Email", subtitle: "Write to support", to: "/taxi/support/email" },
          { title: "Live Chat", subtitle: "Chat with an agent", to: "/taxi/support/chat" },
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
    </TaxiPageShell>
  );
}

export default HelpCenterPage;
