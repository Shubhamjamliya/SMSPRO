import { Gift, Percent, Wallet, ChevronRight } from "lucide-react";

const CARDS = [
  {
    id: "wallet",
    title: "Save with Wallet",
    subtitle: "Cashback on prepaid rides",
    icon: Wallet,
    tone: "from-[#FF6A00] to-[#FF8A3D]",
    actionable: true,
  },
  {
    id: "promo",
    title: "Save with Promo",
    subtitle: "Apply codes when you book",
    icon: Percent,
    tone: "from-emerald-600 to-teal-500",
    actionable: false,
  },
  {
    id: "member",
    title: "Membership",
    subtitle: "Priority pickup & exclusive fares",
    icon: Gift,
    tone: "from-slate-800 to-slate-600",
    actionable: false,
  },
];

export default function SavingsSection({ onOpenWallet, variant = "cards" }) {
  if (variant === "compact") {
    return (
      <div className="flex gap-2 overflow-x-auto overscroll-x-contain no-scrollbar">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => (card.id === "wallet" ? onOpenWallet?.() : null)}
              className={`inline-flex min-h-[40px] shrink-0 cursor-pointer items-center gap-2 rounded-full bg-gradient-to-r ${card.tone} px-3 py-2 text-white outline-none transition-opacity duration-200 hover:opacity-95 focus-visible:ring-2 focus-visible:ring-white/50`}
              aria-label={card.title}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span className="text-xs font-semibold">{card.title}</span>
              {card.actionable ? (
                <ChevronRight className="h-3.5 w-3.5 opacity-80" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto overscroll-x-contain no-scrollbar pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
      {CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => (card.id === "wallet" ? onOpenWallet?.() : null)}
            className={`group relative w-[200px] shrink-0 cursor-pointer overflow-hidden rounded-[1.25rem] bg-gradient-to-br ${card.tone} p-4 text-left text-white shadow-[0_10px_28px_rgba(15,23,42,0.12)] outline-none transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100 active:translate-y-px`}
            aria-label={card.title}
          >
            <span
              className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10"
              aria-hidden
            />
            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/25">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <p className="relative mt-3.5 text-[15px] font-semibold leading-snug tracking-tight">
              {card.title}
            </p>
            <p className="relative mt-1 text-xs leading-relaxed text-white/85">
              {card.subtitle}
            </p>
            {card.actionable ? (
              <span className="relative mt-3 inline-flex items-center gap-0.5 text-[11px] font-semibold text-white/90">
                Open wallet
                <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
