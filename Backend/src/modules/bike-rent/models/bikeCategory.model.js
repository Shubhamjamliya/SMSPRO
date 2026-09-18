import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const bikeCategorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        slug: {
            type: String,
            trim: true,
            lowercase: true,
        },
        icon: {
            type: String,
            default: '',
            trim: true,
        },
        description: {
            type: String,
            default: '',
            trim: true,
            maxlength: 1000,
        },
        defaultSecurityDeposit: {
            type: Number,
            default: 0,
            min: 0,
        },
        displayOrder: {
            type: Number,
            default: 0,
            index: true,
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
            index: true,
        },
        ownerType: {
            type: String,
            enum: ['admin', 'vendor'],
            default: 'admin',
            index: true,
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeVendor',
            default: null,
            index: true,
        },
        /** Vendor-submitted categories require admin approval before use platform-wide */
        approvalStatus: {
            type: String,
            enum: ['approved', 'pending', 'rejected'],
            default: 'approved',
            index: true,
        },
        rejectionReason: { type: String, trim: true, default: '' },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
        reviewedAt: { type: Date, default: null },
        /** Full submit → reject → resubmit → approve trail for vendor-submitted categories */
        approvalHistory: {
            type: [{
                status: { type: String, enum: ['submitted', 'approved', 'rejected', 'resubmitted'] },
                reason: { type: String, trim: true, default: '' },
                changedAt: { type: Date, default: Date.now },
                changedBy: { type: actionPerformerSchema, default: null },
            }],
            default: [],
        },
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: actionPerformerSchema, default: null },
        createdBy: { type: actionPerformerSchema, default: null },
        updatedBy: { type: actionPerformerSchema, default: null },
    },
    {
        collection: 'bike_rent_categories',
        timestamps: true,
    },
);

bikeCategorySchema.index({ isDeleted: 1, status: 1, displayOrder: 1 });
bikeCategorySchema.index({ vendorId: 1, approvalStatus: 1 });
bikeCategorySchema.index(
    { slug: 1 },
// NOTE: partialFilterExpression accepts only equality-style operators. MongoDB
// treats `$ne` as `$not` and REJECTS the whole index spec, which means the index
// is never built and the uniqueness declared here silently does not exist.
// Equivalents that ARE accepted: `isDeleted: false`, `{ $type: 'objectId' }` for
// a present reference, `{ $type: 'string', $gt: '' }` for a non-empty string.
    { unique: true, partialFilterExpression: { isDeleted: false, slug: { $type: 'string' } } },
);

export const BikeCategory = mongoose.models.BikeCategory
    || mongoose.model('BikeCategory', bikeCategorySchema, 'bike_rent_categories');
