/**
 * Module kill-switch: gate NEW bookings/dispatch starts.
 * Existing open jobs must still complete/cancel/pay/track when a module is disabled.
 */
import { GlobalSettings } from '../../modules/common/models/settings.model.js';
import { toSettingsModuleKey } from '../../modules/common/utils/moduleKeys.js';
import { ValidationError } from '../auth/errors.js';

const DEFAULT_MODULES = {
  food: true,
  quickCommerce: true,
  porter: true,
  taxi: true,
  bikeRent: true,
  serviceProvider: true,
};

let cache = { at: 0, modules: { ...DEFAULT_MODULES } };
const CACHE_MS = 10_000;

export async function getEnabledModules(force = false) {
  const now = Date.now();
  if (!force && now - cache.at < CACHE_MS) {
    return cache.modules;
  }
  try {
    const settings = await GlobalSettings.findOne().select('modules').lean();
    const modules = { ...DEFAULT_MODULES, ...(settings?.modules || {}) };
    cache = { at: now, modules };
    return modules;
  } catch {
    return { ...DEFAULT_MODULES };
  }
}

export async function isModuleEnabled(moduleKey) {
  const settingsKey = toSettingsModuleKey(moduleKey) || String(moduleKey || '');
  if (!settingsKey) return true;
  const modules = await getEnabledModules();
  return modules[settingsKey] !== false;
}

/**
 * Throw if module is disabled. Use only on create / quote / start-dispatch.
 * @param {string} moduleKey - food | quickCommerce | porter | taxi (or driver keys)
 * @param {{ allowOpenJobs?: boolean }} [_opts] - reserved; callers should skip this for open-job paths
 */
export async function assertModuleEnabled(moduleKey, _opts = {}) {
  const ok = await isModuleEnabled(moduleKey);
  if (!ok) {
    const settingsKey = toSettingsModuleKey(moduleKey) || moduleKey;
    const err = new ValidationError(
      `Module "${settingsKey}" is currently disabled`,
      'MODULE_DISABLED',
    );
    err.statusCode = 503;
    throw err;
  }
}

export function invalidateModuleEnabledCache() {
  cache = { at: 0, modules: { ...DEFAULT_MODULES } };
}
