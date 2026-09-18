export const PORTER_DASHBOARD_PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

export function getPorterDashboardPeriodLabel(period) {
  const match = PORTER_DASHBOARD_PERIODS.find((item) => item.value === period);
  return match?.label || "Selected period";
}

export function buildPorterDashboardQuery(period, customFrom = "", customTo = "") {
  const query = { period: period || "today" };
  if (period === "custom") {
    if (customFrom) query.createdFrom = customFrom;
    if (customTo) query.createdTo = customTo;
  }
  return query;
}

export function isValidPorterCustomRange(period, customFrom, customTo) {
  if (period !== "custom") return true;
  if (!customFrom) return false;
  if (customTo && customFrom > customTo) return false;
  return true;
}
