export const DEFAULT_ENABLED_MODULES = {
  food: true,
  quickCommerce: true,
  porter: true,
  taxi: true,
  bikeRent: true,
  serviceProvider: true,
  // Ships OFF — construction stays hidden until the module passes acceptance.
  construction: false,
};

export const ALLOWED_MODULE_KEYS = Object.keys(DEFAULT_ENABLED_MODULES);

export const MODULE_LABELS = {
  food: "Food Delivery",
  quickCommerce: "Quick Commerce",
  porter: "Porter / Logistics",
  taxi: "Taxi",
  bikeRent: "Bike Rent",
  serviceProvider: "Service Provider",
  construction: "Construction",
};
 
export const MODULE_LANDING_PATHS = {
  food: "/food/user",
  quickCommerce: "/quick",
  porter: "/porter",
  taxi: "/taxi",
  bikeRent: "/bike-rent",
  serviceProvider: "/services",
  construction: "/construction",
};

export const TAB_TO_MODULE_KEY = {
  food: "food",
  quick: "quickCommerce",
  porter: "porter",
  taxi: "taxi",
  bike: "bikeRent",
  services: "serviceProvider",
  construction: "construction",
};

export const MODULE_KEY_TO_TAB = {
  food: "food",
  quickCommerce: "quick",
  porter: "porter",
  taxi: "taxi",
  bikeRent: "bike",
  // serviceProvider was missing here, so resolveTabFromPath fell back to "food"
  // for every /services route and the wrong home tab lit up.
  serviceProvider: "services",
  construction: "construction",
};

export const normalizeEnabledModules = (modules) => {
  const result = { ...DEFAULT_ENABLED_MODULES };
  if (modules && typeof modules === "object") {
    for (const [key, value] of Object.entries(modules)) {
      result[key] = value !== false;
    }
  }
  return result;
};

export const isModuleEnabled = (modules, moduleKey) => {
  if (!moduleKey) return true;
  return normalizeEnabledModules(modules)[moduleKey] !== false;
};

/** Persist last customer home module across refresh */
export const LAST_USER_MODULE_PATH_KEY = "smspro_last_user_module_path";

export const resolveModuleKeyFromPath = (pathname = "") => {
  const path = String(pathname || "");
  if (path === "/quick" || path.startsWith("/quick/")) return "quickCommerce";
  if (path === "/porter" || path.startsWith("/porter/")) return "porter";
  if (path === "/taxi" || path.startsWith("/taxi/")) return "taxi";
  if (path === "/bike-rent" || path.startsWith("/bike-rent/")) return "bikeRent";
  if (path === "/services" || path.startsWith("/services/")) return "serviceProvider";
  if (path === "/construction" || path.startsWith("/construction/")) return "construction";
  if (
    path === "/food/user" ||
    path.startsWith("/food/user/") ||
    path === "/food" ||
    path === "/food/"
  ) {
    return "food";
  }
  return null;
};

export const resolveTabFromPath = (pathname = "") => {
  const key = resolveModuleKeyFromPath(pathname);
  return key ? MODULE_KEY_TO_TAB[key] || "food" : "food";
};

export const rememberUserModulePath = (pathname = "") => {
  if (typeof window === "undefined") return;
  const key = resolveModuleKeyFromPath(pathname);
  if (!key) return;
  const landing = MODULE_LANDING_PATHS[key];
  if (!landing) return;
  try {
    window.localStorage.setItem(LAST_USER_MODULE_PATH_KEY, landing);
  } catch {
    /* ignore */
  }
};

export const getRememberedUserModulePath = (modules) => {
  if (typeof window === "undefined") return null;
  let stored = null;
  try {
    stored = window.localStorage.getItem(LAST_USER_MODULE_PATH_KEY);
  } catch {
    stored = null;
  }
  if (!stored) return null;
  const key = resolveModuleKeyFromPath(stored);
  if (!key || !isModuleEnabled(modules, key)) return null;
  return MODULE_LANDING_PATHS[key] || stored;
};

export const getFirstEnabledModulePath = (modules) => {
  const remembered = getRememberedUserModulePath(modules);
  if (remembered) return remembered;

  const normalized = normalizeEnabledModules(modules);
  for (const [key, path] of Object.entries(MODULE_LANDING_PATHS)) {
    if (normalized[key] !== false) return path;
  }
  return null;
};

export const getVisibleHomeTabs = (modules) => {
  const normalized = normalizeEnabledModules(modules);
  const tabs = [
    { id: "quick", moduleKey: "quickCommerce" },
    { id: "food", moduleKey: "food" },
    { id: "porter", moduleKey: "porter" },
    { id: "taxi", moduleKey: "taxi" },
    { id: "bike", moduleKey: "bikeRent" },
    { id: "services", moduleKey: "serviceProvider" },
    { id: "construction", moduleKey: "construction" },
  ];
  return tabs.filter((tab) => normalized[tab.moduleKey] !== false);
};

export const countEnabledModules = (modules) => {
  const normalized = normalizeEnabledModules(modules);
  return ALLOWED_MODULE_KEYS.filter((key) => normalized[key] !== false).length;
};

export const canDisableModule = (modules, moduleKey) => {
  if (!ALLOWED_MODULE_KEYS.includes(moduleKey)) return false;
  const normalized = normalizeEnabledModules(modules);
  if (normalized[moduleKey] === false) return true;
  const enabledCount = countEnabledModules(normalized);
  return enabledCount > 1;
};

export const validateModuleToggle = (modules, moduleKey, nextEnabled) => {
  if (!ALLOWED_MODULE_KEYS.includes(moduleKey)) {
    return { valid: false, message: "Unknown module selected." };
  }

  if (typeof nextEnabled !== "boolean") {
    return { valid: false, message: "Invalid module state." };
  }

  const nextModules = {
    ...normalizeEnabledModules(modules),
    [moduleKey]: nextEnabled,
  };

  if (countEnabledModules(nextModules) === 0) {
    return {
      valid: false,
      message: "At least one customer module must remain enabled.",
    };
  }

  return { valid: true, nextModules };
};

export const buildModulesUpdatePayload = (modules) => {
  const normalized = normalizeEnabledModules(modules);
  const payload = {};
  ALLOWED_MODULE_KEYS.forEach((key) => {
    payload[key] = normalized[key] !== false;
  });
  return payload;
};
