import mongoose from 'mongoose';
import { FoodNotification } from '../../../core/notifications/models/notification.model.js';
import { notifyOwnerSafely, notifyAdminsSafely } from '../../../core/notifications/firebase.service.js';
import { FoodAdmin } from '../../../core/admin/admin.model.js';
import { getIO, rooms } from '../../../config/socket.js';
import { logger } from '../../../utils/logger.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';

/**
 * Construction notifications — inbox row, live socket event, and a push.
 *
 * The whole pipeline rests on people being told things promptly: BRD W7 says
 * "a fast decline is far better for the customer than a slow non-answer", and a
 * contractor cannot decline quickly if nobody tells them a lead arrived.
 *
 * Every send is BEST EFFORT and never throws. A failed push must not roll back
 * an accepted lead or a sent quotation — the business event already happened,
 * and losing the notification is far less bad than losing the event.
 */
const ROOM_BY_OWNER = {
  USER: (id) => rooms.user(id),
  CONTRACTOR: (id) => rooms.contractor(id),
  SERVICE_PROVIDER: (id) => rooms.provider(id),
  DELIVERY_PARTNER: (id) => rooms.delivery(id),
  RESTAURANT: (id) => rooms.restaurant(id),
};

/**
 * @param {object} params
 * @param {'USER'|'CONTRACTOR'} params.ownerType
 * @param {string} params.ownerId
 * @param {string} params.source   one of the construction values on the model enum
 * @param {string} params.title
 * @param {string} params.message
 * @param {string} [params.link]   deep link into the right screen
 * @param {object} [params.metadata]
 */
export const notify = async ({
  ownerType, ownerId, source, title, message, link = '', metadata = {},
}) => {
  if (!ownerType || !ownerId || !title || !message) return null;

  const payloadMeta = { module: 'construction', ...metadata };
  let row = null;

  try {
    row = await FoodNotification.create({
      ownerType,
      ownerId,
      title: String(title).trim(),
      message: String(message).trim(),
      link: String(link || '').trim(),
      category: 'construction',
      source,
      // The collection has a unique compound index on
      // { broadcastId, ownerType, ownerId }. Leaving this unset stores it as
      // null, so the SECOND construction notification to the same owner is
      // rejected as a duplicate and their inbox silently stops updating.
      // A fresh id per notification keeps each row distinct, which is what the
      // core notification service does for the same reason.
      broadcastId: new mongoose.Types.ObjectId(),
      metadata: payloadMeta,
    });
  } catch (error) {
    logger.warn(`[construction] inbox write failed: ${error.message}`);
  }

  // Live update for anyone with the app open.
  try {
    const io = getIO();
    const room = ROOM_BY_OWNER[ownerType]?.(ownerId);
    if (io && room) {
      io.to(room).emit('construction:notification', {
        module: 'construction',
        source,
        title,
        message,
        link,
        metadata: payloadMeta,
        createdAt: new Date(),
      });
    }
  } catch (error) {
    logger.warn(`[construction] socket emit failed: ${error.message}`);
  }

  // Push, for anyone who does not.
  await notifyOwnerSafely(
    { ownerType, ownerId },
    { title, body: message, data: { module: 'construction', source, link, ...stringifyMeta(payloadMeta) } },
  );

  return row;
};

/**
 * Tell the office something needs a person — a push to every active admin plus a live
 * event for any admin who has the panel open. The notification inbox does not hold
 * ADMIN rows, so this is push and socket only. Best effort like everything here.
 */
export const notifyAdmins = async ({ source, title, message, link = '', metadata = {} }) => {
  if (!title || !message) return;
  const payloadMeta = { module: 'construction', ...metadata };

  try {
    const io = getIO();
    if (io) {
      const admins = await FoodAdmin.find({ isActive: true }).select('_id').lean();
      const event = { module: 'construction', source, title, message, link, metadata: payloadMeta, createdAt: new Date() };
      admins.forEach((a) => io.to(rooms.admin(a._id)).emit('construction:notification', event));
    }
  } catch (error) {
    logger.warn(`[construction] admin socket emit failed: ${error.message}`);
  }

  await notifyAdminsSafely({
    title,
    body: message,
    data: { module: 'construction', source, link, ...stringifyMeta(payloadMeta) },
  });
};

// ---------- The contractor's notification inbox ----------

const INBOX_LIMIT = 40;

/** Recent notifications for one contractor, newest first, with how many are unread. */
export const listInbox = async (contractorId) => {
  const mine = { ownerType: 'CONTRACTOR', ownerId: contractorId, dismissedAt: null };
  const [rows, unread] = await Promise.all([
    FoodNotification.find(mine)
      .select('title message link source isRead createdAt metadata')
      .sort({ createdAt: -1 })
      .limit(INBOX_LIMIT)
      .lean(),
    FoodNotification.countDocuments({ ...mine, isRead: false }),
  ]);
  return {
    unread,
    notifications: rows.map((n) => ({
      id: String(n._id),
      title: n.title,
      message: n.message,
      link: n.link || '',
      source: n.source,
      isRead: Boolean(n.isRead),
      createdAt: n.createdAt,
    })),
  };
};

/** Mark one notification read, or every one of this contractor's when no id is given. */
export const markInboxRead = async (contractorId, notificationId = null) => {
  const filter = { ownerType: 'CONTRACTOR', ownerId: contractorId, isRead: false };
  if (notificationId) filter._id = notificationId;
  await FoodNotification.updateMany(filter, { $set: { isRead: true, readAt: new Date() } });
  return listInbox(contractorId);
};

/**
 * Clear the whole inbox. Mirrors the core notification service's
 * `dismissAllNotifications` (`core/notifications/notification.service.js`) —
 * construction has its own bespoke inbox rather than that generic one because
 * the CONTRACTOR role is not wired into the shared `/food/notifications`
 * routes — but the same `dismissedAt` field is what `listInbox` already
 * filters on, so a cleared row simply stops being returned.
 */
export const dismissAllInbox = async (contractorId) => {
  const now = new Date();
  await FoodNotification.updateMany(
    { ownerType: 'CONTRACTOR', ownerId: contractorId, dismissedAt: null },
    { $set: { dismissedAt: now, isRead: true, readAt: now } },
  );
  return listInbox(contractorId);
};

/** FCM data payloads must be flat strings. */
const stringifyMeta = (meta = {}) => Object.fromEntries(
  Object.entries(meta)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .map(([k, v]) => [k, String(v)]),
);

const contractorOwnerId = (contractorId) => String(contractorId);

// ---------- Pipeline events ----------

/** BRD W6 — a genuine lead reached a contractor. */
export const notifyNewLead = async ({ contractorId, enquiry, expiresAt }) => notify({
  ownerType: 'CONTRACTOR',
  ownerId: contractorOwnerId(contractorId),
  source: 'NEW_LEAD',
  title: 'New enquiry for you',
  message: `${enquiry.serviceName || 'Construction work'} in ${enquiry.city || 'your area'}`
    + (expiresAt ? ` — reply within ${Math.max(1, Math.round((new Date(expiresAt) - Date.now()) / 3600000))}h` : ''),
  link: '/contractor/leads',
  metadata: { enquiryId: String(enquiry.id), enquiryNumber: enquiry.enquiryNumber },
});

/** A contractor took the enquiry on — the customer now has someone. */
export const notifyLeadAccepted = async ({ customerId, contractorName, enquiry }) => notify({
  ownerType: 'USER',
  ownerId: String(customerId),
  source: 'NEW_LEAD',
  title: 'A contractor has taken on your enquiry',
  message: `${contractorName} is ready to visit your site and quote.`,
  link: `/construction/enquiries/${enquiry.id}`,
  metadata: { enquiryId: String(enquiry.id), enquiryNumber: enquiry.enquiryNumber },
});

/** BRD C9 / W8 — a visit was proposed and needs the other side to confirm. */
export const notifyVisitProposed = async ({ toOwnerType, toOwnerId, byName, scheduledAt, enquiry, visitId }) => notify({
  ownerType: toOwnerType,
  ownerId: String(toOwnerId),
  source: 'SITE_VISIT_REMINDER',
  title: 'Site visit proposed',
  message: `${byName} suggested ${new Date(scheduledAt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })}. Confirm if that works.`,
  link: toOwnerType === 'USER'
    ? `/construction/enquiries/${enquiry.id}`
    : '/contractor/visits',
  metadata: { enquiryId: String(enquiry.id), visitId: String(visitId) },
});

export const notifyVisitConfirmed = async ({ toOwnerType, toOwnerId, scheduledAt, enquiry, visitId }) => notify({
  ownerType: toOwnerType,
  ownerId: String(toOwnerId),
  source: 'SITE_VISIT_REMINDER',
  title: 'Site visit confirmed',
  message: `Confirmed for ${new Date(scheduledAt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })}.`,
  link: toOwnerType === 'USER'
    ? `/construction/enquiries/${enquiry.id}`
    : '/contractor/visits',
  metadata: { enquiryId: String(enquiry.id), visitId: String(visitId) },
});

/** BRD C10 — the quote is in the app. */
export const notifyQuotationSent = async ({ customerId, contractorName, quotation, enquiry }) => notify({
  ownerType: 'USER',
  ownerId: String(customerId),
  source: 'QUOTATION_RECEIVED',
  title: `Quotation from ${contractorName}`,
  message: `₹${Number(quotation.total).toLocaleString('en-IN')} — every item priced, with what is and is not included.`,
  link: `/construction/quotations/${quotation.id}`,
  metadata: {
    enquiryId: String(enquiry.id),
    quotationId: String(quotation.id),
    quotationNumber: quotation.quotationNumber,
    total: quotation.total,
  },
});

/** BRD C12 — the customer asked something, or wants changes. */
export const notifyQuotationQuery = async ({ contractorId, quotation, kind }) => notify({
  ownerType: 'CONTRACTOR',
  ownerId: contractorOwnerId(contractorId),
  source: 'QUOTATION_RECEIVED',
  title: kind === 'revision' ? 'Customer requested changes' : 'Customer asked a question',
  message: kind === 'revision'
    ? `They would like a revised version of ${quotation.quotationNumber}.`
    : `A question was raised against ${quotation.quotationNumber}.`,
  link: `/contractor/quotations/${quotation.id}`,
  metadata: { quotationId: String(quotation.id), quotationNumber: quotation.quotationNumber },
});

/**
 * BRD C13 — the turning point, but only the customer's half of it. The
 * quotation is locked at this price now; the contractor still has to
 * confirm before it becomes their project (see `notifyProjectStarted`).
 */
export const notifyQuotationAccepted = async ({ contractorId, quotation, enquiry }) => notify({
  ownerType: 'CONTRACTOR',
  ownerId: contractorOwnerId(contractorId),
  source: 'QUOTATION_RECEIVED',
  title: 'Customer accepted your quotation',
  message: `${quotation.quotationNumber} accepted at ₹${Number(quotation.total).toLocaleString('en-IN')}. `
    + 'Confirm it to start the project.',
  link: `/contractor/quotations/${quotation.id}`,
  metadata: {
    quotationId: String(quotation.id),
    enquiryId: String(enquiry.id),
    total: quotation.total,
  },
});

/** The contractor confirmed — the enquiry is now a live project. */
export const notifyProjectStarted = async ({ customerId, contractorName, quotation, projectId }) => notify({
  ownerType: 'USER',
  ownerId: String(customerId),
  source: 'PROJECT_STATUS',
  title: 'Your project has started',
  message: `${contractorName} confirmed ${quotation.quotationNumber}. Fund the first stage to get moving.`,
  link: projectId ? `/construction/projects/${projectId}` : `/construction/quotations/${quotation.id}`,
  metadata: { quotationId: String(quotation.id), projectId: projectId ? String(projectId) : '' },
});

/** The contractor could not take it on after all — the customer needs to know before they wait on it. */
export const notifyContractorDeclinedAcceptance = async ({ customerId, quotation, reason }) => notify({
  ownerType: 'USER',
  ownerId: String(customerId),
  source: 'QUOTATION_RECEIVED',
  title: 'Contractor could not take on this project',
  message: reason
    ? `${quotation.quotationNumber} — ${reason}`
    : `The contractor was unable to confirm ${quotation.quotationNumber}. Contact them or ask for a fresh quote.`,
  link: `/construction/quotations/${quotation.id}`,
  metadata: { quotationId: String(quotation.id) },
});

export const notifyQuotationRejected = async ({ contractorId, quotation, reason }) => notify({
  ownerType: 'CONTRACTOR',
  ownerId: contractorOwnerId(contractorId),
  source: 'QUOTATION_RECEIVED',
  title: 'Quotation not taken forward',
  message: reason
    ? `${quotation.quotationNumber} was declined — ${reason}`
    : `${quotation.quotationNumber} was declined.`,
  link: `/contractor/quotations/${quotation.id}`,
  metadata: { quotationId: String(quotation.id) },
});

/** Rule 6 — a licence is about to lapse. */
export const notifyDocumentExpiring = async ({ contractorId, documentLabel, expiresAt, daysLeft }) => notify({
  ownerType: 'CONTRACTOR',
  ownerId: contractorOwnerId(contractorId),
  source: 'DOCUMENT_EXPIRY',
  title: 'A document is about to expire',
  message: `${documentLabel} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. `
    + 'Upload a current copy to keep receiving work.',
  link: '/contractor/status',
  metadata: { expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null },
});

/** BRD A2 / W4 — the verification decision. */
export const notifyContractorDecision = async ({ contractorId, approved, reason }) => notify({
  ownerType: 'CONTRACTOR',
  ownerId: contractorOwnerId(contractorId),
  source: 'PROJECT_STATUS',
  title: approved ? 'You are verified' : 'Your registration needs attention',
  message: approved
    ? 'Customers can now see your verified badge, and enquiries will start reaching you.'
    : reason || 'Please review the reason and resubmit.',
  link: approved ? '/contractor/dashboard' : '/contractor/register',
  metadata: { approved: Boolean(approved) },
});

/** Look up a contractor's display name without every caller re-querying. */
export const contractorName = async (contractorId) => {
  const c = await ContractorProfile.findById(contractorId).select('businessName').lean();
  return c?.businessName || 'Your contractor';
};

// ==================== Phase 6 — transparency (C19, C20, Q15) ====================

/**
 * A new document in the vault (BRD C19).
 *
 * Only the OTHER side is told. Telling someone about the file they just uploaded
 * is the fastest way to teach them to ignore notifications from this module.
 */
export const notifyDocumentAdded = async (project, document, uploadedByType) => {
  const targets = [];
  if (uploadedByType !== 'CUSTOMER') {
    targets.push({ ownerType: 'USER', ownerId: project.customerId, link: `/construction/projects/${project._id}/documents` });
  }
  if (uploadedByType !== 'CONTRACTOR') {
    targets.push({ ownerType: 'CONTRACTOR', ownerId: project.contractorId, link: `/contractor/projects/${project._id}/documents` });
  }

  await Promise.all(targets.map((t) => notify({
    ownerType: t.ownerType,
    ownerId: t.ownerId,
    source: 'PROJECT_STATUS',
    title: 'New project document',
    message: `${document.title} was added to ${project.projectNumber}.`,
    link: t.link,
    metadata: {
      projectId: String(project._id),
      documentId: String(document._id),
      documentType: document.documentType,
    },
  })));
};

/**
 * A new message on the project (BRD C20).
 *
 * Only the other side, and the body is truncated — a push notification carrying
 * the whole of a 4,000-character message is unreadable on a lock screen and
 * leaks the conversation to anyone glancing at the phone.
 */
export const notifyNewMessage = async (project, message, senderRole) => {
  const preview = message.body
    ? `${String(message.body).slice(0, 120)}${message.body.length > 120 ? '…' : ''}`
    : `Sent ${message.attachments?.length || 0} attachment(s)`;

  const targets = [];
  if (senderRole !== 'CUSTOMER') {
    targets.push({ ownerType: 'USER', ownerId: project.customerId, link: `/construction/projects/${project._id}/messages` });
  }
  if (senderRole !== 'CONTRACTOR') {
    targets.push({ ownerType: 'CONTRACTOR', ownerId: project.contractorId, link: `/contractor/projects/${project._id}/messages` });
  }

  await Promise.all(targets.map((t) => notify({
    ownerType: t.ownerType,
    ownerId: t.ownerId,
    source: 'PROJECT_STATUS',
    title: message.senderName || 'New message',
    message: preview,
    link: t.link,
    metadata: { projectId: String(project._id), messageId: String(message._id) },
  })));
};

/**
 * A dispute was raised (BRD Q15).
 *
 * Both sides are told, in different words. The party who raised it needs to know
 * it landed and what happens next; the other party needs to know their payment
 * is frozen and why, because discovering that silently is how a disagreement
 * turns into a phone call.
 */
export const notifyDisputeRaised = async (project, dispute, raisedBy) => {
  const frozen = Number(dispute.frozenAmount) || 0;
  const frozenText = frozen > 0
    ? ` ₹${frozen.toLocaleString('en-IN')} is held while we review it.`
    : '';

  await Promise.all([
    notify({
      ownerType: 'USER',
      ownerId: project.customerId,
      source: 'PROJECT_STATUS',
      title: raisedBy === 'CUSTOMER' ? 'Your dispute was recorded' : 'A dispute was raised on your project',
      message: raisedBy === 'CUSTOMER'
        ? `Dispute ${dispute.disputeNumber} is with our team.${frozenText}`
        : `Your contractor raised dispute ${dispute.disputeNumber}.${frozenText}`,
      link: `/construction/projects/${project._id}/disputes/${dispute._id}`,
      metadata: { projectId: String(project._id), disputeId: String(dispute._id) },
    }),
    notify({
      ownerType: 'CONTRACTOR',
      ownerId: project.contractorId,
      source: 'PROJECT_STATUS',
      title: raisedBy === 'CONTRACTOR' ? 'Your dispute was recorded' : 'A dispute was raised on your project',
      message: raisedBy === 'CONTRACTOR'
        ? `Dispute ${dispute.disputeNumber} is with our team.${frozenText}`
        : `The customer raised dispute ${dispute.disputeNumber}.${frozenText}`,
      link: `/contractor/projects/${project._id}/disputes/${dispute._id}`,
      metadata: { projectId: String(project._id), disputeId: String(dispute._id) },
    }),
  ]);
};

/** The decision, and what it did to the money (BRD Q15). */
export const notifyDisputeResolved = async (project, dispute) => {
  const toContractor = Number(dispute.amountToContractor) || 0;
  const toCustomer = Number(dispute.amountToCustomer) || 0;

  const summary = dispute.outcome === 'dismissed'
    ? 'No change to the payment — work continues.'
    : `₹${toContractor.toLocaleString('en-IN')} released to the contractor, `
      + `₹${toCustomer.toLocaleString('en-IN')} returned to the customer.`;

  await Promise.all([
    notify({
      ownerType: 'USER',
      ownerId: project.customerId,
      source: 'PROJECT_STATUS',
      title: `Dispute ${dispute.disputeNumber} resolved`,
      message: summary,
      link: `/construction/projects/${project._id}/disputes/${dispute._id}`,
      metadata: { projectId: String(project._id), disputeId: String(dispute._id), outcome: dispute.outcome },
    }),
    notify({
      ownerType: 'CONTRACTOR',
      ownerId: project.contractorId,
      source: 'PROJECT_STATUS',
      title: `Dispute ${dispute.disputeNumber} resolved`,
      message: summary,
      link: `/contractor/projects/${project._id}/disputes/${dispute._id}`,
      metadata: { projectId: String(project._id), disputeId: String(dispute._id), outcome: dispute.outcome },
    }),
  ]);
};
