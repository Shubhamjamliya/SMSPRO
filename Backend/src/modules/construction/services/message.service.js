import { ValidationError } from '../../../core/auth/errors.js';
import { getIO, rooms } from '../../../config/socket.js';
import { logger } from '../../../utils/logger.js';
import { ConstructionProject } from '../models/constructionProject.model.js';
import { ProjectMessage } from '../models/projectMessage.model.js';
/*
 * Mongoose resolves `.populate()` by MODEL NAME at call time, so every model
 * this file populates has to have been imported by SOMETHING before the first
 * request lands. Relying on another module's import chain to have done that is
 * order-dependent: it passes in one entry point and throws MissingSchemaError in
 * another. These imports exist to register the models, even where the binding
 * itself is not referenced below.
 */
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { notifyNewMessage } from './notify.service.js';

/**
 * Project messaging (BRD C20).
 *
 * "A conversation attached to the project, where photos and documents can be
 * shared. Everything is kept permanently."
 *
 * One thread per project, shared by the customer, the contractor and support.
 * Messages cannot be edited or deleted — the model enforces that — because a
 * revisable conversation is worth nothing as a record of what was agreed, which
 * is the entire reason for moving it off WhatsApp.
 */

const alive = { isDeleted: { $ne: true } };
const MESSAGE_ROOM = (projectId) => `construction:project:${projectId}`;

/**
 * Load the project and work out which side is asking.
 *
 * Returns the viewer's role, which decides whose read receipts move and which
 * name is attached to what they send.
 */
const resolveParticipant = async (projectId, { customerId, contractorId, isAdmin = false } = {}) => {
  const project = await ConstructionProject.findOne({ _id: projectId, ...alive })
    .populate('customerId', 'name phone')
    .populate('contractorId', 'businessName ownerName phone')
    .lean();
  if (!project) throw new ValidationError('Project not found');

  const projectCustomerId = String(project.customerId?._id || project.customerId);
  const projectContractorId = String(project.contractorId?._id || project.contractorId);

  if (isAdmin) return { project, role: 'ADMIN', name: 'SMS Pro Support' };

  if (customerId && String(customerId) === projectCustomerId) {
    return { project, role: 'CUSTOMER', name: project.customerId?.name || 'Customer' };
  }
  if (contractorId && String(contractorId) === projectContractorId) {
    return {
      project,
      role: 'CONTRACTOR',
      name: project.contractorId?.businessName || 'Contractor',
    };
  }

  // An enterprise project can carry extra viewers (BRD §5).
  const participant = (project.participants || [])
    .find((p) => String(p.userId) === String(customerId));
  if (participant) {
    return { project, role: 'CUSTOMER', name: participant.name || 'Customer' };
  }

  throw new ValidationError('Project not found');
};

/** Push the message to anyone with the project open. Never throws. */
const broadcast = (projectId, message) => {
  try {
    const io = getIO();
    if (!io) return;
    io.to(MESSAGE_ROOM(projectId)).emit('construction:message', message);
  } catch (error) {
    logger.warn(`[construction] message broadcast failed: ${error.message}`);
  }
};

/** BRD C20 — send a message, optionally with photos or documents attached. */
export const sendMessage = async (projectId, data, actor = {}) => {
  const { project, role, name } = await resolveParticipant(projectId, actor);

  const body = String(data.body || '').trim();
  const attachments = (Array.isArray(data.attachments) ? data.attachments : [])
    .map((a) => (typeof a === 'string'
      ? { url: a.trim(), kind: 'image' }
      : {
        url: String(a?.url || '').trim(),
        kind: a?.kind === 'document' ? 'document' : 'image',
        fileName: String(a?.fileName || '').trim(),
        mimeType: String(a?.mimeType || '').trim(),
        fileSize: Number(a?.fileSize) || 0,
      }))
    .filter((a) => a.url);

  if (!body && attachments.length === 0) {
    throw new ValidationError('Write something, or attach a photo or document');
  }
  if (attachments.length > 10) {
    throw new ValidationError('Attach at most 10 files to one message');
  }

  const senderId = role === 'CONTRACTOR' ? actor.contractorId : actor.customerId;

  const message = await ProjectMessage.create({
    projectId: project._id,
    senderType: role,
    senderId: senderId || null,
    senderName: name,
    body,
    attachments,
    // A message you sent is a message you have read.
    readByCustomerAt: role === 'CUSTOMER' ? new Date() : null,
    readByContractorAt: role === 'CONTRACTOR' ? new Date() : null,
  });

  const plain = message.toObject();
  broadcast(project._id, plain);
  await notifyNewMessage(project, plain, role).catch(() => {});

  return plain;
};

/**
 * Write a message from the platform itself.
 *
 * Used by the stage, document and dispute services so that approvals, releases
 * and disagreements appear inline in the conversation. Best-effort by design:
 * a failed narration must never roll back the payment it was describing.
 */
export const postSystemMessage = async (projectId, {
  systemEvent, body, relatedStageId = null, relatedDocumentId = null, relatedDisputeId = null,
} = {}) => {
  try {
    if (!body) return null;
    const message = await ProjectMessage.create({
      projectId,
      senderType: 'SYSTEM',
      senderName: 'SMS Pro',
      body: String(body).trim(),
      systemEvent: String(systemEvent || '').trim(),
      relatedStageId,
      relatedDocumentId,
      relatedDisputeId,
      // Nobody needs to "read" a system note for it to have been delivered.
      readByCustomerAt: null,
      readByContractorAt: null,
    });
    const plain = message.toObject();
    broadcast(projectId, plain);
    return plain;
  } catch (error) {
    logger.warn(`[construction] system message failed: ${error.message}`);
    return null;
  }
};

/**
 * Read the thread.
 *
 * Paged backwards from newest, because a project that has run for eight months
 * has a long conversation and the useful end is the recent one.
 */
export const listMessages = async (projectId, actor = {}, query = {}) => {
  const { project, role } = await resolveParticipant(projectId, actor);

  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
  const filter = { projectId: project._id };
  if (query.before) filter.createdAt = { $lt: new Date(query.before) };

  const rows = await ProjectMessage.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  // Oldest-first for rendering; the query ran newest-first for the limit.
  const messages = rows.reverse();

  return {
    messages,
    role,
    hasMore: rows.length === limit,
    oldestAt: messages[0]?.createdAt || null,
  };
};

/**
 * Mark everything the OTHER side sent as read.
 *
 * Only their messages: marking your own would make the unread count wrong for
 * them, and system notes are not something either side "reads".
 */
export const markRead = async (projectId, actor = {}) => {
  const { project, role } = await resolveParticipant(projectId, actor);
  if (role === 'ADMIN') return { updated: 0 };

  const field = role === 'CUSTOMER' ? 'readByCustomerAt' : 'readByContractorAt';
  const theirSide = role === 'CUSTOMER' ? 'CONTRACTOR' : 'CUSTOMER';

  const result = await ProjectMessage.updateMany(
    {
      projectId: project._id,
      senderType: { $in: [theirSide, 'ADMIN'] },
      [field]: null,
    },
    { $set: { [field]: new Date() } },
  );

  return { updated: result.modifiedCount || 0 };
};

/** Unread count for a badge. */
export const getUnreadCount = async (projectId, actor = {}) => {
  const { project, role } = await resolveParticipant(projectId, actor);
  if (role === 'ADMIN') return { unread: 0 };

  const field = role === 'CUSTOMER' ? 'readByCustomerAt' : 'readByContractorAt';
  const theirSide = role === 'CUSTOMER' ? 'CONTRACTOR' : 'CUSTOMER';

  const unread = await ProjectMessage.countDocuments({
    projectId: project._id,
    senderType: { $in: [theirSide, 'ADMIN'] },
    [field]: null,
  });

  return { unread };
};

/**
 * Withdraw a message.
 *
 * The row stays and still renders, marked as retracted — the thread is a record,
 * and a record with holes in it is not one. Only the sender can retract, and
 * only their own words.
 */
export const retractMessage = async (projectId, messageId, actor = {}) => {
  const { project, role } = await resolveParticipant(projectId, actor);

  const message = await ProjectMessage.findOne({ _id: messageId, projectId: project._id });
  if (!message) throw new ValidationError('Message not found');
  if (message.senderType === 'SYSTEM') {
    throw new ValidationError('Platform messages cannot be retracted');
  }
  if (message.senderType !== role) {
    throw new ValidationError('You can only retract your own messages');
  }
  if (message.isRetracted) return message.toObject();

  await ProjectMessage.updateOne(
    { _id: message._id },
    { $set: { isRetracted: true, retractedAt: new Date() } },
  );

  const updated = await ProjectMessage.findById(message._id).lean();
  broadcast(project._id, updated);
  return updated;
};

/** Socket room helpers, so the gateway can join a viewer to a project thread. */
export const messageRoomFor = MESSAGE_ROOM;
export { rooms };
