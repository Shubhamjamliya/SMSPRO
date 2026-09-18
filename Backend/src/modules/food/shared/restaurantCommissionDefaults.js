export const DEFAULT_RESTAURANT_COMMISSION_PERCENTAGE = 15;

/** Treat missing/zero commission as the platform default (15%). */
export function resolveRestaurantCommissionPercentage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_RESTAURANT_COMMISSION_PERCENTAGE;
  }
  return parsed;
}
