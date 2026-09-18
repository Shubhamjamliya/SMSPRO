/**
 * Trip-complete hero — replaces the map on pay-for-ride.
 * Warm editorial route graphic (not a literal map clone).
 */
export default function RouteCompleteHero({
  className = "",
  pickupLabel = "",
  dropLabel = "",
  fareLabel = "",
}) {
  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden ${className}`}
      style={{
        background:
          "radial-gradient(120% 90% at 10% 0%, #FFF1E6 0%, transparent 55%), radial-gradient(90% 80% at 100% 20%, #FFE8D6 0%, transparent 50%), linear-gradient(180deg, #FFFBF7 0%, #FFFFFF 70%)",
      }}
    >
      {/* Soft atmosphere */}
      <div
        className="pointer-events-none absolute -left-16 top-6 h-40 w-40 rounded-full bg-[#FF6A00]/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-10 bottom-0 h-36 w-36 rounded-full bg-emerald-400/10 blur-3xl"
        aria-hidden
      />

      <div className="relative z-[1] flex flex-1 flex-col items-center justify-center px-5 pb-2 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold tracking-wide text-[#FF6A00] shadow-sm ring-1 ring-[#FF6A00]/15">
          <span className="h-1.5 w-1.5 rounded-full bg-[#FF6A00]" />
          Trip completed
        </div>

        <svg
          viewBox="0 0 360 200"
          className="h-[min(40vw,168px)] w-[min(92%,340px)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <linearGradient id="routeStroke" x1="60" y1="40" x2="300" y2="150" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF6A00" />
              <stop offset="0.55" stopColor="#111827" />
              <stop offset="1" stopColor="#EF4444" />
            </linearGradient>
            <filter id="pinShadow" x="-40%" y="-20%" width="180%" height="180%">
              <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity="0.18" />
            </filter>
          </defs>

          {/* Soft ground shadow under path */}
          <ellipse cx="180" cy="168" rx="110" ry="10" fill="#FF6A00" fillOpacity="0.06" />

          {/* Animated dashed journey */}
          <path
            d="M70 55 C 130 40, 145 145, 195 145 C 245 145, 255 70, 295 85"
            stroke="url(#routeStroke)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="9 9"
            fill="none"
            className="origin-center"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="36"
              to="0"
              dur="1.6s"
              repeatCount="indefinite"
            />
          </path>

          {/* Midpoint pulse */}
          <circle cx="195" cy="145" r="5" fill="#FF6A00" fillOpacity="0.25">
            <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
            <animate attributeName="fill-opacity" values="0.3;0.08;0.3" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="195" cy="145" r="3" fill="#FF6A00" />

          {/* Pickup pin */}
          <g transform="translate(48, 8)" filter="url(#pinShadow)">
            <path
              d="M22 2C13.716 2 7 8.716 7 17c0 11.5 15 32 15 32s15-20.5 15-32C37 8.716 30.284 2 22 2z"
              fill="#16A34A"
            />
            <circle cx="22" cy="17" r="6" fill="#FFFFFF" />
            <circle cx="22" cy="17" r="2.5" fill="#16A34A" />
          </g>

          {/* Drop pin */}
          <g transform="translate(273, 42)" filter="url(#pinShadow)">
            <path
              d="M22 2C13.716 2 7 8.716 7 17c0 11.5 15 32 15 32s15-20.5 15-32C37 8.716 30.284 2 22 2z"
              fill="#DC2626"
            />
            <circle cx="22" cy="17" r="6" fill="#FFFFFF" />
            <circle cx="22" cy="17" r="2.5" fill="#DC2626" />
          </g>
        </svg>

        <div className="mt-1 grid w-full max-w-sm grid-cols-[1fr_auto_1fr] items-center gap-2 px-1">
          <div className="min-w-0 text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-600/80">
              From
            </p>
            <p className="truncate text-[12px] font-semibold text-neutral-800">
              {pickupLabel || "Pickup"}
            </p>
          </div>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[11px] font-bold text-[#FF6A00] shadow-sm ring-1 ring-black/[0.05]">
            →
          </span>
          <div className="min-w-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-red-500/80">
              To
            </p>
            <p className="truncate text-[12px] font-semibold text-neutral-800">
              {dropLabel || "Drop"}
            </p>
          </div>
        </div>

        {fareLabel ? (
          <p className="mt-3 text-[13px] font-medium text-neutral-500">
            Amount due{" "}
            <span className="font-bold text-neutral-950">{fareLabel}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
