import axios from 'axios';
import { isTokenExpired } from '@food/utils/auth';
import { redirectToModuleLogin } from '@core/utils/sessionExpiry';
import {
  attachSlowNetworkWatcher,
  clearRequestWatchers,
  installHttpErrorHandling,
} from '@/services/api/httpErrorHandling';
import { notifyNetworkStatus } from '@/services/api/networkToast';
import { ApiErrorCode } from '@/services/api/errors';

const AUTH_CONTEXT_KEY_BY_MODULE = {
  admin: 'auth_admin',
  seller: 'auth_seller',
  delivery: 'auth_delivery',
  customer: 'auth_customer',
  user: 'auth_customer',
  bike_vendor: 'auth_bike_vendor',
  service_provider: 'auth_service_provider',
  contractor: 'auth_contractor',
};

const AUTH_CONTEXT_EVENT_BY_MODULE = {
  admin: 'adminAuthChanged',
  seller: 'sellerAuthChanged',
  delivery: 'deliveryAuthChanged',
  customer: 'userAuthChanged',
  user: 'userAuthChanged',
};

const pickCustomerToken = () => {
  const candidates = [
    localStorage.getItem('user_accessToken'),
    localStorage.getItem('auth_customer'),
    localStorage.getItem('accessToken'),
  ].filter((token) => token && token !== 'null' && token !== 'undefined');

  const valid = candidates.find((token) => !isTokenExpired(token));
  return valid || candidates[0] || null;
};

const pickAdminToken = () => {
  const candidates = [
    localStorage.getItem('auth_admin'),
    localStorage.getItem('admin_accessToken'),
    localStorage.getItem('adminToken'),
  ].filter((token) => token && token !== 'null' && token !== 'undefined');

  const valid = candidates.find((token) => !isTokenExpired(token));
  return valid || candidates[0] || null;
};

const pickSellerToken = () =>
  localStorage.getItem('auth_seller') ||
  localStorage.getItem('seller_accessToken') ||
  null;

const pickDeliveryToken = () =>
  localStorage.getItem('auth_delivery') ||
  localStorage.getItem('delivery_accessToken') ||
  null;

const pickBikeVendorToken = () =>
  localStorage.getItem('auth_bike_vendor') ||
  localStorage.getItem('bike_vendor_accessToken') ||
  null;

const pickServiceProviderToken = () =>
  localStorage.getItem('auth_service_provider') ||
  localStorage.getItem('service_provider_accessToken') ||
  null;

const pickContractorToken = () =>
  localStorage.getItem('auth_contractor') ||
  localStorage.getItem('contractor_accessToken') ||
  null;

const normalizeUrl = (url = '') => String(url || '').toLowerCase();

/** Resolve which auth module owns a request URL. */
const getRequestModuleFromUrl = (url = '') => {
  const normalized = normalizeUrl(url);

  if (
    normalized.includes('/quick-commerce/admin') ||
    normalized.includes('/food/admin') ||
    normalized.startsWith('/admin') ||
    normalized.includes('/admin/') ||
    normalized.includes('/auth/admin') ||
    normalized.includes('admin/login')
  ) {
    return 'admin';
  }

  if (normalized.startsWith('/seller') || normalized.includes('/seller/')) {
    return 'seller';
  }

  if (
    normalized.startsWith('/delivery') ||
    normalized.includes('/food/delivery') ||
    normalized.includes('/partner/')
  ) {
    return 'delivery';
  }

  if (normalized.startsWith('/bike-rent/vendor')) {
    return 'bike_vendor';
  }

  // Do NOT classify `/service-provider` from the URL.
  // Customer + provider APIs share that prefix; page path is the only safe check.

  if (
    normalized.startsWith('/customer') ||
    normalized.startsWith('/user') ||
    normalized.startsWith('/quick-commerce') ||
    normalized.startsWith('/porter') ||
    normalized.startsWith('/taxi') ||
    normalized.startsWith('/cart') ||
    normalized.startsWith('/wishlist') ||
    normalized.startsWith('/categories') ||
    normalized.startsWith('/products')
  ) {
    return 'customer';
  }

  // Shared auth endpoints (/auth/me, /auth/refresh-token) — let the page module decide.
  return null;
};

const getCurrentModuleFromPath = (path = '') => {
  if (path.startsWith('/seller')) return 'seller';
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/delivery') || path.startsWith('/food/delivery')) return 'delivery';
  if (path.startsWith('/bike-rent/vendor')) return 'bike_vendor';
  if (path.startsWith('/service-provider')) return 'service_provider';
  if (path.startsWith('/contractor')) return 'contractor';
  return 'customer';
};

const getRefreshTokenForModule = (module) => {
  if (!module) return null;
  const keyModule = module === 'customer' ? 'user' : module;
  const moduleRefresh = localStorage.getItem(`${keyModule}_refreshToken`);
  if (moduleRefresh) return moduleRefresh;
  if (module === 'customer' || module === 'user') {
    return localStorage.getItem('refreshToken');
  }
  return null;
};

const MODULE_STORAGE_KEYS = {
  seller: ['auth_seller', 'seller_accessToken', 'seller_refreshToken', 'token'],
  admin: [
    'auth_admin',
    'admin_accessToken',
    'admin_refreshToken',
    'adminToken',
    'adminInfo',
    'token',
  ],
  delivery: [
    'auth_delivery',
    'delivery_accessToken',
    'delivery_refreshToken',
    'token',
  ],
  bike_vendor: [
    'auth_bike_vendor',
    'bike_vendor_accessToken',
    'bike_vendor_refreshToken',
    'bike_vendor_authenticated',
    'bike_vendor_user',
  ],
  contractor: [
    'auth_contractor',
    'contractor_accessToken',
    'contractor_refreshToken',
    'contractor_authenticated',
    'contractor_user',
  ],
  service_provider: [
    'auth_service_provider',
    'service_provider_accessToken',
    'service_provider_refreshToken',
    'service_provider_authenticated',
    'service_provider_user',
  ],
  customer: [
    'auth_customer',
    'user_accessToken',
    'user_refreshToken',
    'accessToken',
    'refreshToken',
    'token',
  ],
};

const SESSION_TOKEN_KEYS = [
  'auth_seller',
  'auth_admin',
  'auth_delivery',
  'auth_customer',
  'auth_bike_vendor',
  'auth_service_provider',
  'user_accessToken',
  'accessToken',
  'token',
];

const hasAnySessionToken = () =>
  SESSION_TOKEN_KEYS.some((key) => {
    try {
      const value = localStorage.getItem(key);
      return Boolean(value && value !== 'null' && value !== 'undefined');
    } catch {
      return false;
    }
  });

const clearModuleSession = (module) => {
  (MODULE_STORAGE_KEYS[module] || ['token']).forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  });
};

const persistRefreshedAccessToken = (module, newAccessToken) => {
  const keyModule = module === 'customer' ? 'user' : module;
  localStorage.setItem(`${keyModule}_accessToken`, newAccessToken);

  const authContextKey = AUTH_CONTEXT_KEY_BY_MODULE[module];
  if (authContextKey) {
    localStorage.setItem(authContextKey, newAccessToken);
  }

  if (module === 'admin') {
    localStorage.setItem('adminToken', newAccessToken);
  }
  if (module === 'customer' || module === 'user') {
    localStorage.setItem('accessToken', newAccessToken);
    localStorage.setItem('token', newAccessToken);
  }

  const eventName = AUTH_CONTEXT_EVENT_BY_MODULE[module];
  if (eventName) {
    window.dispatchEvent(new Event(eventName));
  }
  window.dispatchEvent(
    new CustomEvent('authRefreshed', {
      detail: { module: keyModule, token: newAccessToken },
    }),
  );
};

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Shared normalize / GET-retry / infra toasts — must register before 401 handler (LIFO).
installHttpErrorHandling(axiosInstance);

let isRefreshing = false;
let refreshSubscribers = [];

const subscribeToRefresh = (cb) => {
  refreshSubscribers.push(cb);
};

const flushRefreshSubscribers = (token) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

// Request interceptor for API calls
axiosInstance.interceptors.request.use(
  (config) => {
    let token = null;
    const url = String(config.url || '');
    const pagePath = window.location.pathname;
    const requestModule = getRequestModuleFromUrl(url);

    // 1. Prefer the module that owns the current page.
    if (pagePath.startsWith('/seller')) {
      token = pickSellerToken();
    } else if (pagePath.startsWith('/bike-rent/vendor')) {
      token = pickBikeVendorToken();
    } else if (pagePath.startsWith('/service-provider')) {
      token = pickServiceProviderToken();
    } else if (pagePath.startsWith('/contractor')) {
      token = pickContractorToken();
    } else if (pagePath.startsWith('/admin')) {
      token = pickAdminToken();
    } else if (pagePath.startsWith('/delivery') || pagePath.startsWith('/food/delivery')) {
      token = pickDeliveryToken();
    } else if (
      pagePath.startsWith('/customer') ||
      pagePath.startsWith('/quick') ||
      pagePath.startsWith('/porter') ||
      pagePath.startsWith('/taxi') ||
      pagePath.startsWith('/food/user')
    ) {
      token = pickCustomerToken();
    }

    // 2. Fallback to URL-based detection (QC admin APIs live under /quick-commerce/admin).
    if (!token) {
      if (requestModule === 'admin') token = pickAdminToken();
      else if (requestModule === 'seller') token = pickSellerToken();
      else if (requestModule === 'delivery') token = pickDeliveryToken();
      else if (requestModule === 'customer') token = pickCustomerToken();
      else if (requestModule === 'bike_vendor') token = pickBikeVendorToken();
    }

    // 3. Final default: on a general page with still no token, try customer token.
    if (
      !token &&
      !pagePath.startsWith('/admin') &&
      !pagePath.startsWith('/seller') &&
      !pagePath.startsWith('/delivery') &&
      !pagePath.startsWith('/bike-rent/vendor') &&
      !pagePath.startsWith('/service-provider') &&
      !pagePath.startsWith('/contractor')
    ) {
      token = pickCustomerToken();
    }

    if (!token) {
      token = localStorage.getItem('token');
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (config.data instanceof FormData && config.headers?.['Content-Type']) {
      delete config.headers['Content-Type'];
    }

    attachSlowNetworkWatcher(config, () =>
      notifyNetworkStatus(ApiErrorCode.SLOW_NETWORK),
    );

    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor — refresh before logging out.
axiosInstance.interceptors.response.use(
  (response) => {
    clearRequestWatchers(response?.config);
    return response;
  },
  async (error) => {
    clearRequestWatchers(error?.config);
    const originalRequest = error.config;
    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }

    const path = window.location.pathname;
    const requestUrl = String(originalRequest?.url || '');
    const currentModule = getCurrentModuleFromPath(path);
    const requestModule = getRequestModuleFromUrl(requestUrl);

    // Ignore cross-module 401s so a background call can't wipe the active session.
    if (requestModule && requestModule !== currentModule) {
      return Promise.reject(error);
    }

    const moduleForRefresh = requestModule || currentModule;
    const refreshToken = getRefreshTokenForModule(moduleForRefresh);
    const hadAccessToken = Boolean(originalRequest.headers?.Authorization);

    // Public pages with no session should not hard-redirect on 401.
    if (!refreshToken) {
      if (hadAccessToken || hasAnySessionToken()) {
        clearModuleSession(moduleForRefresh);
        redirectToModuleLogin(
          moduleForRefresh,
          'Your session has expired. Please log in again.',
        );
      }
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeToRefresh((newToken) => {
          if (!newToken) {
            reject(error);
            return;
          }
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          resolve(axiosInstance(originalRequest));
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const baseURL =
        axiosInstance.defaults.baseURL ||
        import.meta.env.VITE_API_BASE_URL ||
        'http://localhost:5000/api/v1';
      const refreshUrl = `${String(baseURL).replace(/\/$/, '')}/auth/refresh-token`;
      const { data } = await axios.post(
        refreshUrl,
        { refreshToken },
        { timeout: 10000 },
      );
      const newAccessToken =
        data?.data?.accessToken ||
        data?.result?.accessToken ||
        data?.accessToken;

      if (!newAccessToken) {
        throw new Error('Missing access token from refresh response');
      }

      persistRefreshedAccessToken(moduleForRefresh, newAccessToken);
      flushRefreshSubscribers(newAccessToken);
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return axiosInstance(originalRequest);
    } catch (refreshError) {
      flushRefreshSubscribers(null);
      clearModuleSession(moduleForRefresh);
      if (hadAccessToken || hasAnySessionToken()) {
        redirectToModuleLogin(
          moduleForRefresh,
          'Your session has expired. Please log in again.',
        );
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default axiosInstance;
