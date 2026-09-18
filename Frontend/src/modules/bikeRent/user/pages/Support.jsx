import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Mail,
  MessageCircle,
  Phone,
  Siren,
} from "lucide-react";
import {
  BikeRentPageShell,
  BikeRentPageHeader,
  SectionLabel,
} from "../components/ui";
import {
  getBikeRentCallSupportPath,
  getBikeRentEmailSupportPath,
  getBikeRentHomePath,
  getBikeRentLiveChatPath,
  getBikeRentSosPath,
  getBikeRentTopicPath,
} from "../utils/routes";
import { BIKE_RENT_FAQS } from "../utils/supportContent";

const QUICK_ACTIONS = [
  { id: "chat", title: "Live chat", description: "Get help by email or phone", Icon: MessageCircle, to: getBikeRentLiveChatPath, tone: "bg-[#FF6A00]/10 text-[#FF6A00]" },
  { id: "call", title: "Call support", description: "Speak with customer care", Icon: Phone, to: getBikeRentCallSupportPath, tone: "bg-sky-50 text-sky-600" },
  { id: "sos", title: "Emergency SOS", description: "Get safety instructions", Icon: Siren, to: getBikeRentSosPath, tone: "bg-red-50 text-red-600" },
  { id: "email", title: "Email support", description: "Send us the details", Icon: Mail, to: getBikeRentEmailSupportPath, tone: "bg-emerald-50 text-emerald-600" },
];

export default function BikeRentSupport() {
  const navigate = useNavigate();

  return (
    <BikeRentPageShell showBottomNav>
      <BikeRentPageHeader
        title="Support"
        subtitle="Help when you need it"
        backTo={getBikeRentHomePath()}
      />

      <main className="space-y-5 px-4 py-4">
        <section>
          <SectionLabel>Quick actions</SectionLabel>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {QUICK_ACTIONS.map((action) => {
              const { Icon } = action;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => navigate(action.to())}
                  className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 text-left shadow-sm active:scale-[0.99]"
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${action.tone}`}
                  >
                    <Icon className="h-4.5 w-4.5" />
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
            {BIKE_RENT_FAQS.map((topic) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => navigate(getBikeRentTopicPath(topic.id))}
                className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 text-left shadow-sm active:scale-[0.99]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-gray-900">
                    {topic.q}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-gray-500 line-clamp-1">
                    {topic.a}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
              </button>
            ))}
          </div>
        </section>
      </main>
    </BikeRentPageShell>
  );
}
