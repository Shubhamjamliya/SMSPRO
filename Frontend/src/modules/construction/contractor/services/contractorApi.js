import axiosInstance from '@core/api/axios';

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
const BASE = '/construction/contractor';

const contractorApi = {
  // ---------- Auth (BRD W1) ----------
  requestOtp: async (phone) => unwrap(await axiosInstance.post(`${BASE}/auth/request-otp`, { phone })),
  verifyOtp: async (payload) => unwrap(await axiosInstance.post(`${BASE}/auth/verify-otp`, payload)),
  getMe: async () => unwrap(await axiosInstance.get(`${BASE}/auth/me`))?.contractor,

  // ---------- Registration (BRD W1–W4) ----------
  getDraft: async () => unwrap(await axiosInstance.get(`${BASE}/onboarding/draft`)),
  saveDraft: async (patch) => unwrap(await axiosInstance.patch(`${BASE}/onboarding/draft`, patch)),
  submit: async (body) => unwrap(await axiosInstance.post(`${BASE}/onboarding/submit`, body)),
  getTrades: async () => unwrap(await axiosInstance.get(`${BASE}/onboarding/trades`))?.trades || [],

  // ---------- Documents (BRD W3) ----------
  /** BRD W1 — the contractor editing their own profile after approval. */
  updateProfile: async (body) =>
    unwrap(await axiosInstance.patch(`${BASE}/profile`, body))?.contractor,

  listDocuments: async () => unwrap(await axiosInstance.get(`${BASE}/documents`))?.documents || [],
  addDocument: async (body) => unwrap(await axiosInstance.post(`${BASE}/documents`, body))?.document,
  deleteDocument: async (id) => unwrap(await axiosInstance.delete(`${BASE}/documents/${id}`)),

  // ---------- Portfolio (BRD W5) ----------
  listPortfolio: async () => unwrap(await axiosInstance.get(`${BASE}/portfolio`))?.portfolio || [],
  addPortfolio: async (body) => unwrap(await axiosInstance.post(`${BASE}/portfolio`, body))?.entry,
  updatePortfolio: async (id, body) => unwrap(await axiosInstance.patch(`${BASE}/portfolio/${id}`, body))?.entry,
  deletePortfolio: async (id) => unwrap(await axiosInstance.delete(`${BASE}/portfolio/${id}`)),

  // ---------- Leads (BRD W6, W7) ----------
  listLeads: async (params = {}) => {
    const data = unwrap(await axiosInstance.get(`${BASE}/leads`, { params }));
    return { rows: data?.data || [], meta: data?.meta || { total: 0, page: 1, totalPages: 1 } };
  },
  leadStats: async () => unwrap(await axiosInstance.get(`${BASE}/leads/stats`))?.stats,
  acceptLead: async (id) => unwrap(await axiosInstance.patch(`${BASE}/leads/${id}/accept`))?.lead,
  declineLead: async (id, body) => unwrap(await axiosInstance.patch(`${BASE}/leads/${id}/decline`, body))?.lead,

  // ---------- Package site-visit requests (paid by the customer, sent to nearby contractors) ----------
  listPackageRequests: async (params = {}) => {
    const data = unwrap(await axiosInstance.get(`${BASE}/package-requests`, { params }));
    return { rows: data?.data || [], meta: data?.meta || { total: 0, page: 1, totalPages: 1 } };
  },
  /** First contractor to accept gets the request; anyone later is told it is taken. */
  acceptPackageRequest: async (id) => unwrap(await axiosInstance.post(`${BASE}/package-requests/${id}/accept`))?.request,
  declinePackageRequest: async (id, body) => unwrap(await axiosInstance.post(`${BASE}/package-requests/${id}/decline`, body)),

  // ---------- Notification bell ----------
  /** Recent notifications and the unread count: `{ unread, notifications }`. */
  getNotifications: async () => unwrap(await axiosInstance.get(`${BASE}/notifications`)),
  /** Mark one read with an id, or all of them with none. Answers with the fresh inbox. */
  markNotificationsRead: async (id) =>
    unwrap(await axiosInstance.post(`${BASE}/notifications/read`, id ? { id } : {})),
  /** Clears the whole inbox for good (not just marks it read). Answers with the now-empty inbox. */
  clearNotifications: async () => unwrap(await axiosInstance.delete(`${BASE}/notifications`)),

  /** Every package site visit assigned to this contractor, in progress or done, with the full record. */
  listPackageVisits: async () => unwrap(await axiosInstance.get(`${BASE}/package-visits`))?.visits || [],

  // The booking page: one request, and the site visit that follows.
  getPackageRequest: async (id) => unwrap(await axiosInstance.get(`${BASE}/package-requests/${id}`))?.request,
  /** "Start journey" — tells the customer the contractor is on the way and gives them the OTP. */
  startJourney: async (id, location) =>
    unwrap(await axiosInstance.post(`${BASE}/package-requests/${id}/start-journey`, { location }))?.request,
  /** The customer reads the OTP out on site; the contractor types it in. */
  confirmArrival: async (id, otp, location) =>
    unwrap(await axiosInstance.post(`${BASE}/package-requests/${id}/verify-otp`, { otp, location }))?.request,
  /** Save the site visit report as a draft, or send it to the office with `submit: true`. */
  saveVisitReport: async (id, report, submit = false) =>
    unwrap(await axiosInstance.put(`${BASE}/package-requests/${id}/report`, { report, submit }))?.request,
  /** The customer accepted the contract — confirm to start work. Refunds the site visit fee. */
  confirmPackageContract: async (id) =>
    unwrap(await axiosInstance.post(`${BASE}/package-requests/${id}/contract/confirm`))?.request,
  declinePackageContract: async (id, note = '') =>
    unwrap(await axiosInstance.post(`${BASE}/package-requests/${id}/contract/decline`, { note }))?.request,

  // ---------- Site visits (BRD W8, W9) ----------
  listVisits: async (params = {}) =>
    unwrap(await axiosInstance.get(`${BASE}/site-visits`, { params }))?.visits || [],
  getVisit: async (id) => unwrap(await axiosInstance.get(`${BASE}/site-visits/${id}`))?.visit,
  proposeVisit: async (body) => unwrap(await axiosInstance.post(`${BASE}/site-visits`, body))?.visit,
  confirmVisit: async (id) => unwrap(await axiosInstance.patch(`${BASE}/site-visits/${id}/confirm`))?.visit,
  cancelVisit: async (id, reason) =>
    unwrap(await axiosInstance.patch(`${BASE}/site-visits/${id}/cancel`, { reason }))?.visit,
  submitVisitReport: async (id, body) =>
    unwrap(await axiosInstance.post(`${BASE}/site-visits/${id}/report`, body))?.visit,

  // ---------- Quotations (BRD W10–W13) ----------
  listQuotations: async (params = {}) =>
    unwrap(await axiosInstance.get(`${BASE}/quotations`, { params }))?.quotations || [],
  createQuotation: async (body) => unwrap(await axiosInstance.post(`${BASE}/quotations`, body))?.quotation,
  getQuotation: async (id) => unwrap(await axiosInstance.get(`${BASE}/quotations/${id}`)),
  updateQuotation: async (id, body) =>
    unwrap(await axiosInstance.patch(`${BASE}/quotations/${id}`, body))?.quotation,
  sendQuotation: async (id) => unwrap(await axiosInstance.post(`${BASE}/quotations/${id}/send`))?.quotation,
  reviseQuotation: async (id) => unwrap(await axiosInstance.post(`${BASE}/quotations/${id}/revise`))?.quotation,
  answerQuery: async (id, queryId, answer) =>
    unwrap(await axiosInstance.post(`${BASE}/quotations/${id}/queries/${queryId}/answer`, { reason: answer }))?.quotation,
  saveAsTemplate: async (id, name) =>
    unwrap(await axiosInstance.post(`${BASE}/quotations/${id}/save-as-template`, { name }))?.template,
  /** The customer accepted — confirm to start the project. Returns `{ quotation, project }`. */
  confirmQuotation: async (id) => unwrap(await axiosInstance.post(`${BASE}/quotations/${id}/confirm`)),
  declineQuotation: async (id, reason) =>
    unwrap(await axiosInstance.post(`${BASE}/quotations/${id}/decline`, { reason }))?.quotation,

  // ---------- Projects and stages (BRD W14–W17) ----------
  listProjects: async (params = {}) => {
    const data = unwrap(await axiosInstance.get(`${BASE}/projects`, { params }));
    const rows = Array.isArray(data) ? data : (data?.data || data?.rows || []);
    const meta = data?.meta || { total: rows.length, page: 1, totalPages: 1 };
    return { rows, meta };
  },
  listContractorCashRequests: async () =>
    unwrap(await axiosInstance.get(`${BASE}/cash-requests`))?.requests || [],
  approveCashPayment: async (requestId) =>
    unwrap(await axiosInstance.post(`${BASE}/cash-requests/${requestId}/approve`)),
  rejectCashPayment: async (requestId, reason) =>
    unwrap(await axiosInstance.post(`${BASE}/cash-requests/${requestId}/reject`, { reason })),
  getProject: async (id) => unwrap(await axiosInstance.get(`${BASE}/projects/${id}`)),
  getStage: async (stageId) => unwrap(await axiosInstance.get(`${BASE}/stages/${stageId}`)),
  /** BRD W15 — how far along, without asking for payment yet. */
  updateStageProgress: async (stageId, body) =>
    unwrap(await axiosInstance.patch(`${BASE}/stages/${stageId}/progress`, body))?.stage,
  /** BRD W16 — the photographs are what unlock the payment. */
  submitStage: async (stageId, body) =>
    unwrap(await axiosInstance.post(`${BASE}/stages/${stageId}/submit`, body)),
  /** BRD W17 — earned, held against your projects, awaiting approval. */
  getEarnings: async () => unwrap(await axiosInstance.get(`${BASE}/earnings`)),

  /**
   * Project documents (BRD C19).
   *
   * Named `...ProjectDocument...`, NOT `listDocuments`/`addDocument`, because a
   * contractor has two completely different document sets: their own licence and
   * insurance (above, `/contractor/documents`) and the papers attached to one
   * project. Both once used the same two names in this object, so the later pair
   * silently won and registration's "add a document" started posting to a
   * project route with no project id — the form accepted the upload and then
   * insisted no document had been added.
   */
  listProjectDocuments: async (projectId, params = {}) =>
    unwrap(await axiosInstance.get(`${BASE}/projects/${projectId}/documents`, { params })),
  addProjectDocument: async (projectId, body) =>
    unwrap(await axiosInstance.post(`${BASE}/projects/${projectId}/documents`, body))?.document,
  projectDocumentHistory: async (projectId, documentId) =>
    unwrap(await axiosInstance.get(`${BASE}/projects/${projectId}/documents/${documentId}/history`)),
  revokeProjectDocument: async (projectId, documentId, reason) =>
    unwrap(await axiosInstance.post(`${BASE}/projects/${projectId}/documents/${documentId}/revoke`, { reason }))?.document,

  // ---------- Messages (BRD C20) ----------
  listMessages: async (projectId, params = {}) =>
    unwrap(await axiosInstance.get(`${BASE}/projects/${projectId}/messages`, { params })),
  sendMessage: async (projectId, body) =>
    unwrap(await axiosInstance.post(`${BASE}/projects/${projectId}/messages`, body))?.message,
  unreadMessages: async (projectId) =>
    unwrap(await axiosInstance.get(`${BASE}/projects/${projectId}/messages/unread`))?.unread || 0,
  markMessagesRead: async (projectId) =>
    unwrap(await axiosInstance.post(`${BASE}/projects/${projectId}/messages/read`)),
  retractMessage: async (projectId, messageId) =>
    unwrap(await axiosInstance.post(`${BASE}/projects/${projectId}/messages/${messageId}/retract`))?.message,

  // ---------- Disputes (BRD Q15) ----------
  listDisputes: async (projectId) =>
    unwrap(await axiosInstance.get(`${BASE}/projects/${projectId}/disputes`))?.disputes || [],
  raiseDispute: async (projectId, body) =>
    unwrap(await axiosInstance.post(`${BASE}/projects/${projectId}/disputes`, body))?.dispute,
  getDispute: async (disputeId) =>
    unwrap(await axiosInstance.get(`${BASE}/disputes/${disputeId}`)),
  commentOnDispute: async (disputeId, note) =>
    unwrap(await axiosInstance.post(`${BASE}/disputes/${disputeId}/comments`, { note }))?.dispute,
  withdrawDispute: async (disputeId, reason) =>
    unwrap(await axiosInstance.post(`${BASE}/disputes/${disputeId}/withdraw`, { reason }))?.dispute,

  /** BRD W18 — the contractor's own score, with the breakdown and what to fix. */
  getMyScore: async () => unwrap(await axiosInstance.get(`${BASE}/score`))?.score,

  listTemplates: async () => unwrap(await axiosInstance.get(`${BASE}/templates`))?.templates || [],
  deleteTemplate: async (id) => unwrap(await axiosInstance.delete(`${BASE}/templates/${id}`)),
};

export default contractorApi;
