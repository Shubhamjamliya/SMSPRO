/**
 * JUST_ORDER chart theme tokens.
 *
 * Mirrors the EXISTING Just Order Food/Admin brand tokens (global.css):
 *   primary  = #FF6A00 (--primary / --color-orange-500)
 *   hover    = #E85D04 (--color-primary-hover)
 *   light    = #FFF3EB (--secondary / --color-orange-50)
 *   success  = #2E7D32 (--color-accent-green)
 *   border   = #EDE8E0 (--border, warm paper)
 *   muted    = #5C5247 (--muted-foreground)
 * No new red is introduced — charts use the exact same brand red as the
 * rest of the Just Order Admin. This is NOT a component, only constants.
 */
export const JUST_ORDER_CHART = {
  primary: "#FF6A00",
  primaryHover: "#E85D04",
  primaryLight: "#FFF3EB",
  success: "#22C55E",
  warning: "#F59E0B",
  info: "#2563EB",
  danger: "#EF4444",
  violet: "#7C3AED",

  grid: "#E2E8F0",
  axis: "#64748B",

  // Ordered categorical palette for multi-series charts
  series: ["#FF6A00", "#0F172A", "#FF8C42", "#22C55E", "#F59E0B", "#EF4444"],

  // Shared modern tooltip / cursor styling
  tooltip: {
    contentStyle: {
      background: "#FFFFFF",
      border: "1px solid #E2E8F0",
      borderRadius: 14,
      boxShadow: "0 12px 28px -12px rgba(16,24,40,0.18)",
      padding: "10px 12px",
    },
    labelStyle: {
      color: "#0F172A",
      fontWeight: 600,
      marginBottom: 4,
      fontSize: 12,
    },
    itemStyle: { color: "#0F172A", fontSize: 12 },
    cursor: { fill: "rgba(255,106,0,0.05)" },
    lineCursor: { stroke: "rgba(255,106,0,0.25)", strokeWidth: 1 },
  },
};

export default JUST_ORDER_CHART;
