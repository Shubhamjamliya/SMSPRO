import axiosInstance from '@core/api/axios';

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

/**
 * Customer-facing construction API.
 *
 * Every endpoint here requires a logged-in user — BRD Rule 5 makes construction a
 * protected service, so unlike Food or Home Services there is no anonymous
 * browsing of the catalogue at all.
 */
const constructionApi = {
  /** C1 — categories with their live services. */
  getCatalogue: async () => {
    const response = await axiosInstance.get('/construction/services');
    return unwrap(response)?.categories || [];
  },

  /**
   * Books a package. Sends WHICH package and the site details only — the server works
   * out the price, the estimate and the visiting fee. Resolves to `{ request, razorpay }`:
   * `razorpay` is the checkout to open when the plan has a visiting fee (the request is
   * held back until it is paid), and null when the visit is free.
   */
  createPackageRequest: async (body) =>
    unwrap(await axiosInstance.post('/construction/package-requests', body)),

  /** Re-open the checkout for a booking that was saved but not paid for. */
  getPackageRequestPayment: async (id) =>
    unwrap(await axiosInstance.post(`/construction/package-requests/${id}/payment`)),

  /** After Razorpay checkout: the server verifies the payment, then sends the request to contractors. */
  verifyPackageRequestPayment: async (id, body) =>
    unwrap(await axiosInstance.post(`/construction/package-requests/${id}/verify-payment`, body))?.request,

  // ---------- Following a booked site visit ----------
  listMySiteVisits: async () =>
    unwrap(await axiosInstance.get('/construction/package-requests'))?.requests || [],
  getMySiteVisit: async (id) =>
    unwrap(await axiosInstance.get(`/construction/package-requests/${id}`))?.request,
  /** A fresh visit OTP — for when it was lost or the contractor used up their attempts. */
  regenerateVisitOtp: async (id) =>
    unwrap(await axiosInstance.post(`/construction/package-requests/${id}/visit-otp`))?.request,
  acceptSiteVisitContract: async (id, note = '') =>
    unwrap(await axiosInstance.post(`/construction/package-requests/${id}/contract/accept`, { note }))?.request,
  declineSiteVisitContract: async (id, note = '') =>
    unwrap(await axiosInstance.post(`/construction/package-requests/${id}/contract/decline`, { note }))?.request,

  /** Home screen banners that are live right now (the server applies the schedule). */
  getBanners: async () => {
    const response = await axiosInstance.get('/construction/banners');
    return unwrap(response)?.banners || [];
  },

  /**
   * Budget Friendly offerings, active only. Each has `enquiryServiceKey` when it
   * is linked to a live catalogue service — that is what makes it enquirable.
   */
  getBudgetServices: async () => {
    const response = await axiosInstance.get('/construction/budget-services');
    return unwrap(response)?.services || [];
  },

  /** Materials on sale, active ones only. Prices are list rates. */
  getMaterials: async () => {
    const response = await axiosInstance.get('/construction/materials');
    return unwrap(response)?.materials || [];
  },

  /**
   * Asks for a quote on a basket of materials. Only ids and quantities are
   * trusted — the server looks up names and prices itself.
   */
  createMaterialRequest: async (body) =>
    unwrap(await axiosInstance.post('/construction/material-requests', body))?.request,

  /** Admin-managed Residential / Commercial packages. Active ones only. */
  getPackages: async (segment) => {
    const response = await axiosInstance.get('/construction/packages', {
      params: segment ? { segment } : {},
    });
    return unwrap(response)?.packages || [];
  },

  /** C2 — one service: what it covers, how long it takes, what to expect. */
  getServiceDetail: async (idOrSlug) => {
    const response = await axiosInstance.get(`/construction/services/${idOrSlug}`);
    return unwrap(response)?.service;
  },

  /** The subset of module settings the customer app is allowed to see. */
  getSettings: async () => {
    const response = await axiosInstance.get('/construction/settings');
    return unwrap(response)?.settings;
  },

  // ---------- Enquiries (BRD C3–C5) ----------
  createEnquiry: async (body) =>
    unwrap(await axiosInstance.post('/construction/enquiries', body))?.enquiry,
  listEnquiries: async (params = {}) => {
    const data = unwrap(await axiosInstance.get('/construction/enquiries', { params }));
    return { rows: data?.data || [], meta: data?.meta || { total: 0, page: 1, totalPages: 1 } };
  },
  getEnquiry: async (id) => unwrap(await axiosInstance.get(`/construction/enquiries/${id}`)),

  // ---------- Quotations (BRD C10–C13) ----------
  /** Every quote received, across all enquiries — the "My quotes" tab. */
  listQuotations: async (params = {}) =>
    unwrap(await axiosInstance.get('/construction/quotations', { params }))?.quotations || [],
  compareQuotations: async (enquiryId) =>
    unwrap(await axiosInstance.get(`/construction/enquiries/${enquiryId}/compare`)),
  getQuotation: async (id) => unwrap(await axiosInstance.get(`/construction/quotations/${id}`)),
  acceptQuotation: async (enquiryId, quotationId) =>
    unwrap(await axiosInstance.post(`/construction/enquiries/${enquiryId}/quotations/${quotationId}/accept`)),
  rejectQuotation: async (enquiryId, quotationId, reason) =>
    unwrap(await axiosInstance.post(`/construction/enquiries/${enquiryId}/quotations/${quotationId}/reject`, { reason })),
  askQuestion: async (quotationId, question) =>
    unwrap(await axiosInstance.post(`/construction/quotations/${quotationId}/questions`, { question })),
  requestRevision: async (quotationId, reason) =>
    unwrap(await axiosInstance.post(`/construction/quotations/${quotationId}/request-revision`, { reason })),

  // ---------- Projects and staged payment (BRD C14–C17, C21–C23) ----------
  listProjects: async (params = {}) => {
    const data = unwrap(await axiosInstance.get('/construction/projects', { params }));
    return { rows: data?.data || [], meta: data?.meta || { total: 0, page: 1, totalPages: 1 } };
  },
  getProject: async (id) => unwrap(await axiosInstance.get(`/construction/projects/${id}`)),
  /** The payment schedule: what is held, what is paid, what is still to come. */
  getProjectMoney: async (id) => unwrap(await axiosInstance.get(`/construction/projects/${id}/money`)),
  /** BRD C22 — money moves into escrow, not to the contractor. */
  fundProject: async (id, amount) =>
    unwrap(await axiosInstance.post(`/construction/projects/${id}/fund`, { amount })),
  requestCashPayment: async (id, body) =>
    unwrap(await axiosInstance.post(`/construction/projects/${id}/cash-fund`, body)),
  listCustomerCashRequests: async () =>
    unwrap(await axiosInstance.get('/construction/cash-requests'))?.requests || [],
  listContractorCashRequests: async () =>
    unwrap(await axiosInstance.get('/construction/contractor/cash-requests'))?.requests || [],
  approveCashPayment: async (requestId) =>
    unwrap(await axiosInstance.post(`/construction/contractor/cash-requests/${requestId}/approve`)),
  rejectCashPayment: async (requestId, reason) =>
    unwrap(await axiosInstance.post(`/construction/contractor/cash-requests/${requestId}/reject`, { reason })),
  adminListCashPayments: async () =>
    unwrap(await axiosInstance.get('/construction/admin/cash-payments'))?.requests || [],
  confirmHandover: async (id, body) =>
    unwrap(await axiosInstance.post(`/construction/projects/${id}/handover`, body)),

  listPendingApprovals: async () =>
    unwrap(await axiosInstance.get('/construction/projects/pending-approvals'))?.stages || [],
  getStage: async (stageId) => unwrap(await axiosInstance.get(`/construction/stages/${stageId}`)),
  /** BRD C17 — approving is what releases the payment. */
  approveStage: async (stageId, note = '') =>
    unwrap(await axiosInstance.post(`/construction/stages/${stageId}/approve`, { note })),
  rejectStage: async (stageId, reason) =>
    unwrap(await axiosInstance.post(`/construction/stages/${stageId}/reject`, { reason })),

  // ---------- Documents (BRD C19) ----------
  listProjectDocuments: async (projectId, params = {}) =>
    unwrap(await axiosInstance.get(`/construction/projects/${projectId}/documents`, { params })),
  addProjectDocument: async (projectId, body) =>
    unwrap(await axiosInstance.post(`/construction/projects/${projectId}/documents`, body))?.document,
  projectDocumentHistory: async (projectId, documentId) =>
    unwrap(await axiosInstance.get(`/construction/projects/${projectId}/documents/${documentId}/history`)),
  revokeProjectDocument: async (projectId, documentId, reason) =>
    unwrap(await axiosInstance.post(`/construction/projects/${projectId}/documents/${documentId}/revoke`, { reason }))?.document,
  documentReadiness: async (projectId) =>
    unwrap(await axiosInstance.get(`/construction/projects/${projectId}/documents/readiness`)),

  // ---------- Messages (BRD C20) ----------
  listMessages: async (projectId, params = {}) =>
    unwrap(await axiosInstance.get(`/construction/projects/${projectId}/messages`, { params })),
  sendMessage: async (projectId, body) =>
    unwrap(await axiosInstance.post(`/construction/projects/${projectId}/messages`, body))?.message,
  unreadMessages: async (projectId) =>
    unwrap(await axiosInstance.get(`/construction/projects/${projectId}/messages/unread`))?.unread || 0,
  markMessagesRead: async (projectId) =>
    unwrap(await axiosInstance.post(`/construction/projects/${projectId}/messages/read`)),
  retractMessage: async (projectId, messageId) =>
    unwrap(await axiosInstance.post(`/construction/projects/${projectId}/messages/${messageId}/retract`))?.message,

  // ---------- Disputes (BRD Q15) ----------
  listDisputes: async (projectId) =>
    unwrap(await axiosInstance.get(`/construction/projects/${projectId}/disputes`))?.disputes || [],
  raiseDispute: async (projectId, body) =>
    unwrap(await axiosInstance.post(`/construction/projects/${projectId}/disputes`, body))?.dispute,
  getDispute: async (disputeId) =>
    unwrap(await axiosInstance.get(`/construction/disputes/${disputeId}`)),
  commentOnDispute: async (disputeId, note) =>
    unwrap(await axiosInstance.post(`/construction/disputes/${disputeId}/comments`, { note }))?.dispute,
  withdrawDispute: async (disputeId, reason) =>
    unwrap(await axiosInstance.post(`/construction/disputes/${disputeId}/withdraw`, { reason }))?.dispute,

  // ---------- Choosing a contractor (BRD C6, C7, C8) ----------
  /** C6 — the contractors actually matched to this enquiry, and why. */
  listEnquiryContractors: async (enquiryId) =>
    unwrap(await axiosInstance.get(`/construction/enquiries/${enquiryId}/contractors`)),
  /** C8 — search the verified network. */
  searchContractors: async (params = {}) => {
    const data = unwrap(await axiosInstance.get('/construction/contractors', { params }));
    return { rows: data?.data || [], meta: data?.meta || { total: 0, page: 1, totalPages: 1 } };
  },
  /** C7 — one contractor's full public page: badges, work, reviews. */
  getContractorProfile: async (contractorId) =>
    unwrap(await axiosInstance.get(`/construction/contractors/${contractorId}`))?.contractor,

  /** A contractor's public trust badge (BRD W18). Never the breakdown. */
  getContractorScore: async (contractorId) =>
    unwrap(await axiosInstance.get(`/construction/contractors/${contractorId}/score`))?.score,

  // ---------- Site visits (BRD C9) ----------
  proposeVisit: async (body) =>
    unwrap(await axiosInstance.post('/construction/site-visits', body))?.visit,
  confirmVisit: async (id) =>
    unwrap(await axiosInstance.patch(`/construction/site-visits/${id}/confirm`))?.visit,
  cancelVisit: async (id, reason) =>
    unwrap(await axiosInstance.patch(`/construction/site-visits/${id}/cancel`, { reason }))?.visit,
};

export default constructionApi;
