import {
  TaxiPageShell,
  TaxiPageHeader,
  SectionLabel,
} from "../../components/ui";
import { getTaxiProfilePath } from "../../utils/routes";
import { NOTIFICATION_GROUPS } from "../../utils/mock/profile";

export default function NotificationsPage() {
  return (
    <TaxiPageShell>
      <TaxiPageHeader
        title="Notifications"
        subtitle="Ride, offers & system"
        backTo={getTaxiProfilePath()}
      />
      <main className="space-y-5 px-4 py-4">
        {NOTIFICATION_GROUPS.map((group) => (
          <section key={group.id}>
            <SectionLabel>{group.title}</SectionLabel>
            <div className="space-y-2">
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-2xl border px-3.5 py-3 shadow-sm ${
                    item.unread
                      ? "border-[#FF6A00]/20 bg-[#FFF8F3]"
                      : "border-gray-100 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900">
                      {item.title}
                    </p>
                    {item.unread ? (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#FF6A00]" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                    {item.body}
                  </p>
                  <p className="mt-1.5 text-[10px] font-semibold text-gray-400">
                    {item.time}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </TaxiPageShell>
  );
}
