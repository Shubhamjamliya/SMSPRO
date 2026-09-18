/**
 * Module-aware helpers for the shared cart address selector
 * (`/cart/address-selector` and `/food/user/address-selector`).
 */

export const ADDRESS_SELECTOR_PATH = "/cart/address-selector";
export const ADDRESS_SELECTOR_CONTEXT_KEY = "addressSelectorContext";

export const ADDRESS_SELECTOR_MODULES = {
  FOOD: "food",
  BIKE_RENT: "bike-rent",
  TAXI: "taxi",
  PORTER: "porter",
  QUICK: "quick",
  SERVICES: "services",
  CONSTRUCTION: "construction",
};

const MODULE_HOME = {
  [ADDRESS_SELECTOR_MODULES.FOOD]: "/food/user",
  [ADDRESS_SELECTOR_MODULES.BIKE_RENT]: "/bike-rent",
  [ADDRESS_SELECTOR_MODULES.TAXI]: "/taxi",
  [ADDRESS_SELECTOR_MODULES.PORTER]: "/porter",
  [ADDRESS_SELECTOR_MODULES.QUICK]: "/quick",
  [ADDRESS_SELECTOR_MODULES.SERVICES]: "/services",
  [ADDRESS_SELECTOR_MODULES.CONSTRUCTION]: "/construction",
};

const MODULE_ALIASES = {
  food: ADDRESS_SELECTOR_MODULES.FOOD,
  "bike-rent": ADDRESS_SELECTOR_MODULES.BIKE_RENT,
  bike_rent: ADDRESS_SELECTOR_MODULES.BIKE_RENT,
  bike: ADDRESS_SELECTOR_MODULES.BIKE_RENT,
  bikerent: ADDRESS_SELECTOR_MODULES.BIKE_RENT,
  taxi: ADDRESS_SELECTOR_MODULES.TAXI,
  porter: ADDRESS_SELECTOR_MODULES.PORTER,
  quick: ADDRESS_SELECTOR_MODULES.QUICK,
  "quick-commerce": ADDRESS_SELECTOR_MODULES.QUICK,
  services: ADDRESS_SELECTOR_MODULES.SERVICES,
  serviceprovider: ADDRESS_SELECTOR_MODULES.SERVICES,
  "service-provider": ADDRESS_SELECTOR_MODULES.SERVICES,
  construction: ADDRESS_SELECTOR_MODULES.CONSTRUCTION,
};

export function normalizeAddressSelectorModule(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return MODULE_ALIASES[key] || null;
}

/** Infer module from the page that opened the selector. */
export function detectAddressSelectorModuleFromPath(pathname = "") {
  const path = String(pathname || "");
  if (path.startsWith("/construction")) return ADDRESS_SELECTOR_MODULES.CONSTRUCTION;
  if (path.startsWith("/services") || path.startsWith("/service-provider")) return ADDRESS_SELECTOR_MODULES.SERVICES;
  if (path.startsWith("/bike-rent")) return ADDRESS_SELECTOR_MODULES.BIKE_RENT;
  if (path.startsWith("/taxi")) return ADDRESS_SELECTOR_MODULES.TAXI;
  if (path.startsWith("/porter")) return ADDRESS_SELECTOR_MODULES.PORTER;
  if (path.startsWith("/quick")) return ADDRESS_SELECTOR_MODULES.QUICK;
  if (path.startsWith("/cart") || path.startsWith("/food") || path.startsWith("/user")) {
    return ADDRESS_SELECTOR_MODULES.FOOD;
  }

  // Fallback: check saved localStorage active module
  try {
    const selected = localStorage.getItem("selected_module");
    if (selected && MODULE_ALIASES[selected]) return MODULE_ALIASES[selected];
    const lastPath =
      localStorage.getItem("smspro_last_user_module_path") ||
      localStorage.getItem("justorder_last_user_module_path");
    if (lastPath) {
      if (lastPath.startsWith("/construction")) return ADDRESS_SELECTOR_MODULES.CONSTRUCTION;
      if (lastPath.startsWith("/services")) return ADDRESS_SELECTOR_MODULES.SERVICES;
      if (lastPath.startsWith("/bike-rent")) return ADDRESS_SELECTOR_MODULES.BIKE_RENT;
      if (lastPath.startsWith("/taxi")) return ADDRESS_SELECTOR_MODULES.TAXI;
      if (lastPath.startsWith("/porter")) return ADDRESS_SELECTOR_MODULES.PORTER;
      if (lastPath.startsWith("/quick")) return ADDRESS_SELECTOR_MODULES.QUICK;
    }
  } catch {
    /* ignore */
  }

  return ADDRESS_SELECTOR_MODULES.FOOD;
}

export function getAddressSelectorModuleHome(moduleKey) {
  const module = normalizeAddressSelectorModule(moduleKey) || ADDRESS_SELECTOR_MODULES.FOOD;
  return MODULE_HOME[module] || MODULE_HOME[ADDRESS_SELECTOR_MODULES.FOOD];
}

function isSafeInternalPath(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//")) return false;
  return true;
}

function pathBelongsToModule(path, moduleKey) {
  const module = normalizeAddressSelectorModule(moduleKey);
  if (!module || !isSafeInternalPath(path)) return false;
  const pathname = path.split("?")[0].split("#")[0];
  if (module === ADDRESS_SELECTOR_MODULES.CONSTRUCTION) return pathname.startsWith("/construction");
  if (module === ADDRESS_SELECTOR_MODULES.SERVICES) {
    return pathname.startsWith("/services") || pathname.startsWith("/service-provider");
  }
  if (module === ADDRESS_SELECTOR_MODULES.BIKE_RENT) return pathname.startsWith("/bike-rent");
  if (module === ADDRESS_SELECTOR_MODULES.TAXI) return pathname.startsWith("/taxi");
  if (module === ADDRESS_SELECTOR_MODULES.PORTER) return pathname.startsWith("/porter");
  if (module === ADDRESS_SELECTOR_MODULES.QUICK) {
    return pathname.startsWith("/quick") || pathname.startsWith("/profile");
  }
  // Food: allow food, cart, and legacy /user paths
  return (
    pathname.startsWith("/food")
    || pathname.startsWith("/cart")
    || pathname.startsWith("/user")
    || pathname.startsWith("/profile")
  );
}

export function persistAddressSelectorContext(context = {}) {
  try {
    const module = normalizeAddressSelectorModule(context.module)
      || detectAddressSelectorModuleFromPath(context.from || context.backTo || "");
    const payload = {
      module,
      from: isSafeInternalPath(context.from) ? context.from : "",
      backTo: isSafeInternalPath(context.backTo) ? context.backTo : "",
      savedAt: Date.now(),
    };
    sessionStorage.setItem(ADDRESS_SELECTOR_CONTEXT_KEY, JSON.stringify(payload));
    return payload;
  } catch {
    return null;
  }
}

export function readAddressSelectorContext() {
  try {
    const raw = sessionStorage.getItem(ADDRESS_SELECTOR_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      module: normalizeAddressSelectorModule(parsed.module),
      from: isSafeInternalPath(parsed.from) ? parsed.from : "",
      backTo: isSafeInternalPath(parsed.backTo) ? parsed.backTo : "",
    };
  } catch {
    return null;
  }
}

export function clearAddressSelectorContext() {
  try {
    sessionStorage.removeItem(ADDRESS_SELECTOR_CONTEXT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Build URL + router state for opening the shared address selector.
 */
export function buildAddressSelectorNavigation({
  from,
  backTo,
  module,
  pathname,
  extraState = {},
} = {}) {
  const returnTo =
    (isSafeInternalPath(from) && from)
    || (isSafeInternalPath(backTo) && backTo)
    || (isSafeInternalPath(pathname) && pathname)
    || "/food/user";
  const resolvedModule =
    normalizeAddressSelectorModule(module)
    || detectAddressSelectorModuleFromPath(returnTo);

  const search = new URLSearchParams();
  search.set("module", resolvedModule);

  const state = {
    ...extraState,
    module: resolvedModule,
    from: returnTo,
    backTo: returnTo,
  };

  persistAddressSelectorContext(state);

  return {
    pathname: ADDRESS_SELECTOR_PATH,
    search: `?${search.toString()}`,
    state,
  };
}

/**
 * Resolve where confirm / back should go.
 */
export function resolveAddressSelectorReturnPath({
  search = "",
  state = {},
  fallbackModule,
} = {}) {
  const params = new URLSearchParams(
    typeof search === "string" ? search : String(search || ""),
  );
  const stored = readAddressSelectorContext();

  const module =
    normalizeAddressSelectorModule(params.get("module"))
    || normalizeAddressSelectorModule(state?.module)
    || normalizeAddressSelectorModule(stored?.module)
    || normalizeAddressSelectorModule(fallbackModule)
    || detectAddressSelectorModuleFromPath(state?.from || state?.backTo || stored?.from || "")
    || ADDRESS_SELECTOR_MODULES.FOOD;

  const candidates = [
    state?.from,
    state?.backTo,
    stored?.from,
    stored?.backTo,
  ].filter((value) => isSafeInternalPath(value));

  const moduleMatch = candidates.find((path) => pathBelongsToModule(path, module));
  if (moduleMatch) return moduleMatch;

  // Prefer any safe internal return path that isn't the selector itself.
  const anySafe = candidates.find((path) => {
    const pathname = path.split("?")[0];
    return (
      pathname !== ADDRESS_SELECTOR_PATH
      && pathname !== "/food/user/address-selector"
      && pathname !== "/user/address-selector"
    );
  });
  if (anySafe && pathBelongsToModule(anySafe, detectAddressSelectorModuleFromPath(anySafe))) {
    return anySafe;
  }

  // Food cart flow historically returned to /cart when opened from cart pages.
  if (module === ADDRESS_SELECTOR_MODULES.FOOD) {
    const foodCandidate = candidates.find((path) => {
      const pathname = path.split("?")[0];
      return pathname.startsWith("/cart") || pathname.startsWith("/food");
    });
    if (foodCandidate) return foodCandidate;
  }

  return getAddressSelectorModuleHome(module);
}
