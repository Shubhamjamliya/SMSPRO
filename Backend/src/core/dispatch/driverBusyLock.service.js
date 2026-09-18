/**
 * Shared Redis driver-busy lock across Food, Quick, Taxi, and Porter.
 * Prevents a partner from being offered overlapping jobs in any module.
 */
import { getRedisClient } from '../../config/redis.js';
import { logger } from '../../utils/logger.js';

const keyFor = (driverId) => `driver:${String(driverId)}:busy`;
const DEFAULT_TTL_SEC = 2 * 60 * 60; // 2h safety net

export async function setDriverBusy(driverId, ttlSec = DEFAULT_TTL_SEC) {
  if (!driverId) return;
  try {
    const redis = getRedisClient();
    if (!redis) return;
    await redis.set(keyFor(driverId), '1', { EX: ttlSec });
  } catch (e) {
    logger.warn(`setDriverBusy failed: ${e?.message || e}`);
  }
}

export async function clearDriverBusy(driverId) {
  if (!driverId) return;
  try {
    const redis = getRedisClient();
    if (!redis) return;
    await redis.del(keyFor(driverId));
  } catch (e) {
    logger.warn(`clearDriverBusy failed: ${e?.message || e}`);
  }
}

/** Return a Set of the given driver ids that currently hold a busy lock. */
export async function getRedisBusyDriverIds(driverIds = []) {
  const ids = [...new Set((driverIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return new Set();
  try {
    const redis = getRedisClient();
    if (!redis) return new Set();
    const flags = await Promise.all(ids.map((id) => redis.exists(keyFor(id))));
    return new Set(ids.filter((_, i) => flags[i]));
  } catch (e) {
    logger.warn(`getRedisBusyDriverIds failed: ${e?.message || e}`);
    return new Set();
  }
}
