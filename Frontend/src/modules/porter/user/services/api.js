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

export const porterUserApi = {
  getPublicVehicles: async () => {
    const response = await axiosInstance.get('/porter/vehicles/public');
    return unwrap(response).vehicles || unwrap(response).vehicleTypes || [];
  },
  getAvailableVehicles: async (body) => {
    const response = await axiosInstance.post('/porter/vehicles/available', body);
    const data = unwrap(response);
    return {
      searchRadiusKm: data.searchRadiusKm,
      vehicles: data.vehicles || [],
    };
  },
  getGoodsCatalog: async () => {
    const response = await axiosInstance.get('/porter/goods-types');
    const data = unwrap(response);
    return {
      goodsTypes: data.goodsTypes || [],
      restrictedItems: data.restrictedItems || [],
    };
  },
  quote: async (body) => {
    const response = await axiosInstance.post('/porter/quote', body);
    return unwrap(response);
  },
  createTrip: async (body) => {
    const response = await axiosInstance.post('/porter/trips', body);
    return unwrap(response).trip || unwrap(response);
  },
  listTrips: async (params = {}) => {
    const response = await axiosInstance.get('/porter/trips', { params });
    return unwrapPaginated(response);
  },
  getTrip: async (id) => {
    const response = await axiosInstance.get(`/porter/trips/${id}`);
    return unwrap(response).trip;
  },
  cancelTrip: async (id, body = {}) => {
    const response = await axiosInstance.post(`/porter/trips/${id}/cancel`, body);
    return unwrap(response).trip || unwrap(response);
  },
  payWithWallet: async (id) => {
    const response = await axiosInstance.post(`/porter/trips/${id}/pay/wallet`);
    return unwrap(response).trip || unwrap(response);
  },
  createRazorpayOrder: async (id) => {
    const response = await axiosInstance.post(`/porter/trips/${id}/pay/razorpay/order`);
    return unwrap(response);
  },
  verifyRazorpayPayment: async (id, body) => {
    const response = await axiosInstance.post(`/porter/trips/${id}/pay/razorpay/verify`, body);
    return unwrap(response).trip || unwrap(response);
  },
  requestSearch: async (id) => {
    const response = await axiosInstance.post(`/porter/trips/${id}/search`);
    return unwrap(response);
  },
  payExtraLoadingWithWallet: async (id) => {
    const response = await axiosInstance.post(`/porter/trips/${id}/pay/extra/wallet`);
    return unwrap(response).trip || unwrap(response);
  },
  getPaymentStatus: async (id) => {
    const response = await axiosInstance.get(`/porter/trips/${id}/payment-status`);
    return unwrap(response).trip;
  },
};

export const porterPartnerApi = {
  getActiveTrip: async () => {
    const response = await axiosInstance.get('/porter/partner/trips/active');
    return unwrap(response).trip || null;
  },
  listTrips: async (params = {}) => {
    const response = await axiosInstance.get('/porter/partner/trips', { params });
    return unwrap(response).trips || [];
  },
  acceptTrip: async (id) => {
    const response = await axiosInstance.post(`/porter/partner/trips/${id}/accept`);
    return unwrap(response).trip || unwrap(response);
  },
  markArrived: async (id) => {
    const response = await axiosInstance.post(`/porter/partner/trips/${id}/arrived`);
    return unwrap(response).trip || unwrap(response);
  },
  startTrip: async (id, otp) => {
    const response = await axiosInstance.post(`/porter/partner/trips/${id}/start`, { otp });
    return unwrap(response).trip || unwrap(response);
  },
  markLoaded: async (id) => {
    const response = await axiosInstance.post(`/porter/partner/trips/${id}/loaded`);
    return unwrap(response).trip || unwrap(response);
  },
  markAtDrop: async (id, body = {}) => {
    const response = await axiosInstance.post(`/porter/partner/trips/${id}/at-drop`, body);
    return unwrap(response).trip || unwrap(response);
  },
  collectCash: async (id, body = {}) => {
    const response = await axiosInstance.post(`/porter/partner/trips/${id}/collect/cash`, body);
    return unwrap(response).trip || unwrap(response);
  },
  createCollectQr: async (id, body = {}) => {
    const response = await axiosInstance.post(`/porter/partner/trips/${id}/collect/qr`, body);
    return unwrap(response);
  },
  getPaymentStatus: async (id) => {
    const response = await axiosInstance.get(`/porter/partner/trips/${id}/payment-status`);
    return unwrap(response).trip || unwrap(response);
  },
  completeTrip: async (id, body = {}) => {
    const response = await axiosInstance.post(`/porter/partner/trips/${id}/complete`, body);
    return unwrap(response).trip || unwrap(response);
  },
};
