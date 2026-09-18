import mongoose from 'mongoose';
import { actionPerformerSchema } from '../models/actionPerformer.schema.js';

/**
 * PlatformAuditLog — an unchangeable record of every significant action, by
 * anyone, including platform staff.
 *
 * Promoted to core from the proven `bike_rent_audit_logs` shape, which has been
 * running in production since bike-rent shipped. The difference is scope: this
 * one is module-agnostic, so a dispute over a construction project can be
 * answered from the same place as a bike-rent settlement query.
 *
 * Writes are append-only and enforced at the schema level. Nothing in the
 * application may edit or delete a row — that is the entire point of the
 * collection, and it is what makes holding customer money defensible.
 */
const auditLogSchema = new mongoose.Schema(
    {
        /** Owning module: 'construction' | 'food' | 'bikeRent' | 'core' | … */
        module: { type: String, required: true, trim: true, index: true },

        /** What was acted on, e.g. 'project' | 'quotation' | 'stage' | 'contractor'. */
        entityType: { type: String, required: true, trim: true, index: true },
        entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

        /** Verb, e.g. 'quotation.sent' | 'stage.approved' | 'payment.released'. */
        action: { type: String, required: true, trim: true, index: true },

        /** State snapshots. Keep them small — diffs, not whole documents. */
        before: { type: mongoose.Schema.Types.Mixed, default: null },
        after: { type: mongoose.Schema.Types.Mixed, default: null },

        /** BRD Rule 4 — who did it, and when. */
        performedBy: { type: actionPerformerSchema, default: null },

        /** Free-form context: reason text, amounts, ip, request id. */
        meta: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { collection: 'platform_audit_logs', timestamps: true },
);

auditLogSchema.index({ module: 1, entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ module: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

const rejectMutation = (operation) => function blockMutation(next) {
    next(new Error(`platform_audit_logs is append-only — ${operation} is not permitted.`));
};

auditLogSchema.pre('updateOne', { document: false, query: true }, rejectMutation('updateOne'));
auditLogSchema.pre('updateMany', { document: false, query: true }, rejectMutation('updateMany'));
auditLogSchema.pre('findOneAndUpdate', rejectMutation('findOneAndUpdate'));
auditLogSchema.pre('replaceOne', { document: false, query: true }, rejectMutation('replaceOne'));
auditLogSchema.pre('deleteOne', { document: false, query: true }, rejectMutation('deleteOne'));
auditLogSchema.pre('deleteMany', { document: false, query: true }, rejectMutation('deleteMany'));
auditLogSchema.pre('findOneAndDelete', rejectMutation('findOneAndDelete'));
auditLogSchema.pre('findOneAndReplace', rejectMutation('findOneAndReplace'));

auditLogSchema.pre('save', function blockResave(next) {
    if (!this.isNew) {
        return next(new Error('platform_audit_logs rows are immutable once written.'));
    }
    next();
});

export const PlatformAuditLog = mongoose.models.PlatformAuditLog
    || mongoose.model('PlatformAuditLog', auditLogSchema, 'platform_audit_logs');
