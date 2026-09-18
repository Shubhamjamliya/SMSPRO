import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowUp,
  ChevronRight,
  Clock3,
  MapPinned,
  Megaphone,
  Package,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import useModuleBackHandler from "@/modules/common/hooks/useModuleBackHandler";
import PorterBottomNav from "../components/layout/BottomNav";
import { useBooking } from "../context/BookingContext";
import { getPorterPickupPath, getPorterBookPath } from "../utils/routes";

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Set pickup",
    text: "Choose where we collect your parcel",
    icon: MapPinned,
  },
  {
    step: "02",
    title: "Add drop & load",
    text: "Share destination, weight and size",
    icon: Package,
  },
  {
    step: "03",
    title: "Track live",
    text: "Partner assigned with OTP handover",
    icon: Truck,
  },
];

const TRUST_POINTS = [
  {
    title: "Same-zone delivery",
    text: "Pickup and drop stay inside your service area for reliable ETAs.",
    icon: MapPinned,
  },
  {
    title: "Secure handover",
    text: "OTP-verified pickup and delivery so parcels stay protected.",
    icon: ShieldCheck,
  },
  {
    title: "On-time focus",
    text: "Live tracking and clear fare before you confirm the trip.",
    icon: Clock3,
  },
];

const ANNOUNCEMENTS = [
  {
    id: "a1",
    title: "Porter Enterprise",
    text: "Bulk trips and scheduled pickups for businesses.",
  },
  {
    id: "a2",
    title: "Weight-based fares",
    text: "Transparent distance + weight pricing on every vehicle.",
  },
];

/** Soft map-grid atmosphere behind the home canvas */
function MapAtmosphere() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(47, 107, 255, 0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(47, 107, 255, 0.06) 1px, transparent 1px)
          `,
          backgroundSize: "28px 28px",
        }}
      />
      <div
        className="absolute -right-16 top-24 h-56 w-56 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(47,107,255,0.12), transparent 70%)" }}
      />
      <div
        className="absolute -left-20 bottom-40 h-64 w-64 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(14,165,233,0.10), transparent 70%)" }}
      />
      <svg
        className="absolute left-4 top-36 h-40 w-40 text-[#2F6BFF]/[0.07]"
        viewBox="0 0 120 120"
        fill="none"
      >
        <circle cx="60" cy="60" r="48" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 6" />
        <circle cx="60" cy="60" r="28" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M60 28 L68 52 L60 44 L52 52 Z"
          fill="currentColor"
          opacity="0.5"
        />
      </svg>
    </div>
  );
}

function BookDeliveryIllustration() {
  return (
    <div className="relative h-[112px] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#EAF1FF] via-[#F3F7FF] to-[#DCE8FF]">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `
            linear-gradient(rgba(47, 107, 255, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(47, 107, 255, 0.08) 1px, transparent 1px)
          `,
          backgroundSize: "16px 16px",
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#C9DAFF]/60 to-transparent" />
      <div className="absolute bottom-5 left-0 right-0 h-[3px] bg-[#2F6BFF]/20" />
      <div className="absolute bottom-5 left-6 h-[3px] w-8 rounded-full bg-white/80" />
      <div className="absolute bottom-5 left-20 h-[3px] w-8 rounded-full bg-white/80" />
      <div className="absolute bottom-5 left-36 h-[3px] w-8 rounded-full bg-white/80" />

      <div className="absolute bottom-8 left-5 flex items-end gap-1.5">
        <div className="h-9 w-8 rounded-md bg-[#2F6BFF]/25 shadow-sm" />
        <div className="h-12 w-10 rounded-md bg-[#2F6BFF]/40 shadow-sm" />
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white shadow-sm">
          <Package className="h-3.5 w-3.5 text-[#2F6BFF]" strokeWidth={2.2} />
        </div>
      </div>

      <div className="absolute bottom-7 right-6 flex h-14 w-20 items-center justify-center">
        <div className="relative">
          <div className="absolute -inset-3 rounded-full bg-[#2F6BFF]/10 blur-md" />
          <Truck className="relative h-11 w-11 text-[#2F6BFF]" strokeWidth={1.6} />
        </div>
      </div>

      <div className="absolute right-16 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(47,107,255,0.18)]">
        <div className="h-2.5 w-2.5 rounded-full bg-[#2F6BFF]" />
      </div>
    </div>
  );
}

export default function Home({ embedded = false }) {
  useModuleBackHandler(true);
  const navigate = useNavigate();
  const { pickup } = useBooking();

  const goPickup = () => navigate(getPorterPickupPath());
  const goBook = () => navigate(getPorterBookPath());

  return (
    <div
      className={`relative min-h-screen overflow-x-hidden bg-[#F4F7FC] ${
        embedded ? "pb-24" : "pb-28"
      }`}
    >
      <MapAtmosphere />

      <main className="relative z-10 mx-auto max-w-lg px-4 pb-8 pt-3">
        {/* Pickup location header */}
        <motion.button
          type="button"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          onClick={goPickup}
          className="flex w-full items-center gap-3 rounded-2xl border border-white/80 bg-white px-3.5 py-3.5 text-left shadow-[0_8px_28px_rgba(15,40,90,0.08)] transition active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#22C55E] shadow-[0_6px_16px_rgba(34,197,94,0.35)]">
            <ArrowUp className="h-5 w-5 text-white" strokeWidth={2.6} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-medium text-[#6B7280]">
              Pick up from
            </span>
            <span className="mt-0.5 block truncate text-[14px] font-semibold tracking-tight text-[#0F172A]">
              {pickup?.address || pickup?.title || "Set pickup location"}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-[#C0C7D4]" strokeWidth={2} />
        </motion.button>

        {/* Single book-all card */}
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          onClick={goBook}
          className="mt-5 w-full overflow-hidden rounded-[22px] border border-white bg-white p-3 text-left shadow-[0_12px_36px_rgba(15,40,90,0.09)] transition active:scale-[0.99]"
        >
          <BookDeliveryIllustration />
          <div className="flex items-center justify-between px-1.5 pb-1 pt-3.5">
            <div>
              <p className="text-[17px] font-bold tracking-tight text-[#0F172A]">
                Book a delivery
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-[#6B7280]">
                One tap for all vehicle types
              </p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F1F5FB]">
              <ChevronRight className="h-5 w-5 text-[#2F6BFF]" strokeWidth={2.2} />
            </span>
          </div>
        </motion.button>

        {/* Static filler content */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.14 }}
          className="mt-5 overflow-hidden rounded-2xl border border-[#E8DEFF] bg-gradient-to-r from-[#FBF7FF] via-white to-[#F4F7FC] p-3.5 shadow-[0_8px_24px_rgba(15,40,90,0.05)]"
        >
          <div className="flex items-center gap-3">
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFF7E8] ring-1 ring-[#F6E2B8]">
              <Sparkles className="h-5 w-5 text-[#D97706]" strokeWidth={2} />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#FBBF24]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-[#0F172A]">Explore Porter Rewards</p>
              <p className="mt-0.5 text-[12px] text-[#6B7280]">
                Earn 2 coins for every ₹100 spent
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-[#C0C7D4]" />
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.18 }}
          className="mt-6"
        >
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-[15px] font-bold text-[#0F172A]">How it works</p>
              <p className="mt-0.5 text-[12px] text-[#6B7280]">Book to delivery in three steps</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {HOW_IT_WORKS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="flex items-center gap-3 rounded-2xl border border-white bg-white/90 px-3.5 py-3 shadow-[0_6px_20px_rgba(15,40,90,0.05)]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF3FF] text-[#2F6BFF]">
                    <Icon className="h-4.5 w-4.5" size={18} strokeWidth={2.1} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-[#0F172A]">{item.title}</p>
                    <p className="text-[11px] text-[#6B7280]">{item.text}</p>
                  </div>
                  <span className="text-[11px] font-bold tracking-wide text-[#A8B3C7]">
                    {item.step}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.22 }}
          className="mt-6"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[15px] font-bold text-[#0F172A]">Announcements</p>
            <span className="text-[12px] font-semibold text-[#2F6BFF]">View all</span>
          </div>
          <div className="space-y-2.5">
            {ANNOUNCEMENTS.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-2xl border border-white bg-white px-3.5 py-3.5 shadow-[0_6px_20px_rgba(15,40,90,0.05)]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF1FF] text-[#2F6BFF]">
                  <Megaphone className="h-[18px] w-[18px]" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[#0F172A]">{item.title}</p>
                  <p className="mt-0.5 text-[11px] text-[#6B7280]">{item.text}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#C0C7D4]" />
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.26 }}
          className="mt-6 mb-2"
        >
          <p className="mb-3 text-[15px] font-bold text-[#0F172A]">Why Porter</p>
          <div className="grid grid-cols-1 gap-2.5">
            {TRUST_POINTS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-[#E8EEF7] bg-white/80 px-3.5 py-3.5"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F1F5FB] text-[#2F6BFF]">
                      <Icon size={17} strokeWidth={2.1} />
                    </span>
                    <div>
                      <p className="text-[13px] font-bold text-[#0F172A]">{item.title}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[#6B7280]">
                        {item.text}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>
      </main>

      {embedded ? (
        <div className="md:hidden">
          <PorterBottomNav />
        </div>
      ) : null}
    </div>
  );
}
