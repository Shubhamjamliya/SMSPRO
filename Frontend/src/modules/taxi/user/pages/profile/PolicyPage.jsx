import {
  TaxiPageShell,
  TaxiPageHeader,
} from "../../components/ui";
import { getTaxiProfilePath } from "../../utils/routes";

export default function PolicyPage({ policy }) {
  return (
    <TaxiPageShell>
      <TaxiPageHeader
        title={policy.title}
        subtitle={policy.updated}
        backTo={getTaxiProfilePath()}
      />
      <main className="space-y-3 px-4 py-4">
        {policy.sections.map((section) => (
          <article
            key={section.heading}
            className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
          >
            <h2 className="text-sm font-extrabold text-gray-900">
              {section.heading}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-gray-600">
              {section.body}
            </p>
          </article>
        ))}
      </main>
    </TaxiPageShell>
  );
}
