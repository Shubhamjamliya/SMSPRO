import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Mail,
  MessageCircle,
  Phone,
  Siren,
} from "lucide-react";
import {
  TaxiPageShell,
  TaxiPageHeader,
  SectionLabel,
} from "../components/ui";
import {
  getTaxiCallSupportPath,
  getTaxiEmailSupportPath,
  getTaxiHomePath,
  getTaxiLiveChatPath,
  getTaxiSosPath,
  getTaxiTopicPath,
} from "../utils/routes";
import {
  SUPPORT_QUICK_ACTIONS,
  SUPPORT_TOPICS,
} from "../utils/mock/support";

const QUICK_ICONS = {
  chat: MessageCircle,
  call: Phone,
  sos: Siren,
  email: Mail,
};

const QUICK_PATHS = {
  chat: getTaxiLiveChatPath,
  call: getTaxiCallSupportPath,
  sos: getTaxiSosPath,
  email: getTaxiEmailSupportPath,
};

const TONE = {
  orange: "bg-[#FF6A00]/10 text-[#FF6A00]",
  blue: "bg-sky-50 text-sky-600",
  red: "bg-red-50 text-red-600",
  green: "bg-emerald-50 text-emerald-600",
};

export default function TaxiSupport() {
  const navigate = useNavigate();

  return (
    <TaxiPageShell showBottomNav>
      <TaxiPageHeader
        title="Support"
        subtitle="Help when you need it"
        backTo={getTaxiHomePath()}
      />

      <main className="space-y-5 px-4 py-4">
        <section>
          <SectionLabel>Quick actions</SectionLabel>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {SUPPORT_QUICK_ACTIONS.map((action) => {
              const Icon = QUICK_ICONS[action.id] || MessageCircle;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => navigate(QUICK_PATHS[action.pathKey]())}
                  className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 text-left shadow-sm active:scale-[0.99]"
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE[action.tone]}`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-gray-900">
                      {action.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-gray-500">
                      {action.description}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <SectionLabel>Help topics</SectionLabel>
          <div className="space-y-2">
            {SUPPORT_TOPICS.map((topic) => (
              <button
                key={topic.slug}
                type="button"
                onClick={() => navigate(getTaxiTopicPath(topic.slug))}
                className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 text-left shadow-sm active:scale-[0.99]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-gray-900">
                    {topic.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-gray-500 line-clamp-1">
                    {topic.summary}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
              </button>
            ))}
          </div>
        </section>
      </main>
    </TaxiPageShell>
  );
}
