export const formatInr = (n) => {
  const value = Number(n);
  if (!Number.isFinite(value)) return "₹0";
  return `₹${value.toLocaleString("en-IN")}`;
};
