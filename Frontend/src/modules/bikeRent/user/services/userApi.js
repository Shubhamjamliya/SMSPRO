import axiosInstance from '@core/api/axios';

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

const unwrapPaginated = (response) => {
  const data = unwrap(response);
  return {
    records: data.records || [],
    page: data.page || 1,
    pages: data.pages || 1,
    total: data.total || 0,
    hasNext: Boolean(data.hasNext),
    hasPrev: Boolean(data.hasPrev),
    limit: data.limit || 20,
    zoneId: data.zoneId || null,
  };
};

const bikeRentUserApi = {
  detectZone: async (lat, lng) => {
    const response = await axiosInstance.get('/bike-rent/zones/detect', {
      params: { lat, lng },
    });
    return unwrap(response);
  },
  getPublicSettings: async (bikeId = null) => {
    const response = await axiosInstance.get('/bike-rent/settings/public', {
      params: bikeId ? { bikeId } : undefined,
    });
    return unwrap(response).settings;
  },
  getCategories: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/categories/public', { params });
    return unwrap(response).categories || [];
  },
  getBikes: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/bikes', { params });
    return unwrapPaginated(response);
  },
  getBikeById: async (id, params = {}) => {
    const response = await axiosInstance.get(`/bike-rent/bikes/${id}`, { params });
    return unwrap(response).bike;
  },
  quote: async (body) => {
    const response = await axiosInstance.post('/bike-rent/bookings/quote', body);
    return unwrap(response);
  },
  checkAvailability: async (body) => {
    const response = await axiosInstance.post('/bike-rent/bookings/check-availability', body);
    return unwrap(response);
  },
  getBikeAvailability: async (id, params = {}) => {
    const response = await axiosInstance.get(`/bike-rent/bikes/${id}/availability`, { params });
    return unwrap(response);
  },
  requestExtension: async (id, body) => {
    const response = await axiosInstance.post(`/bike-rent/user/bookings/${id}/extend/request`, body);
    return unwrap(response);
  },
  getMyNotifications: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/user/notifications', { params });
    return unwrap(response).notifications || [];
  },
  markNotificationRead: async (id) => {
    const response = await axiosInstance.post(`/bike-rent/user/notifications/${id}/read`);
    return unwrap(response);
  },
  getAvailableCoupons: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/coupons/available', { params });
    return unwrap(response).coupons || [];
  },
  getMyBookings: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/user/bookings', { params });
    return unwrapPaginated(response);
  },
  getMyBookingById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/user/bookings/${id}`);
    return unwrap(response).booking;
  },
  getMyInvoice: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/user/bookings/${id}/invoice`);
    return unwrap(response).invoice;
  },
  createBooking: async (body) => {
    const response = await axiosInstance.post('/bike-rent/user/bookings', body);
    return unwrap(response).booking;
  },
  /** @deprecated alias */
  createDraftBooking: async (body) => bikeRentUserApi.createBooking(body),
  createRazorpayOrder: async (id) => {
    const response = await axiosInstance.post(`/bike-rent/user/bookings/${id}/pay/razorpay/order`);
    return unwrap(response);
  },
  verifyRazorpayPayment: async (id, body) => {
    const response = await axiosInstance.post(
      `/bike-rent/user/bookings/${id}/pay/razorpay/verify`,
      body,
    );
    return unwrap(response).booking;
  },
  payWithWallet: async (id) => {
    const response = await axiosInstance.post(`/bike-rent/user/bookings/${id}/pay/wallet`);
    return unwrap(response).booking;
  },
  recordPaymentFailure: async (id, reason) => {
    const response = await axiosInstance.post(`/bike-rent/user/bookings/${id}/pay/failed`, {
      reason,
    });
    return unwrap(response).booking;
  },
  cancelBooking: async (id, reason) => {
    const response = await axiosInstance.post(`/bike-rent/user/bookings/${id}/cancel`, { reason });
    return unwrap(response).booking;
  },
  previewCancellation: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/user/bookings/${id}/cancel/preview`);
    return unwrap(response).preview;
  },
  previewReturnSettlement: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/user/bookings/${id}/return/preview`);
    return unwrap(response).preview;
  },
  getWallet: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/user/wallet", { params });
    return unwrap(response);
  },
  confirmPickup: async (id, pickupCode) => {
    const response = await axiosInstance.post(`/bike-rent/user/bookings/${id}/pickup`, {
      pickupCode,
    });
    return unwrap(response).booking;
  },
  requestReturn: async (id, body) => {
    const response = await axiosInstance.post(`/bike-rent/user/bookings/${id}/return`, body);
    return unwrap(response).booking;
  },
  quoteExtension: async (id, body) => {
    const response = await axiosInstance.post(
      `/bike-rent/user/bookings/${id}/extend/quote`,
      body,
    );
    return unwrap(response);
  },
  createExtensionRazorpayOrder: async (id, body) => {
    const response = await axiosInstance.post(
      `/bike-rent/user/bookings/${id}/extend/razorpay/order`,
      body,
    );
    return unwrap(response);
  },
  extendRental: async (id, body) => {
    const response = await axiosInstance.post(`/bike-rent/user/bookings/${id}/extend`, body);
    return unwrap(response).booking;
  },
  submitReview: async (id, body) => {
    const response = await axiosInstance.post(`/bike-rent/user/bookings/${id}/review`, body);
    return unwrap(response).review;
  },
  createLateBalanceRazorpayOrder: async (id) => {
    const response = await axiosInstance.post(
      `/bike-rent/user/bookings/${id}/late-balance/razorpay/order`,
    );
    return unwrap(response);
  },
  verifyLateBalanceRazorpayPayment: async (id, body) => {
    const response = await axiosInstance.post(
      `/bike-rent/user/bookings/${id}/late-balance/razorpay/verify`,
      body,
    );
    return unwrap(response).booking;
  },
  payLateBalanceWithWallet: async (id) => {
    const response = await axiosInstance.post(
      `/bike-rent/user/bookings/${id}/late-balance/wallet`,
    );
    return unwrap(response).booking;
  },
};

export default bikeRentUserApi;
