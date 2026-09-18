/**
 * Compact no-show policy info card for checkout / booking details.
 */
export default function NoShowPolicyCard({
  message,
  graceMinutes,
  enabled = true,
  compact = false,
}) {
  if (!enabled && !message) return null;

  return (
    <section
      className={`rounded-2xl border border-amber-100 bg-amber-50/80 text-left ${
        compact ? "px-3 py-2.5" : "p-4"
      }`}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
        No Show Policy
      </p>
      <p className={`mt-1 text-amber-950 ${compact ? "text-xs leading-relaxed" : "text-sm leading-relaxed"}`}>
        {message
          || (enabled
            ? `If you do not pick up the bike within ${graceMinutes || 30} minutes of your scheduled pickup time, the refund will be processed according to the Bike Rental No Show Policy.`
            : "No-show policy is currently disabled.")}
      </p>
    </section>
  );
}
