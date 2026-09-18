import axiosInstance from '@core/api/axios';

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

const unwrapPaginated = (response) => {
  const data = unwrap(response);
  return {
    records: data.records || [],
    page: data.page || 1,
    pages: data.pages || 1,
    total: data.total || 0,
    limit: data.limit || 20,
  };
};

const serviceProviderAdminApi = {
  // ---------- Providers ----------
  getProviders: async (params = {}) => {
    const response = await axiosInstance.get('/service-provider/admin/providers', { params });
    return unwrapPaginated(response);
  },
  getProviderById: async (id) => {
    const response = await axiosInstance.get(`/service-provider/admin/providers/${id}`);
    return unwrap(response);
  },
  createProvider: async (body) => {
    const response = await axiosInstance.post('/service-provider/admin/providers', body);
    return unwrap(response);
  },
  updateProvider: async (id, body) => {
    const response = await axiosInstance.patch(`/service-provider/admin/providers/${id}`, body);
    return unwrap(response);
  },
  approveProvider: async (id) => {
    const response = await axiosInstance.patch(`/service-provider/admin/providers/${id}/approve`);
    return unwrap(response);
  },
  rejectProvider: async (id, reason) => {
    const response = await axiosInstance.patch(`/service-provider/admin/providers/${id}/reject`, { reason });
    return unwrap(response);
  },
  suspendProvider: async (id, reason) => {
    const response = await axiosInstance.patch(`/service-provider/admin/providers/${id}/suspend`, { reason });
    return unwrap(response);
  },
  activateProvider: async (id) => {
    const response = await axiosInstance.patch(`/service-provider/admin/providers/${id}/activate`);
    return unwrap(response);
  },

  // ---------- Categories ----------
  getCategories: async (params = {}) => {
    const response = await axiosInstance.get('/service-provider/admin/categories', { params });
    return unwrap(response).categories || [];
  },
  createCategory: async (body) => {
    const response = await axiosInstance.post('/service-provider/admin/categories', body);
    return unwrap(response).category;
  },
  updateCategory: async (id, body) => {
    const response = await axiosInstance.patch(`/service-provider/admin/categories/${id}`, body);
    return unwrap(response).category;
  },
  deleteCategory: async (id) => {
    const response = await axiosInstance.delete(`/service-provider/admin/categories/${id}`);
    return unwrap(response);
  },

  // ---------- Services ----------
  getServices: async (params = {}) => {
    const response = await axiosInstance.get('/service-provider/admin/services', { params });
    return unwrap(response).services || [];
  },
  createService: async (body) => {
    const response = await axiosInstance.post('/service-provider/admin/services', body);
    return unwrap(response).service;
  },
  updateService: async (id, body) => {
    const response = await axiosInstance.patch(`/service-provider/admin/services/${id}`, body);
    return unwrap(response).service;
  },
  deleteService: async (id) => {
    const response = await axiosInstance.delete(`/service-provider/admin/services/${id}`);
    return unwrap(response);
  },
  getServiceProviders: async (id) => {
    const response = await axiosInstance.get(`/service-provider/admin/services/${id}/providers`);
    return unwrap(response).providers || [];
  },

  // ---------- Zones ----------
  getZones: async (params = {}) => {
    const response = await axiosInstance.get('/service-provider/admin/zones', { params });
    return { records: unwrap(response).zones || [] };
  },
  getZoneById: async (id) => {
    const response = await axiosInstance.get(`/service-provider/admin/zones/${id}`);
    return unwrap(response).zone;
  },
  createZone: async (body) => {
    const response = await axiosInstance.post('/service-provider/admin/zones', body);
    return unwrap(response).zone;
  },
  updateZone: async (id, body) => {
    const response = await axiosInstance.patch(`/service-provider/admin/zones/${id}`, body);
    return unwrap(response).zone;
  },
  updateZoneStatus: async (id, status) => {
    const response = await axiosInstance.patch(`/service-provider/admin/zones/${id}/status`, { status });
    return unwrap(response).zone;
  },
  deleteZone: async (id) => {
    const response = await axiosInstance.delete(`/service-provider/admin/zones/${id}`);
    return unwrap(response);
  },

  // ---------- Service requests ----------
  getServiceRequests: async (params = {}) => {
    const response = await axiosInstance.get('/service-provider/admin/service-requests', { params });
    return unwrapPaginated(response);
  },
  approveServiceRequest: async (id, body = {}) => {
    const response = await axiosInstance.patch(`/service-provider/admin/service-requests/${id}/approve`, body);
    return unwrap(response);
  },
  rejectServiceRequest: async (id, reason) => {
    const response = await axiosInstance.patch(`/service-provider/admin/service-requests/${id}/reject`, { reason });
    return unwrap(response);
  },

  // ---------- Category requests ----------
  getCategoryRequests: async (params = {}) => {
    const response = await axiosInstance.get('/service-provider/admin/category-requests', { params });
    return unwrapPaginated(response);
  },
  approveCategoryRequest: async (id, body = {}) => {
    const response = await axiosInstance.patch(`/service-provider/admin/category-requests/${id}/approve`, body);
    return unwrap(response);
  },
  rejectCategoryRequest: async (id, reason) => {
    const response = await axiosInstance.patch(`/service-provider/admin/category-requests/${id}/reject`, { reason });
    return unwrap(response);
  },
};

export default serviceProviderAdminApi;
