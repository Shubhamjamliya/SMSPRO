import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { ConstructionProject } from '../models/constructionProject.model.js';
import { ProjectDocument } from '../models/projectDocument.model.js';
import { getSettings } from './settings.service.js';
import { notifyDocumentAdded } from './notify.service.js';
import { postSystemMessage } from './message.service.js';

/**
 * The project document vault (BRD C19).
 *
 * The whole design turns on one sentence in the BRD: "these papers are needed
 * years later, for resale, insurance or repairs." That is why nothing is
 * destroyed, why superseding is a link rather than an overwrite, and why the
 * default listing shows current papers while the history stays one tap away.
 */

const alive = { isDeleted: { $ne: true } };

/**
 * Resolve who is asking and confirm they are on this project.
 *
 * Every function here takes the actor rather than trusting an id in the body:
 * a document vault that lets you read another customer's approvals by guessing
 * a project id is worse than no vault at all.
 */
const loadProjectFor = async (projectId, { customerId, contractorId, isAdmin = false } = {}) => {
  const filter = { _id: projectId, ...alive };
  if (customerId) filter.customerId = customerId;
  if (contractorId) filter.contractorId = contractorId;

  const project = await ConstructionProject.findOne(filter).lean();
  // Deliberately the same message whichever way it failed — "not found" and
  // "not yours" must be indistinguishable, or the id space becomes searchable.
  if (!project && !isAdmin) throw new ValidationError('Project not found');
  if (!project && isAdmin) {
    const asAdmin = await ConstructionProject.findOne({ _id: projectId, ...alive }).lean();
    if (!asAdmin) throw new ValidationError('Project not found');
    return asAdmin;
  }
  return project;
};

const actorTypeOf = ({ customerId, contractorId, isAdmin }) => {
  if (isAdmin) return 'ADMIN';
  if (contractorId) return 'CONTRACTOR';
  if (customerId) return 'CUSTOMER';
  throw new ValidationError('Unknown uploader');
};

/**
 * Add a document.
 *
 * `supersedesId` turns this into a revision: the named document is marked
 * superseded and pointed at the new one, and the new row joins its group as the
 * next version. Without it, this starts a fresh group at version 1.
 */
export const addDocument = async (projectId, data, actor = {}) => {
  const project = await loadProjectFor(projectId, actor);
  const settings = await getSettings();

  const documentType = String(data.documentType || '').trim();
  const allowed = settings.documentTypes || [];
  if (!documentType) throw new ValidationError('Choose what kind of document this is');
  if (allowed.length && !allowed.includes(documentType)) {
    throw new ValidationError(
      `"${documentType}" is not one of the document types this platform accepts`,
    );
  }

  const fileUrl = String(data.fileUrl || '').trim();
  if (!fileUrl) throw new ValidationError('Upload the file first');

  const title = String(data.title || '').trim();
  if (!title) throw new ValidationError('Give the document a name');

  const uploadedByType = actorTypeOf(actor);
  const performer = extractPerformer(actor.reqUser) || null;

  let documentGroupId = new mongoose.Types.ObjectId();
  let version = 1;
  let previous = null;

  if (data.supersedesId) {
    previous = await ProjectDocument.findOne({
      _id: data.supersedesId,
      projectId: project._id,
      ...alive,
    });
    if (!previous) throw new ValidationError('The document being replaced was not found');
    if (!previous.isLatest) {
      throw new ValidationError(
        'That version has already been replaced. Replace the current version instead.',
      );
    }
    documentGroupId = previous.documentGroupId;
    version = (previous.version || 1) + 1;
  }

  const document = await ProjectDocument.create({
    projectId: project._id,
    documentType,
    title,
    description: String(data.description || '').trim(),
    fileUrl,
    fileName: String(data.fileName || '').trim(),
    mimeType: String(data.mimeType || '').trim(),
    fileSize: Number(data.fileSize) || 0,
    uploadedByType,
    uploadedBy: performer,
    documentGroupId,
    version,
    isLatest: true,
    visibleToCustomer: data.visibleToCustomer !== false,
  });

  // Only after the new row exists — if creation failed above, the old version
  // must still be the current one.
  if (previous) {
    await ProjectDocument.updateOne(
      { _id: previous._id },
      { $set: { isLatest: false, supersededBy: document._id, supersededAt: new Date() } },
    );
  }

  await recordAudit({
    module: 'construction',
    action: previous ? 'construction.document.superseded' : 'construction.document.added',
    entityType: 'project',
    entityId: project._id,
    performedBy: performer,
    metadata: {
      documentId: String(document._id),
      documentType,
      version,
      supersedes: previous ? String(previous._id) : null,
    },
  });

  // The conversation is the project's narrative; a new drawing belongs in it.
  await postSystemMessage(project._id, {
    systemEvent: previous ? 'DOCUMENT_REVISED' : 'DOCUMENT_ADDED',
    body: previous
      ? `${title} was updated to version ${version}.`
      : `${title} was added to the project documents.`,
    relatedDocumentId: document._id,
  }).catch(() => {});

  await notifyDocumentAdded(project, document, uploadedByType).catch(() => {});

  return document.toObject();
};

/**
 * List the vault.
 *
 * Current versions only by default — the history is real but it is not what
 * someone opening the documents tab wants to wade through.
 */
export const listDocuments = async (projectId, actor = {}, query = {}) => {
  const project = await loadProjectFor(projectId, actor);

  const filter = { projectId: project._id, ...alive };
  if (query.includeSuperseded !== 'true' && query.includeSuperseded !== true) {
    filter.isLatest = true;
  }
  if (query.documentType) filter.documentType = query.documentType;
  // Internal support paperwork stays internal.
  if (!actor.isAdmin && !actor.contractorId) filter.visibleToCustomer = true;

  const documents = await ProjectDocument.find(filter)
    .sort({ documentType: 1, createdAt: -1 })
    .lean();

  const settings = await getSettings();

  // Grouped by type, because "where is the agreement" is the actual question.
  const byType = new Map();
  for (const doc of documents) {
    if (!byType.has(doc.documentType)) byType.set(doc.documentType, []);
    byType.get(doc.documentType).push(doc);
  }

  return {
    documents,
    groups: [...byType.entries()].map(([type, items]) => ({ documentType: type, items })),
    availableTypes: settings.documentTypes || [],
    /** Types the BRD expects that this project has nothing filed under yet. */
    missingTypes: (settings.documentTypes || []).filter((t) => !byType.has(t)),
  };
};

/** One document plus every earlier version of it (BRD C19). */
export const getDocumentHistory = async (projectId, documentId, actor = {}) => {
  const project = await loadProjectFor(projectId, actor);

  const document = await ProjectDocument.findOne({
    _id: documentId,
    projectId: project._id,
    ...alive,
  }).lean();
  if (!document) throw new ValidationError('Document not found');
  if (!actor.isAdmin && !actor.contractorId && document.visibleToCustomer === false) {
    throw new ValidationError('Document not found');
  }

  const versions = await ProjectDocument.find({
    documentGroupId: document.documentGroupId,
    ...alive,
  })
    .sort({ version: -1 })
    .lean();

  return { document, versions };
};

/**
 * Withdraw a document filed in error.
 *
 * Marked, never removed. Only whoever filed it, or support, can withdraw it —
 * a contractor must not be able to make the customer's approval papers vanish.
 */
export const revokeDocument = async (projectId, documentId, reason, actor = {}) => {
  const project = await loadProjectFor(projectId, actor);
  const trimmedReason = String(reason || '').trim();
  if (trimmedReason.length < 5) {
    throw new ValidationError('Say why this document is being withdrawn');
  }

  const document = await ProjectDocument.findOne({
    _id: documentId,
    projectId: project._id,
    ...alive,
  });
  if (!document) throw new ValidationError('Document not found');
  if (document.isRevoked) return document.toObject();

  const actorType = actorTypeOf(actor);
  if (actorType !== 'ADMIN' && document.uploadedByType !== actorType) {
    throw new ValidationError('Only whoever filed this document can withdraw it');
  }

  document.isRevoked = true;
  document.revokedReason = trimmedReason;
  document.revokedAt = new Date();
  await document.save();

  await recordAudit({
    module: 'construction',
    action: 'construction.document.revoked',
    entityType: 'project',
    entityId: project._id,
    performedBy: extractPerformer(actor.reqUser) || null,
    metadata: { documentId: String(document._id), reason: trimmedReason },
  });

  await postSystemMessage(project._id, {
    systemEvent: 'DOCUMENT_REVOKED',
    body: `${document.title} was withdrawn: ${trimmedReason}`,
    relatedDocumentId: document._id,
  }).catch(() => {});

  return document.toObject();
};

/**
 * What the handover pack should contain, and what is missing (BRD C19, C23).
 *
 * Asked at handover, when the customer is about to lose day-to-day contact with
 * the contractor and a missing warranty paper becomes very hard to chase.
 */
export const getDocumentReadiness = async (projectId, actor = {}) => {
  const { missingTypes, groups } = await listDocuments(projectId, actor, {});
  const settings = await getSettings();
  const expected = settings.documentTypes || [];

  return {
    expected,
    filed: groups.map((g) => g.documentType),
    missing: missingTypes,
    isComplete: missingTypes.length === 0,
  };
};
