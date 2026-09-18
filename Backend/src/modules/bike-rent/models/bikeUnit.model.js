import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const docSchema = new mongoose.Schema(
    {
        url: { type: String, default: '', trim: true },
        publicId: { type: String, default: '', trim: true },
        uploadedAt: { type: Date, default: null },
    },
    { _id: false },
);

const bikeUnitSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, index: true },
        brand: { type: String, required: true, trim: true, index: true },
        model: { type: String, required: true, trim: true },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeCategory',
            required: true,
            index: true,
        },
        registrationNumber: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },
        engineNumber: { type: String, default: '', trim: true },
        chassisNumber: { type: String, default: '', trim: true },
        fuelType: {
            type: String,
            enum: ['petrol', 'diesel', 'electric', 'hybrid', 'cng', 'other'],
            default: 'petrol',
            index: true,
        },
        transmission: {
            type: String,
            enum: ['manual', 'automatic', 'cvt', 'other'],
            default: 'manual',
        },
        seatingCapacity: { type: Number, default: 2, min: 1, max: 10 },
        helmetIncluded: { type: Boolean, default: true },
        description: { type: String, default: '', trim: true, maxlength: 5000 },
        /** Documents the customer must carry at pickup (admin-configured). */
        requiredDocuments: {
            type: [{ type: String, trim: true, maxlength: 200 }],
            default: [],
        },
        /**
         * Optional per-bike policy override — highest priority in the settings hierarchy
         * (bike > vendor > platform default). Sparse object of the same overridable keys as
         * BikeVendor.settings; null/empty means this bike just inherits the vendor/platform value.
         */
        settingsOverride: { type: mongoose.Schema.Types.Mixed, default: null },
        images: {
            type: [{
                url: { type: String, required: true, trim: true },
                publicId: { type: String, default: '', trim: true },
                isPrimary: { type: Boolean, default: false },
            }],
            default: [],
        },
        rcDoc: { type: docSchema, default: () => ({}) },
        insuranceDoc: { type: docSchema, default: () => ({}) },
        pucDoc: { type: docSchema, default: () => ({}) },
        hourlyPrice: { type: Number, required: true, min: 0 },
        dailyPrice: { type: Number, required: true, min: 0 },
        weeklyPrice: { type: Number, required: true, min: 0, default: 0 },
        securityDeposit: { type: Number, required: true, min: 0 },
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeRentZone',
            required: true,
            index: true,
        },
        hubId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeRentHub',
            default: null,
            index: true,
        },
        availabilityStatus: {
            type: String,
            // available | reserved | rented | maintenance | disabled
            // legacy 'unavailable' treated as disabled for compatibility
            enum: ['available', 'reserved', 'rented', 'maintenance', 'disabled', 'unavailable'],
            default: 'available',
            index: true,
        },
        maintenanceStatus: {
            type: String,
            enum: ['none', 'maintenance'],
            default: 'none',
            index: true,
        },
        /** Soft-hold / rental lock timestamp for ops visibility */
        heldAt: { type: Date, default: null },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        // Vendor-ready without multi-vendor in v1
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
        /** Vendor-submitted bikes require admin approval before they're bookable/visible platform-wide */
        approvalStatus: {
            type: String,
            enum: ['approved', 'pending', 'rejected'],
            default: 'approved',
            index: true,
        },
        rejectionReason: { type: String, trim: true, default: '' },
        /** Snapshot of bike fields as they stood at the moment of the last rejection,
         *  so admins can diff it against the resubmitted values. Cleared on approval. */
        rejectedSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
        reviewedAt: { type: Date, default: null },
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
        collection: 'bike_units',
        timestamps: true,
    },
);

bikeUnitSchema.index(
    { registrationNumber: 1 },
// NOTE: partialFilterExpression accepts only equality-style operators. MongoDB
// treats `$ne` as `$not` and REJECTS the whole index spec, which means the index
// is never built and the uniqueness declared here silently does not exist.
// Equivalents that ARE accepted: `isDeleted: false`, `{ $type: 'objectId' }` for
// a present reference, `{ $type: 'string', $gt: '' }` for a non-empty string.
    { unique: true, partialFilterExpression: { isDeleted: false } },
);
bikeUnitSchema.index({ zoneId: 1, isActive: 1, availabilityStatus: 1 });
bikeUnitSchema.index({ zoneId: 1, isDeleted: 1, maintenanceStatus: 1 });
bikeUnitSchema.index({ categoryId: 1, isActive: 1 });
bikeUnitSchema.index({ vendorId: 1, approvalStatus: 1 });

export const BikeUnit = mongoose.models.BikeUnit
    || mongoose.model('BikeUnit', bikeUnitSchema, 'bike_units');
