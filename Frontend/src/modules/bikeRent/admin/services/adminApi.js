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
  };
};

const bikeRentAdminApi = {
  getDashboard: async () => {
    const response = await axiosInstance.get('/bike-rent/admin/dashboard');
    return unwrap(response).stats;
  },
  getReports: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/reports', { params });
    return unwrap(response).reports;
  },
  getWalletTransactions: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/wallet/transactions', { params });
    return unwrap(response);
  },
  getSettings: async () => {
    const response = await axiosInstance.get('/bike-rent/admin/settings');
    return unwrap(response).settings;
  },
  /** Fixed platform document-type catalog (labels for requiredDocuments keys) — public, no admin-config dependency. */
  getPublicDocumentCatalog: async () => {
    const response = await axiosInstance.get('/bike-rent/settings/public');
    return unwrap(response).settings?.documentTypes || [];
  },
  updateSettings: async (body) => {
    const response = await axiosInstance.put('/bike-rent/admin/settings', body);
    return unwrap(response).settings;
  },
  previewNoShowPolicy: async (body = {}) => {
    const response = await axiosInstance.post('/bike-rent/admin/settings/no-show/preview', body);
    return unwrap(response).preview;
  },
  getTaxSettings: async () => {
    const response = await axiosInstance.get('/bike-rent/admin/tax-settings');
    return unwrap(response).settings;
  },
  updateTaxSettings: async (body) => {
    const response = await axiosInstance.put('/bike-rent/admin/tax-settings', body);
    return unwrap(response).settings;
  },
  getSettlements: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/settlements', { params });
    return unwrapPaginated(response);
  },
  getSettlementById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/admin/settlements/${id}`);
    return unwrap(response).settlement;
  },
  getInvoiceById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/admin/invoices/${id}`);
    return unwrap(response).invoice;
  },

  // ——— Finance transactions ———
  getFinanceTransactions: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/finance/transactions', { params });
    return unwrapPaginated(response);
  },
  createFinanceAdjustment: async (body = {}) => {
    const response = await axiosInstance.post('/bike-rent/admin/finance/transactions/adjustment', body);
    return unwrap(response).transaction;
  },
  getBookingInvoice: async (bookingId) => {
    const response = await axiosInstance.get(`/bike-rent/admin/bookings/${bookingId}/invoice`);
    return unwrap(response);
  },
  getBookingSettlement: async (bookingId) => {
    const response = await axiosInstance.get(`/bike-rent/admin/bookings/${bookingId}/settlement`);
    return unwrap(response).settlement;
  },
  getBookingTransactions: async (bookingId) => {
    const response = await axiosInstance.get(`/bike-rent/admin/bookings/${bookingId}/transactions`);
    return unwrap(response).transactions || [];
  },

  // ——— Monthly vendor settlement ———
  getMonthlySettlements: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/monthly-settlements', { params });
    return unwrapPaginated(response);
  },
  getMonthlySettlementById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/admin/monthly-settlements/${id}`);
    return unwrap(response).settlement;
  },
  generateMonthlySettlements: async (body = {}) => {
    const response = await axiosInstance.post('/bike-rent/admin/monthly-settlements/generate', body);
    return unwrap(response);
  },
  approveMonthlySettlement: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/admin/monthly-settlements/${id}/approve`, body);
    return unwrap(response).settlement;
  },
  markMonthlySettlementProcessing: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/admin/monthly-settlements/${id}/processing`, body);
    return unwrap(response).settlement;
  },
  markMonthlySettlementPaid: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/admin/monthly-settlements/${id}/paid`, body);
    return unwrap(response).settlement;
  },
  markMonthlySettlementFailed: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/admin/monthly-settlements/${id}/failed`, body);
    return unwrap(response).settlement;
  },
  getFinanceOverview: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/finance/overview', { params });
    return unwrap(response).overview;
  },

  // Zones
  getZones: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/zones', { params });
    return unwrapPaginated(response);
  },
  getZoneById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/admin/zones/${id}`);
    return unwrap(response).zone;
  },
  createZone: async (body) => {
    const response = await axiosInstance.post('/bike-rent/admin/zones', body);
    return unwrap(response).zone;
  },
  updateZone: async (id, body) => {
    const response = await axiosInstance.put(`/bike-rent/admin/zones/${id}`, body);
    return unwrap(response).zone;
  },
  updateZoneStatus: async (id, status) => {
    const response = await axiosInstance.patch(`/bike-rent/admin/zones/${id}/status`, { status });
    return unwrap(response).zone;
  },
  deleteZone: async (id) => {
    const response = await axiosInstance.delete(`/bike-rent/admin/zones/${id}`);
    return unwrap(response);
  },
  getZoneDropdown: async () => {
    const response = await axiosInstance.get('/bike-rent/admin/zones/dropdown');
    return unwrap(response).zones || [];
  },

  // Hubs (multiple per zone)
  getHubsByZone: async (zoneId, params = {}) => {
    const response = await axiosInstance.get(`/bike-rent/admin/zones/${zoneId}/hubs`, { params });
    return unwrap(response).hubs || [];
  },
  getHubDropdown: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/hubs/dropdown', { params });
    return unwrap(response).hubs || [];
  },
  getHubById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/admin/hubs/${id}`);
    return unwrap(response).hub;
  },
  createHub: async (zoneId, body) => {
    const response = await axiosInstance.post(`/bike-rent/admin/zones/${zoneId}/hubs`, body);
    return unwrap(response).hub;
  },
  updateHub: async (id, body) => {
    const response = await axiosInstance.put(`/bike-rent/admin/hubs/${id}`, body);
    return unwrap(response).hub;
  },
  updateHubStatus: async (id, status) => {
    const response = await axiosInstance.patch(`/bike-rent/admin/hubs/${id}/status`, { status });
    return unwrap(response).hub;
  },
  deleteHub: async (id) => {
    const response = await axiosInstance.delete(`/bike-rent/admin/hubs/${id}`);
    return unwrap(response);
  },

  // Categories
  getCategories: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/categories', { params });
    return unwrapPaginated(response);
  },
  createCategory: async (body) => {
    const response = await axiosInstance.post('/bike-rent/admin/categories', body);
    return unwrap(response).category;
  },
  updateCategory: async (id, body) => {
    const response = await axiosInstance.put(`/bike-rent/admin/categories/${id}`, body);
    return unwrap(response).category;
  },
  updateCategoryStatus: async (id, status) => {
    const response = await axiosInstance.patch(`/bike-rent/admin/categories/${id}/status`, { status });
    return unwrap(response).category;
  },
  deleteCategory: async (id) => {
    const response = await axiosInstance.delete(`/bike-rent/admin/categories/${id}`);
    return unwrap(response);
  },
  getCategoryDropdown: async () => {
    const response = await axiosInstance.get('/bike-rent/admin/categories/dropdown');
    return unwrap(response).categories || [];
  },

  // Bikes
  getBikes: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/bikes', { params });
    return unwrapPaginated(response);
  },
  getBikeById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/admin/bikes/${id}`);
    return unwrap(response).bike;
  },
  createBike: async (body) => {
    const response = await axiosInstance.post('/bike-rent/admin/bikes', body);
    return unwrap(response).bike;
  },
  updateBike: async (id, body) => {
    const response = await axiosInstance.put(`/bike-rent/admin/bikes/${id}`, body);
    return unwrap(response).bike;
  },
  updateBikeStatus: async (id, body) => {
    const response = await axiosInstance.patch(`/bike-rent/admin/bikes/${id}/status`, body);
    return unwrap(response).bike;
  },
  deleteBike: async (id) => {
    const response = await axiosInstance.delete(`/bike-rent/admin/bikes/${id}`);
    return unwrap(response);
  },
  getBikeDropdown: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/bikes/dropdown', { params });
    return unwrap(response).bikes || [];
  },

  // Pricing
  getPricing: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/pricing', { params });
    return unwrapPaginated(response);
  },
  createPricing: async (body) => {
    const response = await axiosInstance.post('/bike-rent/admin/pricing', body);
    return unwrap(response).pricing;
  },
  updatePricing: async (id, body) => {
    const response = await axiosInstance.put(`/bike-rent/admin/pricing/${id}`, body);
    return unwrap(response).pricing;
  },
  updatePricingStatus: async (id, status) => {
    const response = await axiosInstance.patch(`/bike-rent/admin/pricing/${id}/status`, { status });
    return unwrap(response).pricing;
  },
  deletePricing: async (id) => {
    const response = await axiosInstance.delete(`/bike-rent/admin/pricing/${id}`);
    return unwrap(response);
  },

  // Bookings
  getBookings: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/bookings', { params });
    return unwrapPaginated(response);
  },
  getBookingById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/admin/bookings/${id}`);
    return unwrap(response).booking;
  },
  updateBookingStatus: async (id, body) => {
    const response = await axiosInstance.patch(`/bike-rent/admin/bookings/${id}/status`, body);
    return unwrap(response).booking;
  },
  approveBooking: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/admin/bookings/${id}/approve`, body);
    return unwrap(response).booking;
  },
  rejectBooking: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/admin/bookings/${id}/reject`, body);
    return unwrap(response).booking;
  },
  collectDeposit: async (id, body = {}) => {
    const response = await axiosInstance.post(
      `/bike-rent/admin/bookings/${id}/collect-deposit`,
      body,
    );
    return unwrap(response).booking;
  },
  startRide: async (id, body) => {
    const response = await axiosInstance.post(`/bike-rent/admin/bookings/${id}/start-ride`, body);
    return unwrap(response).booking;
  },
  inspectBooking: async (id, body) => {
    const response = await axiosInstance.post(`/bike-rent/admin/bookings/${id}/inspect`, body);
    return unwrap(response).booking;
  },
  previewLateCharges: async (id, body = {}) => {
    const response = await axiosInstance.post(
      `/bike-rent/admin/bookings/${id}/late-charges/preview`,
      body,
    );
    return unwrap(response).preview;
  },
  collectLateBalance: async (id, body = {}) => {
    const response = await axiosInstance.post(
      `/bike-rent/admin/bookings/${id}/late-balance/collect`,
      body,
    );
    return unwrap(response).booking;
  },
  releaseDepositRefund: async (id, body = {}) => {
    const response = await axiosInstance.post(
      `/bike-rent/admin/bookings/${id}/deposit-refund/release`,
      body,
    );
    return unwrap(response).booking;
  },
  resolveExtension: async (id, body = {}) => {
    const response = await axiosInstance.post(
      `/bike-rent/admin/bookings/${id}/extension/resolve`,
      body,
    );
    return unwrap(response).booking;
  },
  reassignBooking: async (id, body = {}) => {
    const response = await axiosInstance.post(
      `/bike-rent/admin/bookings/${id}/reassign`,
      body,
    );
    return unwrap(response).booking;
  },
  overrideNoShow: async (id, body = {}) => {
    const response = await axiosInstance.post(
      `/bike-rent/admin/bookings/${id}/no-show/override`,
      body,
    );
    return unwrap(response).booking;
  },
  getBikeAvailability: async (id, params = {}) => {
    const response = await axiosInstance.get(`/bike-rent/bikes/${id}/availability`, { params });
    return unwrap(response);
  },
  getBookingInspections: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/admin/bookings/${id}/inspections`);
    return unwrap(response);
  },
  getInspections: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/inspections', { params });
    return unwrapPaginated(response);
  },
  getInspectionById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/admin/inspections/${id}`);
    return unwrap(response).inspection;
  },

  // Customers
  getCustomers: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/customers', { params });
    return unwrapPaginated(response);
  },
  getCustomerById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/admin/customers/${id}`);
    return unwrap(response).customer;
  },

  // Vendor join requests
  getVendorRequests: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/vendors/requests', { params });
    return unwrap(response);
  },
  getVendorRequestById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/admin/vendors/requests/${id}`);
    return unwrap(response).vendor;
  },
  approveVendorRequest: async (id) => {
    const response = await axiosInstance.post(`/bike-rent/admin/vendors/requests/${id}/approve`);
    return unwrap(response).vendor;
  },
  rejectVendorRequest: async (id, reason) => {
    const response = await axiosInstance.post(`/bike-rent/admin/vendors/requests/${id}/reject`, {
      reason,
    });
    return unwrap(response).vendor;
  },
  updateVendor: async (id, body) => {
    const response = await axiosInstance.put(`/bike-rent/admin/vendors/requests/${id}`, body);
    return unwrap(response).vendor;
  },

  // Vendor withdrawals
  getVendorWithdrawals: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/vendors/withdrawals', { params });
    return unwrapPaginated(response);
  },
  approveVendorWithdrawal: async (id, body = {}) => {
    const response = await axiosInstance.post(`/bike-rent/admin/vendors/withdrawals/${id}/approve`, body);
    return unwrap(response).withdrawal;
  },
  rejectVendorWithdrawal: async (id, reason) => {
    const response = await axiosInstance.post(`/bike-rent/admin/vendors/withdrawals/${id}/reject`, { reason });
    return unwrap(response).withdrawal;
  },

  // Category approvals (vendor-submitted)
  getPendingCategories: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/categories/pending', { params });
    return unwrapPaginated(response);
  },
  approveCategory: async (id) => {
    const response = await axiosInstance.post(`/bike-rent/admin/categories/${id}/approve`);
    return unwrap(response).category;
  },
  rejectCategory: async (id, reason) => {
    const response = await axiosInstance.post(`/bike-rent/admin/categories/${id}/reject`, { reason });
    return unwrap(response).category;
  },

  // Coupon approvals (vendor-submitted)
  getPendingCoupons: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/coupons/pending', { params });
    return unwrapPaginated(response);
  },
  approveCoupon: async (id) => {
    const response = await axiosInstance.post(`/bike-rent/admin/coupons/${id}/approve`);
    return unwrap(response).coupon;
  },
  rejectCoupon: async (id, reason) => {
    const response = await axiosInstance.post(`/bike-rent/admin/coupons/${id}/reject`, { reason });
    return unwrap(response).coupon;
  },

  // Bike approvals (vendor-submitted)
  getPendingBikes: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/bikes/pending', { params });
    return unwrapPaginated(response);
  },
  approveBike: async (id) => {
    const response = await axiosInstance.post(`/bike-rent/admin/bikes/${id}/approve`);
    return unwrap(response).bike;
  },
  rejectBike: async (id, reason) => {
    const response = await axiosInstance.post(`/bike-rent/admin/bikes/${id}/reject`, { reason });
    return unwrap(response).bike;
  },

  // Coupons (Bike Rental only)
  getCoupons: async (params = {}) => {
    const response = await axiosInstance.get('/bike-rent/admin/coupons', { params });
    return unwrapPaginated(response);
  },
  getCouponSummary: async () => {
    const response = await axiosInstance.get('/bike-rent/admin/coupons/summary');
    return unwrap(response).summary;
  },
  getCouponById: async (id) => {
    const response = await axiosInstance.get(`/bike-rent/admin/coupons/${id}`);
    return unwrap(response).coupon;
  },
  getCouponUsage: async (id, params = {}) => {
    const response = await axiosInstance.get(`/bike-rent/admin/coupons/${id}/usage`, { params });
    return unwrapPaginated(response);
  },
  createCoupon: async (body) => {
    const response = await axiosInstance.post('/bike-rent/admin/coupons', body);
    return unwrap(response).coupon;
  },
  updateCoupon: async (id, body) => {
    const response = await axiosInstance.put(`/bike-rent/admin/coupons/${id}`, body);
    return unwrap(response).coupon;
  },
  updateCouponStatus: async (id, status) => {
    const response = await axiosInstance.patch(`/bike-rent/admin/coupons/${id}/status`, { status });
    return unwrap(response).coupon;
  },
  deleteCoupon: async (id) => {
    const response = await axiosInstance.delete(`/bike-rent/admin/coupons/${id}`);
    return unwrap(response);
  },
};

export default bikeRentAdminApi;
