import { getQuickZoneContext } from "../hooks/useQuickHomeData";

/**
 * Shared QC catalog scope params (zoneId + lat/lng).
 * Home already filters by zone; every other shops/products caller should use this.
 */
export function buildQuickZoneCatalogParams(location = {}, extra = {}) {
  const ctx = getQuickZoneContext() || {};
  const params = { ...extra };

  const zoneId = extra.zoneId || ctx.zoneId || null;
  if (zoneId) params.zoneId = zoneId;

  if (
    Number.isFinite(location?.latitude) &&
    Number.isFinite(location?.longitude)
  ) {
    params.lat = location.latitude;
    params.lng = location.longitude;
  }

  return params;
}

export function hasQuickZoneScope(location = {}, zoneIdOverride = null) {
  const params = buildQuickZoneCatalogParams(location, {
    ...(zoneIdOverride ? { zoneId: zoneIdOverride } : {}),
  });
  return Boolean(
    params.zoneId ||
      (Number.isFinite(params.lat) && Number.isFinite(params.lng)),
  );
}

export function getCachedQuickZoneType() {
  return getQuickZoneContext()?.zoneType || null;
}

export function getCachedQuickZoneId() {
  return getQuickZoneContext()?.zoneId || null;
}
