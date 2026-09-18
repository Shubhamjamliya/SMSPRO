import { ShieldCheck, BadgeIndianRupee, Headphones } from "lucide-react";
import { useCompanyName } from "@food/hooks/useCompanyName";

const HIGHLIGHTS = [
  { id: "safe", label: "Safe rides", icon: ShieldCheck },
  { id: "fair", label: "Fair pricing", icon: BadgeIndianRupee },
  { id: "support", label: "24×7 support", icon: Headphones },
];

export default function BrandBanner() {
  const companyName = useCompanyName();

  return (
    <section
      className="relative overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-[linear-gradient(145deg,#FFF8F3_0%,#FFFFFF_42%,#F8FAFC_100%)] px-5 py-6 shadow-[0_8px_28px_rgba(15,23,42,0.05)]"
      aria-label="About Just Order Taxi"
    >
      <span
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#FF6A00]/10 blur-2xl"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -bottom-16 left-8 h-36 w-36 rounded-full bg-slate-200/40 blur-2xl"
        aria-hidden
      />

      <p className="relative text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF6A00]">
        Just Order Taxi
      </p>
      <h3 className="relative mt-2 max-w-[18ch] text-xl font-semibold leading-snug tracking-tight text-slate-900 sm:max-w-none sm:text-2xl">
        {companyName || "Just Order"} — Made for India,
        <br className="hidden sm:block" /> Crafted in Indore.
      </h3>
      <p className="relative mt-2.5 max-w-md text-sm leading-relaxed text-slate-600">
        Premium city rides with verified partners, transparent fares, and a
        booking experience built for everyday India.
      </p>

      <ul className="relative mt-5 flex flex-wrap gap-2">
        {HIGHLIGHTS.map(({ id, label, icon: Icon }) => (
          <li
            key={id}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
          >
            <Icon className="h-3.5 w-3.5 text-[#FF6A00]" aria-hidden />
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}
