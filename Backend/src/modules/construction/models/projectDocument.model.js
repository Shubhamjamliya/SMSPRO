import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * ProjectDocument — the project's paper trail (BRD C19).
 *
 * "All project papers in one organised place — drawings, agreements, approvals,
 * bills, warranty papers. Older versions are kept and clearly marked as
 * superseded. These papers are needed years later, for resale, insurance or
 * repairs."
 *
 * Two things follow from "needed years later", and they drive the whole design:
 *
 *   Nothing is ever really deleted. A revoked document is marked, not removed.
 *   A drawing that was superseded three revisions ago is exactly what settles an
 *   argument about what was agreed, and the customer who deletes it in a tidying
 *   mood in year one is the customer who needs it in year four.
 *
 *   Supersede is a LINK, not an overwrite. Uploading revision C marks revision B
 *   superseded and points B at C. The chain stays walkable in both directions,
 *   so "show me every version of the structural drawing" is one query rather
 *   than a guess based on filenames.
 *
 * Document types come from module settings (BRD Q16), not from an enum here —
 * the client is still confirming the list, and a schema enum would mean a
 * release every time they add one.
 */
const projectDocumentSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionProject',
      required: true,
      index: true,
    },

    /** Free text validated against settings.documentTypes at the service layer. */
    documentType: { type: String, required: true, trim: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },

    fileUrl: { type: String, required: true, trim: true },
    fileName: { type: String, default: '', trim: true, maxlength: 300 },
    mimeType: { type: String, default: '', trim: true },
    fileSize: { type: Number, default: 0, min: 0 },

    /**
     * Who put it there. Both sides upload: the contractor files drawings and
     * completion certificates, the customer files approvals and their own
     * paperwork, and support files anything that arrives by other means.
     */
    uploadedByType: {
      type: String,
      enum: ['CUSTOMER', 'CONTRACTOR', 'ADMIN'],
      required: true,
    },
    uploadedBy: { type: actionPerformerSchema, default: null },

    /**
     * Version chain (BRD C19).
     * `version` counts within a `documentGroupId`. The first upload creates the
     * group and is version 1; every revision joins that group.
     */
    documentGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    version: { type: Number, default: 1, min: 1 },
    isLatest: { type: Boolean, default: true, index: true },
    supersededBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectDocument',
      default: null,
    },
    supersededAt: { type: Date, default: null },

    /**
     * Visible to the customer.
     *
     * Defaults to true, because a project document the customer cannot see
     * defeats the point of the vault. The flag exists for the narrow case of
     * internal support paperwork attached to a dispute.
     */
    visibleToCustomer: { type: Boolean, default: true },

    /**
     * A document withdrawn as wrong — not deleted, marked. Kept because "this
     * was filed and later withdrawn" is itself part of the record.
     */
    isRevoked: { type: Boolean, default: false },
    revokedReason: { type: String, default: '', trim: true, maxlength: 500 },
    revokedAt: { type: Date, default: null },

    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'construction_project_documents',
    timestamps: true,
  },
);

// The vault view: newest first, grouped by type.
projectDocumentSchema.index({ projectId: 1, documentType: 1, createdAt: -1 });
// "Current papers only" — the default view for both sides.
projectDocumentSchema.index({ projectId: 1, isLatest: 1, isDeleted: 1 });
// Walking one document's revision history.
projectDocumentSchema.index({ documentGroupId: 1, version: -1 });

export const ProjectDocument = mongoose.models.ProjectDocument
  || mongoose.model('ProjectDocument', projectDocumentSchema);

export { projectDocumentSchema };
