export const DEFAULT_RESTAURANT_COMMISSION_PERCENTAGE = 15;

export function resolveRestaurantCommissionPercentage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_RESTAURANT_COMMISSION_PERCENTAGE;
  }
  return parsed;
}

export function isCustomRestaurantCommission(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return false;
  return parsed !== DEFAULT_RESTAURANT_COMMISSION_PERCENTAGE;
}
