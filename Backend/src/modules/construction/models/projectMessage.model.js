import mongoose from 'mongoose';

/**
 * ProjectMessage — the conversation attached to a project (BRD C20).
 *
 * "A conversation attached to the project, where photos and documents can be
 * shared. Everything is kept permanently. Keeps important decisions inside the
 * project record instead of scattered across personal WhatsApp."
 *
 * There is no chat system anywhere else in this repo, in any module, so this is
 * built from scratch. Three decisions worth defending:
 *
 *   PERMANENT, and that means immutable. No edit, no delete. A conversation you
 *   can quietly revise is worthless as a record of what was agreed — which is
 *   the entire reason the BRD wants the conversation off WhatsApp and into the
 *   project. A message sent in error is retracted (marked, still visible as
 *   "retracted"), never erased.
 *
 *   A THREAD PER PROJECT, not per person. Construction decisions involve the
 *   customer, the contractor and sometimes support; splitting them into private
 *   pairs is how a decision ends up known to two people and disputed by three.
 *   Support messages are visible to both sides by design.
 *
 *   SYSTEM MESSAGES SHARE THE TIMELINE. "Stage 2 approved, ₹95,000 released"
 *   sits inline with the conversation, so reading the thread tells you what
 *   happened and what was said about it, in one pass.
 */
const messageAttachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    kind: {
      type: String,
      enum: ['image', 'document'],
      default: 'image',
    },
    fileName: { type: String, default: '', trim: true, maxlength: 300 },
    mimeType: { type: String, default: '', trim: true },
    fileSize: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const projectMessageSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionProject',
      required: true,
      index: true,
    },

    /**
     * SYSTEM rows are written by the platform itself — a stage approval, a
     * payment release, a dispute opening. They have no sender.
     */
    senderType: {
      type: String,
      enum: ['CUSTOMER', 'CONTRACTOR', 'ADMIN', 'SYSTEM'],
      required: true,
      index: true,
    },
    senderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    senderName: { type: String, default: '', trim: true, maxlength: 120 },

    body: { type: String, default: '', trim: true, maxlength: 4000 },
    attachments: { type: [messageAttachmentSchema], default: [] },

    /** Ties a system message to what it is about, so the UI can link to it. */
    systemEvent: { type: String, default: '', trim: true, maxlength: 60 },
    relatedStageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectStage',
      default: null,
    },
    relatedDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectDocument',
      default: null,
    },
    relatedDisputeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectDispute',
      default: null,
    },

    /**
     * Read tracking, per side rather than per person.
     *
     * Construction has two parties and occasionally support; a per-user read
     * receipt table would be a lot of rows to answer a question nobody asks.
     * "Has the other side seen it" is what actually matters here.
     */
    readByCustomerAt: { type: Date, default: null },
    readByContractorAt: { type: Date, default: null },

    /**
     * Withdrawn by the sender. The row survives and still renders, marked, so
     * the thread cannot be silently rewritten.
     */
    isRetracted: { type: Boolean, default: false },
    retractedAt: { type: Date, default: null },
  },
  {
    collection: 'construction_project_messages',
    timestamps: true,
  },
);

// The thread itself, newest-last paging.
projectMessageSchema.index({ projectId: 1, createdAt: -1 });
// Unread counts for the customer and the contractor.
projectMessageSchema.index({ projectId: 1, senderType: 1, readByCustomerAt: 1 });
projectMessageSchema.index({ projectId: 1, senderType: 1, readByContractorAt: 1 });

/**
 * A message must carry something. An empty row with no text and no attachment is
 * a UI bug reaching the database, and it clutters a permanent record.
 */
projectMessageSchema.pre('validate', function guardEmpty(next) {
  const hasText = String(this.body || '').trim().length > 0;
  const hasAttachment = Array.isArray(this.attachments) && this.attachments.length > 0;
  if (!hasText && !hasAttachment) {
    return next(new Error('A message needs either text or an attachment'));
  }
  return next();
});

/**
 * Permanent means permanent — but not frozen.
 *
 * What must never change is what was SAID: the body, the attachments, who sent
 * it and when. What legitimately changes afterwards is bookkeeping — read
 * receipts, and the retraction flag. So rather than banning updates outright
 * (which would make read tracking impossible) or allowing them freely (which
 * would make the record worthless), the hook names the fields that may move.
 */
const MUTABLE_FIELDS = new Set([
  'readByCustomerAt',
  'readByContractorAt',
  'isRetracted',
  'retractedAt',
  'updatedAt',
]);

const guardUpdate = function guardUpdate(next) {
  const update = this.getUpdate() || {};
  const touched = new Set();
  for (const [operator, payload] of Object.entries(update)) {
    // `$setOnInsert` only takes effect when a NEW row is created, which is a
    // send, not an edit. Mongoose adds `createdAt` here on every update when
    // `timestamps` is on, so treating it as a mutation would block read
    // receipts entirely.
    if (operator === '$setOnInsert') continue;
    if (operator.startsWith('$')) {
      Object.keys(payload || {}).forEach((field) => touched.add(field));
    } else {
      touched.add(operator);
    }
  }

  const forbidden = [...touched].filter((field) => !MUTABLE_FIELDS.has(field));
  if (forbidden.length) {
    return next(new Error(
      `Project messages are a permanent record: ${forbidden.join(', ')} cannot be changed. `
      + 'Retract the message and send a correction instead.',
    ));
  }
  return next();
};

const refuseDelete = function refuseDelete(next) {
  next(new Error(
    'Project messages are a permanent record and cannot be deleted. '
    + 'Retract the message instead.',
  ));
};

projectMessageSchema.pre('updateOne', guardUpdate);
projectMessageSchema.pre('updateMany', guardUpdate);
projectMessageSchema.pre('findOneAndUpdate', guardUpdate);
projectMessageSchema.pre('deleteOne', refuseDelete);
projectMessageSchema.pre('deleteMany', refuseDelete);
projectMessageSchema.pre('findOneAndDelete', refuseDelete);

/** Re-saving a loaded document must not rewrite what was said either. */
projectMessageSchema.pre('save', function guardResave(next) {
  if (this.isNew) return next();
  const changed = this.modifiedPaths().filter((path) => !MUTABLE_FIELDS.has(path));
  if (changed.length) {
    return next(new Error(
      `Project messages are a permanent record: ${changed.join(', ')} cannot be changed.`,
    ));
  }
  return next();
});

export const ProjectMessage = mongoose.models.ProjectMessage
  || mongoose.model('ProjectMessage', projectMessageSchema);

export { projectMessageSchema };
