import React from "react";
import { motion } from "framer-motion";
import { MapPin, Navigation } from "lucide-react";

/** Lightweight decorative map — same visual language as Porter MapPreview. */
export default function TaxiMapPreview({
  className = "",
  height = 180,
  pin = true,
  showRoute = false,
  rounded = "rounded-2xl",
}) {
  return (
    <div
      className={`relative overflow-hidden ${rounded} ${className}`}
      style={{ height }}
    >
      <div className="absolute inset-0 bg-[#e8eef0]" />
      <div className="absolute -left-6 top-6 h-20 w-28 rounded-2xl bg-[#cfe8d2]/80" />
      <div className="absolute right-4 bottom-8 h-24 w-24 rounded-2xl bg-[#cfe8d2]/70" />
      <div className="absolute right-0 top-0 h-16 w-32 rounded-bl-3xl bg-[#bcd8ea]/80" />
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <g stroke="#ffffff" strokeWidth="6" opacity="0.9" fill="none">
          <line x1="-10" y1="38%" x2="110%" y2="30%" />
          <line x1="20%" y1="-10" x2="34%" y2="110%" />
          <line x1="-10" y1="78%" x2="110%" y2="86%" />
          <line x1="74%" y1="-10" x2="64%" y2="110%" />
        </g>
        {showRoute ? (
          <motion.path
            d="M 40 160 C 110 120, 140 90, 200 80 S 280 50, 320 40"
            fill="none"
            stroke="#FF6A00"
            strokeWidth="4"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          />
        ) : null}
      </svg>
      {pin ? (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
          <MapPin
            className="h-9 w-9 text-[#FF6A00] fill-white drop-shadow-lg"
            strokeWidth={2.2}
          />
        </div>
      ) : null}
      <div className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md text-[#FF6A00]">
        <Navigation className="h-4 w-4" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/5 to-transparent" />
    </div>
  );
}
