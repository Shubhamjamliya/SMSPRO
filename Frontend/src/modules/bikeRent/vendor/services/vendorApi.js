import axiosInstance from "@core/api/axios";

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
  };
};

export const bikeVendorApi = {
  requestOtp: async (phone) => {
    const response = await axiosInstance.post("/bike-rent/vendor/auth/request-otp", { phone });
    return unwrap(response);
  },

  verifyOtp: async ({ phone, otp, fcmToken }) => {
    const response = await axiosInstance.post("/bike-rent/vendor/auth/verify-otp", {
      phone,
      otp,
      fcmToken,
    });
    return unwrap(response);
  },

  register: async (payload) => {
    const response = await axiosInstance.post("/bike-rent/vendor/register", payload);
    return unwrap(response);
  },

  resubmit: async (payload) => {
    const response = await axiosInstance.post(
      "/bike-rent/vendor/register/authenticated",
      payload,
    );
    return unwrap(response);
  },

  getMe: async () => {
    const response = await axiosInstance.get("/bike-rent/vendor/me");
    return unwrap(response).vendor;
  },

  uploadImage: async (file, folder = "bike-rent/vendors") => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);
    const response = await axiosInstance.post("/uploads/image", formData);
    return unwrap(response)?.url || unwrap(response)?.data?.url;
  },

  // ——— Dashboard ———
  getDashboard: async () => {
    const response = await axiosInstance.get("/bike-rent/vendor/dashboard");
    return unwrap(response).stats;
  },

  getReports: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/vendor/reports", { params });
    return unwrap(response).reports;
  },

  // ——— Zones / categories (shared, read-only for vendor) ———
  getPublicZones: async () => {
    const response = await axiosInstance.get("/bike-rent/zones/public");
    return unwrap(response)?.zones || unwrap(response) || [];
  },

  getPublicSettings: async () => {
    const response = await axiosInstance.get("/bike-rent/settings/public");
    return unwrap(response).settings || {};
  },

  // ——— Settings (vendor's own policy overrides) ———
  getSettings: async () => {
    const response = await axiosInstance.get("/bike-rent/vendor/settings");
    return unwrap(response);
  },

  updateSettings: async (body) => {
    const response = await axiosInstance.put("/bike-rent/vendor/settings", body);
    return unwrap(response);
  },

  getTaxProfile: async () => {
    const response = await axiosInstance.get("/bike-rent/vendor/tax-profile");
    return unwrap(response).profile;
  },

  updateTaxProfile: async (body) => {
    const response = await axiosInstance.put("/bike-rent/vendor/tax-profile", body);
    return unwrap(response).profile;
  },

  getSettlements: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/vendor/settlements", { params });
    return unwrapPaginated(response);
  },

  getSettlementById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/vendor/settlements/${id}`);
    return unwrap(response).settlement;
  },

  getInvoiceByBooking: async (bookingId) => {
    const response = await axiosInstance.get(`/bike-rent/vendor/bookings/${bookingId}/invoice`);
    return unwrap(response);
  },

  // ——— Finance transactions ———
  getFinanceTransactions: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/vendor/finance/transactions', { params });
    return unwrapPaginated(response);
  },
  getBookingTransactions: async (bookingId) => {
    const response = await axiosInstance.get(`/bike-rent/vendor/bookings/${bookingId}/transactions`);
    return unwrap(response).transactions || [];
  },
  getBookingSettlement: async (bookingId) => {
    const response = await axiosInstance.get(`/bike-rent/vendor/bookings/${bookingId}/settlement`);
    return unwrap(response).settlement;
  },

  // ——— Monthly settlement (own payout history) ———
  getMonthlySettlements: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/vendor/monthly-settlements', { params });
    return unwrapPaginated(response);
  },
  getMonthlySettlementById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/vendor/monthly-settlements/${id}`);
    return unwrap(response).settlement;
  },

  getCategoryDropdown: async () => {
    const response = await axiosInstance.get("/bike-rent/vendor/categories/dropdown");
    return unwrap(response).categories || [];
  },

  getCategories: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/vendor/categories", { params });
    return unwrapPaginated(response);
  },

  createCategory: async (body) => {
    const response = await axiosInstance.post("/bike-rent/vendor/categories", body);
    return unwrap(response).category;
  },

  resubmitCategory: async (id, body) => {
    const response = await axiosInstance.put(`/bike-rent/vendor/categories/${id}/resubmit`, body);
    return unwrap(response).category;
  },

  // ——— Coupons (own only, admin-approval workflow) ———
  getCoupons: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/vendor/coupons", { params });
    return unwrapPaginated(response);
  },

  getCouponById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/vendor/coupons/${id}`);
    return unwrap(response).coupon;
  },

  createCoupon: async (body) => {
    const response = await axiosInstance.post("/bike-rent/vendor/coupons", body);
    return unwrap(response).coupon;
  },

  resubmitCoupon: async (id, body) => {
    const response = await axiosInstance.put(`/bike-rent/vendor/coupons/${id}/resubmit`, body);
    return unwrap(response).coupon;
  },

  // ——— Zones (full CRUD — view all, mutate own only) ———
  getZones: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/vendor/zones", { params });
    return unwrapPaginated(response);
  },

  getZoneById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/vendor/zones/${id}`);
    return unwrap(response).zone;
  },

  createZone: async (body) => {
    const response = await axiosInstance.post("/bike-rent/vendor/zones", body);
    return unwrap(response).zone;
  },

  updateZone: async (id, body) => {
    const response = await axiosInstance.put(`/bike-rent/vendor/zones/${id}`, body);
    return unwrap(response).zone;
  },

  updateZoneStatus: async (id, body) => {
    const response = await axiosInstance.patch(`/bike-rent/vendor/zones/${id}/status`, body);
    return unwrap(response).zone;
  },

  deleteZone: async (id) => {
    const response = await axiosInstance.delete(`/bike-rent/vendor/zones/${id}`);
    return unwrap(response);
  },

  // ——— Notifications ———
  getNotifications: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/vendor/notifications", { params });
    return unwrap(response).notifications || [];
  },

  markNotificationRead: async (id) => {
    const response = await axiosInstance.post(`/bike-rent/vendor/notifications/${id}/read`);
    return unwrap(response);
  },

  // ——— Hubs ———
  getAllHubs: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/vendor/hubs", { params });
    return unwrap(response).hubs || [];
  },

  getHubsByZone: async (zoneId, params = {}) => {
    const response = await axiosInstance.get(`/bike-rent/vendor/zones/${zoneId}/hubs`, { params });
    return unwrap(response).hubs || [];
  },

  getHubDropdown: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/vendor/hubs/dropdown", { params });
    return unwrap(response).hubs || [];
  },

  createHub: async (zoneId, body) => {
    const response = await axiosInstance.post(`/bike-rent/vendor/zones/${zoneId}/hubs`, body);
    return unwrap(response).hub;
  },

  updateHub: async (id, body) => {
    const response = await axiosInstance.put(`/bike-rent/vendor/hubs/${id}`, body);
    return unwrap(response).hub;
  },

  updateHubStatus: async (id, body) => {
    const response = await axiosInstance.patch(`/bike-rent/vendor/hubs/${id}/status`, body);
    return unwrap(response).hub;
  },

  deleteHub: async (id) => {
    const response = await axiosInstance.delete(`/bike-rent/vendor/hubs/${id}`);
    return unwrap(response);
  },

  // ——— Bikes ———
  getBikes: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/vendor/bikes", { params });
    return unwrapPaginated(response);
  },

  getBikeDropdown: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/vendor/bikes/dropdown", { params });
    return unwrap(response).bikes || [];
  },

  getBikeAvailability: async (id, params = {}) => {
    const response = await axiosInstance.get(`/bike-rent/bikes/${id}/availability`, { params });
    return unwrap(response);
  },

  getInspections: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/vendor/inspections", { params });
    return unwrapPaginated(response);
  },

  getBikeById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/vendor/bikes/${id}`);
    return unwrap(response).bike;
  },

  createBike: async (body) => {
    const response = await axiosInstance.post("/bike-rent/vendor/bikes", body);
    return unwrap(response).bike;
  },

  updateBike: async (id, body) => {
    const response = await axiosInstance.put(`/bike-rent/vendor/bikes/${id}`, body);
    return unwrap(response).bike;
  },

  updateBikeStatus: async (id, body) => {
    const response = await axiosInstance.patch(`/bike-rent/vendor/bikes/${id}/status`, body);
    return unwrap(response).bike;
  },

  resubmitBike: async (id, body) => {
    const response = await axiosInstance.put(`/bike-rent/vendor/bikes/${id}/resubmit`, body);
    return unwrap(response).bike;
  },

  deleteBike: async (id) => {
    const response = await axiosInstance.delete(`/bike-rent/vendor/bikes/${id}`);
    return unwrap(response);
  },

  // ——— Bookings ———
  getBookings: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/vendor/bookings", { params });
    return unwrapPaginated(response);
  },

  getBookingById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/vendor/bookings/${id}`);
    return unwrap(response).booking;
  },

  approveBooking: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/vendor/bookings/${id}/approve`, body);
    return unwrap(response).booking;
  },

  rejectBooking: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/vendor/bookings/${id}/reject`, body);
    return unwrap(response).booking;
  },

  startRide: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/vendor/bookings/${id}/start-ride`, body);
    return unwrap(response).booking;
  },

  collectDeposit: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/vendor/bookings/${id}/collect-deposit`, body);
    return unwrap(response).booking;
  },

  inspectBooking: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/vendor/bookings/${id}/inspect`, body);
    return unwrap(response).booking;
  },

  collectLateBalance: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/vendor/bookings/${id}/late-balance/collect`, body);
    return unwrap(response).booking;
  },

  previewLateCharges: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/vendor/bookings/${id}/late-charges/preview`, body);
    return unwrap(response).preview;
  },

  previewCancellation: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/vendor/bookings/${id}/cancel/preview`);
    return unwrap(response).preview;
  },

  cancelBooking: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/vendor/bookings/${id}/cancel`, body);
    return unwrap(response).booking;
  },

  markNoShow: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/vendor/bookings/${id}/no-show`, body);
    return unwrap(response).booking;
  },

  overrideNoShow: async (id, body = {}) => {
    const response = await axiosInstance.post(
      `/bike-rent/vendor/bookings/${id}/no-show/override`,
      body,
    );
    return unwrap(response).booking;
  },

  releaseDepositRefund: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/vendor/bookings/${id}/deposit-refund/release`, body);
    return unwrap(response).booking;
  },

  resolveExtension: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/vendor/bookings/${id}/extension/resolve`, body);
    return unwrap(response).booking;
  },

  reassignBooking: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/vendor/bookings/${id}/reassign`, body);
    return unwrap(response).booking;
  },

  getBookingInspections: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/vendor/bookings/${id}/inspections`);
    return unwrap(response);
  },

  // ——— Wallet ———
  getWallet: async () => {
    const response = await axiosInstance.get("/bike-rent/vendor/wallet");
    return unwrap(response).wallet;
  },

  getEarnings: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/vendor/wallet/earnings", { params });
    return unwrapPaginated(response);
  },

  getWithdrawals: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/vendor/wallet/withdrawals", { params });
    return unwrapPaginated(response);
  },

  requestWithdrawal: async (body) => {
    const response = await axiosInstance.post("/bike-rent/vendor/wallet/withdraw", body);
    return unwrap(response).withdrawal;
  },

  getRefunds: async (params = {}) => {
    const response = await axiosInstance.get("/bike-rent/vendor/wallet/refunds", { params });
    return unwrapPaginated(response);
  },
};

export default bikeVendorApi;
