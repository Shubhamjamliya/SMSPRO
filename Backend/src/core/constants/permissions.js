/**
 * Central RBAC permission key catalog for multi-module admin.
 * Employees must have matching AdminRole permissions; ADMIN bypasses checks.
 */
export const MODULE_PERMISSION_CATALOG = {
  food: {
    root: 'food',
    keys: ['food::orders', 'food::restaurants', 'food::zones', 'food::delivery'],
  },
  quick: {
    root: 'quick',
    keys: ['quick::orders', 'quick::sellers', 'quick::products', 'quick::zones'],
  },
  porter: {
    root: 'porter',
    keys: [
      'porter::zones',
      'porter::vehicles',
      'porter::pricing',
      'porter::coupons',
      'porter::banners',
      'porter::users',
      'porter::trips',
      'porter::orders',
    ],
  },
  taxi: {
    root: 'taxi',
    keys: [
      'taxi::zones',
      'taxi::vehicles',
      'taxi::pricing',
      'taxi::rides',
      'taxi::coupons',
    ],
  },
  // Backfilled: both modules are live but were never registered here, so no
  // employee role could be granted access to them and `checkPermission` had
  // nothing to match against.
  bikeRent: {
    root: 'bikeRent',
    keys: [
      'bikeRent::zones',
      'bikeRent::hubs',
      'bikeRent::bikes',
      'bikeRent::pricing',
      'bikeRent::bookings',
      'bikeRent::vendors',
      'bikeRent::coupons',
      'bikeRent::settlements',
    ],
  },
  serviceProvider: {
    root: 'serviceProvider',
    keys: [
      'serviceProvider::zones',
      'serviceProvider::categories',
      'serviceProvider::services',
      'serviceProvider::providers',
      'serviceProvider::bookings',
      'serviceProvider::requests',
      'serviceProvider::settings',
    ],
  },
  construction: {
    root: 'construction',
    keys: [
      'construction::enquiries',
      'construction::contractors',
      'construction::projects',
      'construction::quotations',
      // Money. `edit` on this key blocks or approves a payment release, so it
      // must never sit in a default employee role — keep it to a dedicated
      // finance role (BRD A7).
      'construction::payments',
      'construction::disputes',
      'construction::settings',
      'construction::reports',
    ],
  },
};

export const ALL_PERMISSION_KEYS = Object.values(MODULE_PERMISSION_CATALOG).flatMap(
  (m) => m.keys,
);
