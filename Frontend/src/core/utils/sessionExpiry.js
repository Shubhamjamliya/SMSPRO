/**
 * Shared helper so any 401 handler (either axios instance) can consistently
 * surface a message to the user and land them on the correct module's login page.
 */

import { redirectToLoginWithReturn } from '@core/utils/postLoginRedirect';

const FLASH_KEY = 'auth_flash_message';

export const MODULE_LOGIN_PATHS = {
  admin: '/admin/login',
  seller: '/seller/auth',
  bike_vendor: '/bike-rent/vendor/login',
  delivery: '/food/delivery/login',
  restaurant: '/food/restaurant/login',
  bike_vendor: '/bike-rent/vendor/login',
  service_provider: '/service-provider/login',
  user: '/user/auth/login',
  customer: '/user/auth/login',
};

// Which module "owns" the page currently being viewed, so a background 401 for an
// unrelated module (e.g. a stale poll) doesn't hijack the session actually in use.
export function getModuleFromPathname(pathname) {
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/seller')) return 'seller';
  if (pathname.startsWith('/bike-rent/vendor')) return 'bike_vendor';
  if (pathname.startsWith('/food/delivery') || pathname.startsWith('/delivery')) return 'delivery';
  if (pathname.startsWith('/food/restaurant') || pathname.startsWith('/restaurant')) return 'restaurant';
  if (pathname.startsWith('/bike-rent/vendor')) return 'bike_vendor';
  if (pathname.startsWith('/service-provider')) return 'service_provider';
  return 'user';
}

export function setAuthFlashMessage(message) {
  try {
    sessionStorage.setItem(FLASH_KEY, message);
  } catch {
    // sessionStorage unavailable (private mode etc.) — the toast just won't survive the redirect.
  }
}

export function consumeAuthFlashMessage() {
  try {
    const message = sessionStorage.getItem(FLASH_KEY);
    if (message) sessionStorage.removeItem(FLASH_KEY);
    return message;
  } catch {
    return null;
  }
}

// Guards against multiple concurrent 401s each triggering their own redirect.
let hasRedirected = false;

export function redirectToModuleLogin(module, message = 'Your session has expired. Please log in again.') {
  if (hasRedirected) return;
  hasRedirected = true;
  setAuthFlashMessage(message);

  const loginPath = MODULE_LOGIN_PATHS[module] || MODULE_LOGIN_PATHS.user;
  if (module === 'user' || module === 'customer') {
    redirectToLoginWithReturn(loginPath);
    return;
  }

  window.location.href = loginPath;
}
