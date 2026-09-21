import axiosInstance from '@core/api/axios';

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

const BASE = '/construction/admin';

const constructionAdminApi = {
  // ---------- Categories (BRD A8) ----------
  getCategories: async (params = {}) => {
    const response = await axiosInstance.get(`${BASE}/categories`, { params });
    return unwrap(response)?.categories || [];
  },
  createCategory: async (body) => {
    const response = await axiosInstance.post(`${BASE}/categories`, body);
    return unwrap(response)?.category;
  },
  updateCategory: async (id, body) => {
    const response = await axiosInstance.patch(`${BASE}/categories/${id}`, body);
    return unwrap(response)?.category;
  },
  setCategoryStatus: async (id, status) => {
    const response = await axiosInstance.patch(`${BASE}/categories/${id}/status`, { status });
    return unwrap(response)?.category;
  },
  deleteCategory: async (id) => {
    const response = await axiosInstance.delete(`${BASE}/categories/${id}`);
    return unwrap(response);
  },

  // ---------- Services (BRD A8) ----------
  getServices: async (params = {}) => {
    const response = await axiosInstance.get(`${BASE}/services`, { params });
    return unwrap(response)?.services || [];
  },
  getService: async (id) => {
    const response = await axiosInstance.get(`${BASE}/services/${id}`);
    return unwrap(response)?.service;
  },
  createService: async (body) => {
    const response = await axiosInstance.post(`${BASE}/services`, body);
    return unwrap(response)?.service;
  },
  updateService: async (id, body) => {
    const response = await axiosInstance.patch(`${BASE}/services/${id}`, body);
    return unwrap(response)?.service;
  },
  setServiceStatus: async (id, status) => {
    const response = await axiosInstance.patch(`${BASE}/services/${id}/status`, { status });
    return unwrap(response)?.service;
  },
  deleteService: async (id) => {
    const response = await axiosInstance.delete(`${BASE}/services/${id}`);
    return unwrap(response);
  },

  // ---------- Residential / Commercial packages ----------
  getPackages: async (params = {}) => {
    const response = await axiosInstance.get(`${BASE}/packages`, { params });
    return unwrap(response)?.packages || [];
  },
  createPackage: async (body) => {
    const response = await axiosInstance.post(`${BASE}/packages`, body);
    return unwrap(response)?.package;
  },
  updatePackage: async (id, body) => {
    const response = await axiosInstance.patch(`${BASE}/packages/${id}`, body);
    return unwrap(response)?.package;
  },
  setPackageStatus: async (id, status) => {
    const response = await axiosInstance.patch(`${BASE}/packages/${id}/status`, { status });
    return unwrap(response)?.package;
  },
  deletePackage: async (id) => {
    const response = await axiosInstance.delete(`${BASE}/packages/${id}`);
    return unwrap(response);
  },
  /** Loads the original packages into an empty segment. Refused if any exist. */
  loadDefaultPackages: async (segment) => {
    const response = await axiosInstance.post(`${BASE}/packages/seed-defaults`, { segment });
    return unwrap(response)?.packages || [];
  },

  // ---------- Package requests (customers selecting a package) ----------
  getPackageRequests: async (params = {}) => {
    const data = unwrap(await axiosInstance.get(`${BASE}/package-requests`, { params }));
    return {
      rows: data?.data || [],
      meta: data?.meta || { total: 0, page: 1, totalPages: 1 },
      counts: data?.counts || {},
    };
  },
  updatePackageRequestStatus: async (id, body) =>
    unwrap(await axiosInstance.patch(`${BASE}/package-requests/${id}/status`, body))?.request,
  /** Offer a paid request to the next batch of contractors — for when nobody took it. */
  redispatchPackageRequest: async (id) =>
    unwrap(await axiosInstance.post(`${BASE}/package-requests/${id}/redispatch`)),
  /** After the site visit report: send the customer a price and terms to accept. */
  sendPackageContract: async (id, body) =>
    unwrap(await axiosInstance.post(`${BASE}/package-requests/${id}/contract`, body))?.request,
  /** Contractors the office can give a request to — those covering the area come first. */
  getAssignableContractors: async (id) =>
    unwrap(await axiosInstance.get(`${BASE}/package-requests/${id}/contractors`))?.contractors || [],
  /** Put a specific contractor on a paid request (commercial, or a residential one nobody accepted). */
  assignPackageRequest: async (id, contractorId) =>
    unwrap(await axiosInstance.post(`${BASE}/package-requests/${id}/assign`, { contractorId }))?.request,
  /** Give the visiting fee back as a wallet credit. Needs the payments permission. */
  refundPackageRequest: async (id, reason) =>
    unwrap(await axiosInstance.post(`${BASE}/package-requests/${id}/refund`, { reason }))?.request,

  // ---------- Home screen banners ----------
  getBanners: async (params = {}) => {
    const response = await axiosInstance.get(`${BASE}/banners`, { params });
    return unwrap(response)?.banners || [];
  },
  createBanner: async (body) =>
    unwrap(await axiosInstance.post(`${BASE}/banners`, body))?.banner,
  updateBanner: async (id, body) =>
    unwrap(await axiosInstance.patch(`${BASE}/banners/${id}`, body))?.banner,
  setBannerStatus: async (id, status) =>
    unwrap(await axiosInstance.patch(`${BASE}/banners/${id}/status`, { status }))?.banner,
  deleteBanner: async (id) => unwrap(await axiosInstance.delete(`${BASE}/banners/${id}`)),

  // ---------- Budget Friendly services (their own collection) ----------
  getBudgetServices: async (params = {}) => {
    const response = await axiosInstance.get(`${BASE}/budget-services`, { params });
    return unwrap(response)?.services || [];
  },
  createBudgetService: async (body) =>
    unwrap(await axiosInstance.post(`${BASE}/budget-services`, body))?.service,
  updateBudgetService: async (id, body) =>
    unwrap(await axiosInstance.patch(`${BASE}/budget-services/${id}`, body))?.service,
  deleteBudgetService: async (id) =>
    unwrap(await axiosInstance.delete(`${BASE}/budget-services/${id}`)),

  // ---------- Materials ----------
  /** Returns the rows plus the categories already in use, for the form's suggestions. */
  getMaterials: async (params = {}) => {
    const data = unwrap(await axiosInstance.get(`${BASE}/materials`, { params }));
    return { materials: data?.materials || [], categories: data?.categories || [] };
  },
  createMaterial: async (body) =>
    unwrap(await axiosInstance.post(`${BASE}/materials`, body))?.material,
  updateMaterial: async (id, body) =>
    unwrap(await axiosInstance.patch(`${BASE}/materials/${id}`, body))?.material,
  deleteMaterial: async (id) => unwrap(await axiosInstance.delete(`${BASE}/materials/${id}`)),

  // ---------- Material quote requests ----------
  getMaterialRequests: async (params = {}) => {
    const data = unwrap(await axiosInstance.get(`${BASE}/material-requests`, { params }));
    return {
      rows: data?.data || [],
      meta: data?.meta || { total: 0, page: 1, totalPages: 1 },
      counts: data?.counts || {},
    };
  },
  updateMaterialRequestStatus: async (id, body) =>
    unwrap(await axiosInstance.patch(`${BASE}/material-requests/${id}/status`, body))?.request,

  // ---------- Contractors (BRD A2, A3 · Rule 6) ----------
  getContractorStats: async () => {
    const response = await axiosInstance.get(`${BASE}/contractors/stats`);
    return unwrap(response)?.stats;
  },
  getContractors: async (params = {}) => {
    const response = await axiosInstance.get(`${BASE}/contractors`, { params });
    const data = unwrap(response);
    return { rows: data?.data || [], meta: data?.meta || { total: 0, page: 1, totalPages: 1 } };
  },
  getContractor: async (id) => {
    const response = await axiosInstance.get(`${BASE}/contractors/${id}`);
    return unwrap(response);
  },
  approveContractor: async (id) => {
    const response = await axiosInstance.patch(`${BASE}/contractors/${id}/approve`);
    return unwrap(response)?.contractor;
  },
  rejectContractor: async (id, reason) => {
    const response = await axiosInstance.patch(`${BASE}/contractors/${id}/reject`, { reason });
    return unwrap(response)?.contractor;
  },
  suspendContractor: async (id, reason) => {
    const response = await axiosInstance.patch(`${BASE}/contractors/${id}/suspend`, { reason });
    return unwrap(response)?.contractor;
  },
  activateContractor: async (id) => {
    const response = await axiosInstance.patch(`${BASE}/contractors/${id}/activate`);
    return unwrap(response)?.contractor;
  },
  verifyDocument: async (documentId) => {
    const response = await axiosInstance.patch(`${BASE}/contractors/documents/${documentId}/verify`);
    return unwrap(response)?.document;
  },
  rejectDocument: async (documentId, reason) => {
    const response = await axiosInstance.patch(`${BASE}/contractors/documents/${documentId}/reject`, { reason });
    return unwrap(response)?.document;
  },

  // ---------- Enquiry pipeline (BRD A4) ----------
  getEnquiryStats: async (params = {}) => {
    const response = await axiosInstance.get(`${BASE}/enquiries/stats`, { params });
    return unwrap(response)?.stats;
  },
  getEnquiries: async (params = {}) => {
    const response = await axiosInstance.get(`${BASE}/enquiries`, { params });
    const data = unwrap(response);
    return { rows: data?.data || [], meta: data?.meta || { total: 0, page: 1, totalPages: 1 } };
  },
  getEnquiry: async (id) => {
    const response = await axiosInstance.get(`${BASE}/enquiries/${id}`);
    return unwrap(response);
  },
  rematchEnquiry: async (id) => {
    const response = await axiosInstance.post(`${BASE}/enquiries/${id}/rematch`);
    return unwrap(response);
  },
  closeEnquiry: async (id, reason) => {
    const response = await axiosInstance.post(`${BASE}/enquiries/${id}/close`, { reason });
    return unwrap(response)?.enquiry;
  },

  // ---------- Projects and escrow (BRD A5, A6, A7) ----------
  getProjects: async (params = {}) => {
    const data = unwrap(await axiosInstance.get(`${BASE}/projects`, { params }));
    return { rows: data?.data || [], meta: data?.meta || { total: 0, page: 1, totalPages: 1 } };
  },
  getProjectStats: async () =>
    unwrap(await axiosInstance.get(`${BASE}/projects/stats`))?.stats,
  getProject: async (id) => unwrap(await axiosInstance.get(`${BASE}/projects/${id}`)),

  /** BRD A6 — intervention. Hold works even when the module is switched off. */
  holdProject: async (id, reason) =>
    unwrap(await axiosInstance.post(`${BASE}/projects/${id}/hold`, { reason }))?.project,
  resumeProject: async (id) =>
    unwrap(await axiosInstance.post(`${BASE}/projects/${id}/resume`))?.project,
  /** Returns every rupee still held to the customer. Not reversible. */
  cancelProject: async (id, reason) =>
    unwrap(await axiosInstance.post(`${BASE}/projects/${id}/cancel`, { reason }))?.project,

  /** BRD A7 — supervisor approval when the customer has gone quiet (Q13). */
  approveStage: async (stageId, note) =>
    unwrap(await axiosInstance.post(`${BASE}/stages/${stageId}/approve`, { note })),

  /** Recompute the money cache from the escrow ledger; the ledger is the truth. */
  reconcileProject: async (id, repair = false) =>
    unwrap(await axiosInstance.post(`${BASE}/projects/${id}/reconcile`, { repair })),
  releaseRetention: async (id, force = false) =>
    unwrap(await axiosInstance.post(`${BASE}/projects/${id}/release-retention`, { force })),

  // ---------- Disputes (BRD Q15) ----------
  getDisputes: async (params = {}) => {
    const data = unwrap(await axiosInstance.get(`${BASE}/disputes`, { params }));
    return { rows: data?.data || [], meta: data?.meta || { total: 0, page: 1, totalPages: 1 } };
  },
  getDisputeStats: async () => unwrap(await axiosInstance.get(`${BASE}/disputes/stats`))?.stats,
  getDispute: async (disputeId) => unwrap(await axiosInstance.get(`${BASE}/disputes/${disputeId}`)),
  startDisputeReview: async (disputeId) =>
    unwrap(await axiosInstance.post(`${BASE}/disputes/${disputeId}/review`))?.dispute,
  commentOnDispute: async (disputeId, note) =>
    unwrap(await axiosInstance.post(`${BASE}/disputes/${disputeId}/comments`, { note }))?.dispute,
  withdrawDispute: async (disputeId, reason) =>
    unwrap(await axiosInstance.post(`${BASE}/disputes/${disputeId}/withdraw`, { reason }))?.dispute,
  /** The only Phase 6 call that moves money. */
  resolveDispute: async (disputeId, body) =>
    unwrap(await axiosInstance.post(`${BASE}/disputes/${disputeId}/resolve`, body)),

  // ---------- Project documents and messages ----------
  getProjectDocuments: async (projectId, params = {}) =>
    unwrap(await axiosInstance.get(`${BASE}/projects/${projectId}/documents`, { params })),
  addProjectDocument: async (projectId, body) =>
    unwrap(await axiosInstance.post(`${BASE}/projects/${projectId}/documents`, body))?.document,
  getProjectMessages: async (projectId, params = {}) =>
    unwrap(await axiosInstance.get(`${BASE}/projects/${projectId}/messages`, { params })),
  sendProjectMessage: async (projectId, body) =>
    unwrap(await axiosInstance.post(`${BASE}/projects/${projectId}/messages`, body))?.message,

  // ---------- Trust score (BRD W18) ----------
  recalculateContractorScore: async (contractorId) =>
    unwrap(await axiosInstance.post(`${BASE}/contractors/${contractorId}/score/recalculate`))?.score,
  recalculateAllScores: async () =>
    unwrap(await axiosInstance.post(`${BASE}/scores/recalculate`)),

  // ---------- A1 — the operations dashboard ----------
  getDashboard: async (params = {}) =>
    unwrap(await axiosInstance.get(`${BASE}/dashboard`, { params })),

  // ---------- A7 — payment control ----------
  getPaymentControl: async (params = {}) =>
    unwrap(await axiosInstance.get(`${BASE}/payment-control`, { params })),
  listCashPayments: async () =>
    unwrap(await axiosInstance.get('/construction/admin/cash-payments'))?.requests || [],

  // ---------- A9 — reports ----------
  getCityReport: async (params = {}) =>
    unwrap(await axiosInstance.get(`${BASE}/reports/cities`, { params })),
  getServiceReport: async (params = {}) =>
    unwrap(await axiosInstance.get(`${BASE}/reports/services`, { params })),
  getPeriodReport: async (params = {}) =>
    unwrap(await axiosInstance.get(`${BASE}/reports/periods`, { params })),
  getContractorReport: async (params = {}) =>
    unwrap(await axiosInstance.get(`${BASE}/reports/contractors`, { params })),
  getDelayReport: async (params = {}) =>
    unwrap(await axiosInstance.get(`${BASE}/reports/delays`, { params })),

  // ---------- A10 — the permanent activity record ----------
  getActivity: async (params = {}) =>
    unwrap(await axiosInstance.get(`${BASE}/activity`, { params })),
  getProjectActivity: async (projectId, params = {}) =>
    unwrap(await axiosInstance.get(`${BASE}/projects/${projectId}/activity`, { params })),

  // ---------- A6 — reassign the contractor ----------
  reassignContractor: async (projectId, contractorId, reason) =>
    unwrap(await axiosInstance.post(`${BASE}/projects/${projectId}/reassign`, {
      contractorId, reason,
    })),

  // ---------- Module settings ----------
  getSettings: async () => {
    const response = await axiosInstance.get(`${BASE}/settings`);
    return unwrap(response)?.settings;
  },
  updateSettings: async (patch) => {
    const response = await axiosInstance.patch(`${BASE}/settings`, patch);
    return unwrap(response)?.settings;
  },
};

export default constructionAdminApi;
