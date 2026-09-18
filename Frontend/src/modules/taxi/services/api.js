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

export const taxiAdminApi = {
  getZones: async (params = {}) => {
    const response = await axiosInstance.get('/taxi/admin/zones', { params });
    return unwrapPaginated(response);
  },
  getZoneById: async (id) => {
    const response = await axiosInstance.get(`/taxi/admin/zones/${id}`);
    return unwrap(response).zone;
  },
  createZone: async (body) => {
    const response = await axiosInstance.post('/taxi/admin/zones', body);
    return unwrap(response).zone;
  },
  updateZone: async (id, body) => {
    const response = await axiosInstance.put(`/taxi/admin/zones/${id}`, body);
    return unwrap(response).zone;
  },
  updateZoneStatus: async (id, status) => {
    const response = await axiosInstance.patch(`/taxi/admin/zones/${id}/status`, { status });
    return unwrap(response).zone;
  },
  deleteZone: async (id) => {
    const response = await axiosInstance.delete(`/taxi/admin/zones/${id}`);
    return unwrap(response);
  },
  getZoneDropdown: async () => {
    const response = await axiosInstance.get('/taxi/admin/zones/dropdown');
    return unwrap(response).zones || [];
  },

  getVehicleTypes: async (params = {}) => {
    const response = await axiosInstance.get('/taxi/admin/vehicle-types', { params });
    return unwrapPaginated(response);
  },
  createVehicleType: async (body) => {
    const response = await axiosInstance.post('/taxi/admin/vehicle-types', body);
    return unwrap(response).vehicleType;
  },
  updateVehicleType: async (id, body) => {
    const response = await axiosInstance.put(`/taxi/admin/vehicle-types/${id}`, body);
    return unwrap(response).vehicleType;
  },
  updateVehicleTypeStatus: async (id, status) => {
    const response = await axiosInstance.patch(`/taxi/admin/vehicle-types/${id}/status`, { status });
    return unwrap(response).vehicleType;
  },
  deleteVehicleType: async (id) => {
    const response = await axiosInstance.delete(`/taxi/admin/vehicle-types/${id}`);
    return unwrap(response);
  },

  getPricing: async (params = {}) => {
    const response = await axiosInstance.get('/taxi/admin/pricing', { params });
    return unwrapPaginated(response);
  },
  createPricing: async (body) => {
    const response = await axiosInstance.post('/taxi/admin/pricing', body);
    return unwrap(response).pricing;
  },
  updatePricing: async (id, body) => {
    const response = await axiosInstance.put(`/taxi/admin/pricing/${id}`, body);
    return unwrap(response).pricing;
  },
  updatePricingStatus: async (id, status) => {
    const response = await axiosInstance.patch(`/taxi/admin/pricing/${id}/status`, { status });
    return unwrap(response).pricing;
  },
  deletePricing: async (id) => {
    const response = await axiosInstance.delete(`/taxi/admin/pricing/${id}`);
    return unwrap(response);
  },
  saveZonePricingMatrix: async (body) => {
    const response = await axiosInstance.post('/taxi/admin/pricing/zone-matrix', body);
    return unwrap(response);
  },
  deleteZonePricingMatrix: async (zoneId) => {
    const id = zoneId || 'global';
    const response = await axiosInstance.delete(`/taxi/admin/pricing/zone-matrix/${id}`);
    return unwrap(response);
  },

  getSurgeSlots: async (params = {}) => {
    const response = await axiosInstance.get('/taxi/admin/surge-slots', { params });
    return unwrapPaginated(response);
  },
  createSurgeSlot: async (body) => {
    const response = await axiosInstance.post('/taxi/admin/surge-slots', body);
    return unwrap(response).surgeSlot;
  },
  updateSurgeSlot: async (id, body) => {
    const response = await axiosInstance.put(`/taxi/admin/surge-slots/${id}`, body);
    return unwrap(response).surgeSlot;
  },
  updateSurgeSlotStatus: async (id, body) => {
    const response = await axiosInstance.patch(`/taxi/admin/surge-slots/${id}/status`, body);
    return unwrap(response).surgeSlot;
  },
  deleteSurgeSlot: async (id) => {
    const response = await axiosInstance.delete(`/taxi/admin/surge-slots/${id}`);
    return unwrap(response);
  },

  getCoupons: async (params = {}) => {
    const response = await axiosInstance.get('/taxi/admin/coupons', { params });
    return unwrapPaginated(response);
  },
  getCouponSummary: async () => {
    const response = await axiosInstance.get('/taxi/admin/coupons/summary');
    return unwrap(response).summary || unwrap(response);
  },
  getCouponById: async (id) => {
    const response = await axiosInstance.get(`/taxi/admin/coupons/${id}`);
    return unwrap(response).coupon;
  },
  createCoupon: async (body) => {
    const response = await axiosInstance.post('/taxi/admin/coupons', body);
    return unwrap(response).coupon;
  },
  updateCoupon: async (id, body) => {
    const response = await axiosInstance.put(`/taxi/admin/coupons/${id}`, body);
    return unwrap(response).coupon;
  },
  updateCouponStatus: async (id, status) => {
    const response = await axiosInstance.patch(`/taxi/admin/coupons/${id}/status`, { status });
    return unwrap(response).coupon;
  },
  deleteCoupon: async (id) => {
    const response = await axiosInstance.delete(`/taxi/admin/coupons/${id}`);
    return unwrap(response);
  },

  getRides: async (params = {}) => {
    const response = await axiosInstance.get('/taxi/admin/rides', { params });
    return unwrapPaginated(response);
  },
  getRideById: async (id) => {
    const response = await axiosInstance.get(`/taxi/admin/rides/${id}`);
    return unwrap(response).ride;
  },

  getDashboard: async () => {
    const response = await axiosInstance.get('/taxi/admin/dashboard');
    return unwrap(response);
  },
  getDrivers: async (params = {}) => {
    const response = await axiosInstance.get('/taxi/admin/drivers', { params });
    return unwrapPaginated(response);
  },
  getDriverById: async (id) => {
    const response = await axiosInstance.get(`/taxi/admin/drivers/${id}`);
    return unwrap(response).driver;
  },
  updateDriverStatus: async (id, status) => {
    const response = await axiosInstance.patch(`/taxi/admin/drivers/${id}/status`, { status });
    return unwrap(response).driver;
  },
  getCustomers: async (params = {}) => {
    const response = await axiosInstance.get('/taxi/admin/customers', { params });
    return unwrapPaginated(response);
  },
  getFleet: async (params = {}) => {
    const response = await axiosInstance.get('/taxi/admin/fleet', { params });
    return unwrapPaginated(response);
  },
  getVehicleTypeDropdown: async () => {
    const response = await axiosInstance.get('/taxi/admin/vehicle-types/dropdown');
    return unwrap(response).vehicleTypes || [];
  },

  getSettings: async () => {
    const response = await axiosInstance.get('/taxi/admin/settings');
    return unwrap(response).settings || unwrap(response);
  },
  updateSettings: async (body) => {
    const response = await axiosInstance.put('/taxi/admin/settings', body);
    return unwrap(response).settings || unwrap(response);
  },
  getCashLimit: async () => {
    const response = await axiosInstance.get('/taxi/admin/cash-limit');
    return unwrap(response).settings || unwrap(response);
  },
  updateCashLimit: async (body) => {
    const response = await axiosInstance.put('/taxi/admin/cash-limit', body);
    return unwrap(response).settings || unwrap(response);
  },
};

export const taxiUserApi = {
  getPublicVehicleTypes: async () => {
    const response = await axiosInstance.get('/taxi/vehicle-types/public');
    return unwrap(response).vehicleTypes || [];
  },
  quote: async (body) => {
    const response = await axiosInstance.post('/taxi/quote', body);
    return unwrap(response).quote || unwrap(response);
  },
  listAvailableCoupons: async (params = {}) => {
    const response = await axiosInstance.get('/taxi/coupons/available', { params });
    return unwrap(response).coupons || [];
  },
  previewCoupon: async (body) => {
    const response = await axiosInstance.post('/taxi/coupons/preview', body);
    return unwrap(response).preview || unwrap(response);
  },
  createRide: async (body) => {
    const response = await axiosInstance.post('/taxi/rides', body);
    return unwrap(response).ride || unwrap(response);
  },
  listRides: async (params = {}) => {
    const response = await axiosInstance.get('/taxi/rides', { params });
    return unwrapPaginated(response);
  },
  getRide: async (id) => {
    const response = await axiosInstance.get(`/taxi/rides/${id}`);
    return unwrap(response).ride;
  },
  getActiveRide: async () => {
    const response = await axiosInstance.get('/taxi/rides/active');
    return unwrap(response).ride || null;
  },
  cancelRide: async (id, body = {}) => {
    const response = await axiosInstance.post(`/taxi/rides/${id}/cancel`, body);
    return unwrap(response).ride || unwrap(response);
  },
  payWithWallet: async (id) => {
    const response = await axiosInstance.post(`/taxi/rides/${id}/pay/wallet`);
    return unwrap(response).ride || unwrap(response);
  },
  createRazorpayOrder: async (id) => {
    const response = await axiosInstance.post(`/taxi/rides/${id}/pay/razorpay/order`);
    return unwrap(response);
  },
  verifyRazorpayPayment: async (id, body) => {
    const response = await axiosInstance.post(`/taxi/rides/${id}/pay/razorpay/verify`, body);
    return unwrap(response).ride || unwrap(response);
  },
  getPaymentStatus: async (id) => {
    const response = await axiosInstance.get(`/taxi/rides/${id}/payment-status`);
    return unwrap(response).ride || unwrap(response);
  },
};

export const taxiPartnerApi = {
  getActiveRide: async () => {
    const response = await axiosInstance.get(`/taxi/partner/rides/active`);
    const data = unwrap(response);
    return data?.ride || null;
  },
  listRides: async (params = {}) => {
    const response = await axiosInstance.get('/taxi/partner/rides', { params });
    return unwrap(response).rides || [];
  },
  acceptRide: async (id) => {
    const response = await axiosInstance.post(`/taxi/partner/rides/${id}/accept`);
    return unwrap(response).ride || unwrap(response);
  },
  markArrived: async (id) => {
    const response = await axiosInstance.post(`/taxi/partner/rides/${id}/arrived`);
    return unwrap(response).ride || unwrap(response);
  },
  startRide: async (id, otp) => {
    const response = await axiosInstance.post(`/taxi/partner/rides/${id}/start`, { otp });
    return unwrap(response).ride || unwrap(response);
  },
  reachDrop: async (id, body = {}) => {
    const response = await axiosInstance.post(`/taxi/partner/rides/${id}/reach-drop`, body);
    return unwrap(response).ride || unwrap(response);
  },
  createCollectQr: async (id) => {
    const response = await axiosInstance.post(`/taxi/partner/rides/${id}/collect/qr`);
    return unwrap(response);
  },
  collectCash: async (id) => {
    const response = await axiosInstance.post(`/taxi/partner/rides/${id}/collect/cash`);
    return unwrap(response).ride || unwrap(response);
  },
  getPaymentStatus: async (id) => {
    const response = await axiosInstance.get(`/taxi/partner/rides/${id}/payment-status`);
    return unwrap(response).ride || unwrap(response);
  },
  completeRide: async (id, body = {}) => {
    const response = await axiosInstance.post(`/taxi/partner/rides/${id}/complete`, body);
    return unwrap(response).ride || unwrap(response);
  },
};
