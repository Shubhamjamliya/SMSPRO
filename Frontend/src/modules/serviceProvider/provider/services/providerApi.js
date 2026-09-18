import axiosInstance from '@core/api/axios';

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

const serviceProviderApi = {
  requestOtp: async (phone) => {
    const response = await axiosInstance.post('/service-provider/auth/request-otp', { phone });
    return unwrap(response);
  },
  verifyOtp: async ({ phone, otp, fcmToken }) => {
    const response = await axiosInstance.post('/service-provider/auth/verify-otp', { phone, otp, fcmToken });
    return unwrap(response);
  },
  getMe: async () => {
    const response = await axiosInstance.get('/service-provider/me');
    return unwrap(response);
  },
  submitOnboarding: async (payload) => {
    const response = await axiosInstance.post('/service-provider/onboarding/submit', payload);
    return unwrap(response);
  },
  getOnboardingZones: async () => {
    const response = await axiosInstance.get('/service-provider/onboarding/zones');
    return unwrap(response).zones || [];
  },
  getOnboardingCategories: async () => {
    const response = await axiosInstance.get('/service-provider/onboarding/categories');
    return unwrap(response).categories || [];
  },
  getOnboardingServices: async (zoneId) => {
    const response = await axiosInstance.get('/service-provider/onboarding/services', { params: { zoneId } });
    return unwrap(response).services || [];
  },
  getDashboard: async () => {
    const response = await axiosInstance.get('/service-provider/dashboard');
    return unwrap(response);
  },
  getCategoryCatalog: async () => {
    const response = await axiosInstance.get('/service-provider/categories/catalog', { params: { status: 'active' } });
    return unwrap(response).categories || [];
  },
  getServiceCatalog: async () => {
    // No status filter (unchanged from before): a provider who already offers a
    // service the admin later deactivated must still see + be able to unselect
    // it here, or "Save services" would reject the whole payload with no way
    // to fix it from the UI.
    const response = await axiosInstance.get('/service-provider/services/catalog');
    return unwrap(response).services || [];
  },
  getZoneCatalog: async () => {
    const response = await axiosInstance.get('/service-provider/zones/catalog');
    return unwrap(response).zones || [];
  },
  getSelectableZones: async () => {
    const response = await axiosInstance.get('/service-provider/zones/selectable');
    return unwrap(response).zones || [];
  },
  getCustomerServices: async (params = {}) => {
    const response = await axiosInstance.get('/service-provider/public/services', { params });
    return unwrap(response);
  },
  detectCustomerZone: async (params = {}) => {
    const response = await axiosInstance.get('/service-provider/public/zones/detect', { params });
    return unwrap(response);
  },
  // ---------- Customer: booking request funnel ----------
  getZoneSlots: async ({ serviceId, zoneId, date }) => {
    const response = await axiosInstance.get('/service-provider/public/availability/zone-slots', {
      params: { serviceId, zoneId, date },
    });
    return unwrap(response);
  },
  getEligibleProviders: async ({ serviceId, date, startTime, lat, lng }) => {
    const response = await axiosInstance.get('/service-provider/public/providers', {
      params: { serviceId, date, startTime, lat, lng },
    });
    return unwrap(response);
  },
  createBookingRequest: async (body) => {
    const response = await axiosInstance.post('/service-provider/bookings', body);
    return unwrap(response).booking;
  },
  getMyBookings: async () => {
    const response = await axiosInstance.get('/service-provider/bookings/mine');
    return unwrap(response).bookings || [];
  },
  getBookingDetail: async (id) => {
    const response = await axiosInstance.get(`/service-provider/bookings/${id}`);
    return unwrap(response).booking;
  },
  previewCancellation: async (id) => {
    const response = await axiosInstance.get(`/service-provider/bookings/${id}/cancel-preview`);
    return unwrap(response);
  },
  cancelMyBooking: async (id, reason) => {
    const response = await axiosInstance.patch(`/service-provider/bookings/${id}/cancel`, { reason });
    return unwrap(response).booking;
  },
  confirmCompletion: async (id) => {
    const response = await axiosInstance.post(`/service-provider/bookings/${id}/confirm-completion`, {});
    return unwrap(response).booking;
  },
  respondToExtraCharge: async (id, chargeId, approve) => {
    const response = await axiosInstance.post(`/service-provider/bookings/${id}/extra-charge/${chargeId}/respond`, { approve });
    return unwrap(response).booking;
  },
  submitRating: async (id, { stars, comment }) => {
    const response = await axiosInstance.post(`/service-provider/bookings/${id}/rating`, { stars, comment });
    return unwrap(response).booking;
  },
  payForBooking: async (id, paymentMethod) => {
    const response = await axiosInstance.post(`/service-provider/bookings/${id}/pay`, { paymentMethod });
    const data = unwrap(response);
    return { booking: data.booking, razorpay: data.razorpay || null };
  },
  verifyBookingPayment: async (id, body) => {
    const response = await axiosInstance.post(`/service-provider/bookings/${id}/verify-payment`, body);
    return unwrap(response).booking;
  },
  markBookingPaymentFailed: async (id) => {
    const response = await axiosInstance.post(`/service-provider/bookings/${id}/payment-failed`, {});
    return unwrap(response).booking;
  },
  uploadMedia: async (file, folder = 'service-provider/bookings') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    const response = await axiosInstance.post('/uploads/media', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(response);
  },
  requestNewService: async (body) => {
    const response = await axiosInstance.post('/service-provider/service-requests', body);
    return unwrap(response);
  },
  getMyServiceRequests: async () => {
    const response = await axiosInstance.get('/service-provider/service-requests');
    return unwrap(response).records || [];
  },
  resubmitServiceRequest: async (id, body) => {
    const response = await axiosInstance.patch(`/service-provider/service-requests/${id}`, body);
    return unwrap(response);
  },
  requestNewCategory: async (body) => {
    const response = await axiosInstance.post('/service-provider/category-requests', body);
    return unwrap(response);
  },
  getMyCategoryRequests: async () => {
    const response = await axiosInstance.get('/service-provider/category-requests');
    return unwrap(response).records || [];
  },
  resubmitCategoryRequest: async (id, body) => {
    const response = await axiosInstance.patch(`/service-provider/category-requests/${id}`, body);
    return unwrap(response);
  },
  updateServices: async (services) => {
    const response = await axiosInstance.patch('/service-provider/services', { services });
    return unwrap(response).services || [];
  },
  getAvailability: async () => {
    const response = await axiosInstance.get('/service-provider/availability');
    return unwrap(response);
  },
  updateSchedule: async (schedule, bufferMinutes) => {
    const response = await axiosInstance.patch('/service-provider/availability/schedule', { schedule, bufferMinutes });
    return unwrap(response);
  },
  addUnavailableDate: async (body) => {
    const response = await axiosInstance.post('/service-provider/availability/unavailable-dates', body);
    return unwrap(response);
  },
  removeUnavailableDate: async (id) => {
    const response = await axiosInstance.delete(`/service-provider/availability/unavailable-dates/${id}`);
    return unwrap(response);
  },
  getProviderBookings: async () => {
    const response = await axiosInstance.get('/service-provider/provider-bookings');
    return unwrap(response).bookings || [];
  },

  // ---------- Provider: incoming dispatch requests ----------
  getIncomingRequests: async () => {
    const response = await axiosInstance.get('/service-provider/requests/incoming');
    return unwrap(response).requests || [];
  },
  acceptRequest: async (id) => {
    const response = await axiosInstance.post(`/service-provider/requests/${id}/accept`, {});
    return unwrap(response).booking;
  },
  rejectRequest: async (id) => {
    const response = await axiosInstance.post(`/service-provider/requests/${id}/reject`, {});
    return unwrap(response).booking;
  },

  // ---------- Provider: job execution ----------
  markOnTheWay: async (id) => {
    const response = await axiosInstance.post(`/service-provider/bookings/${id}/on-the-way`, {});
    return unwrap(response).booking;
  },
  markArrived: async (id) => {
    const response = await axiosInstance.post(`/service-provider/bookings/${id}/arrived`, {});
    return unwrap(response).booking;
  },
  startService: async (id, { otp, beforePhotos }) => {
    const response = await axiosInstance.post(`/service-provider/bookings/${id}/start`, { otp, beforePhotos });
    return unwrap(response).booking;
  },
  completeService: async (id, { afterPhotos, completionNotes }) => {
    const response = await axiosInstance.post(`/service-provider/bookings/${id}/complete`, { afterPhotos, completionNotes });
    return unwrap(response).booking;
  },
  addExtraCharge: async (id, { description, amount }) => {
    const response = await axiosInstance.post(`/service-provider/bookings/${id}/extra-charge`, { description, amount });
    return unwrap(response).booking;
  },
  providerCancelBooking: async (id, reason) => {
    const response = await axiosInstance.patch(`/service-provider/bookings/${id}/provider-cancel`, { reason });
    return unwrap(response).booking;
  },
  submitCustomerRating: async (id, { stars, comment }) => {
    const response = await axiosInstance.post(`/service-provider/bookings/${id}/customer-rating`, { stars, comment });
    return unwrap(response).booking;
  },
  getBookingDetailAsProvider: async (id) => {
    const response = await axiosInstance.get(`/service-provider/bookings/${id}`);
    return unwrap(response).booking;
  },
};

export default serviceProviderApi;
