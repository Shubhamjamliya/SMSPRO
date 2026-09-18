import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const bikeAuditLogSchema = new mongoose.Schema(
    {
        entityType: {
            type: String,
            enum: [
                'zone', 'category', 'bike', 'pricing', 'booking', 'settings', 'vendor_settings',
                'tax_settings', 'vendor_tax_profile', 'settlement', 'monthly_settlement',
                'finance_transaction',
            ],
            required: true,
            index: true,
        },
        entityId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            index: true,
        },
        action: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        before: { type: mongoose.Schema.Types.Mixed, default: null },
        after: { type: mongoose.Schema.Types.Mixed, default: null },
        performedBy: { type: actionPerformerSchema, default: null },
        meta: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    {
        collection: 'bike_rent_audit_logs',
        timestamps: true,
    },
);

bikeAuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
bikeAuditLogSchema.index({ action: 1, createdAt: -1 });
bikeAuditLogSchema.index({ createdAt: -1 });

export const BikeAuditLog = mongoose.models.BikeAuditLog
    || mongoose.model('BikeAuditLog', bikeAuditLogSchema, 'bike_rent_audit_logs');
