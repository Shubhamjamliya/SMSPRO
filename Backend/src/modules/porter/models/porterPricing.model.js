import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/** One distance band with distance + weight rate card (whole-trip pricing). */
const distanceSlabSchema = new mongoose.Schema(
    {
        fromKm: { type: Number, required: true, min: 0, default: 0 },
        /** null = unlimited (this slab and above) */
        toKm: { type: Number, default: null, min: 0 },
        baseFare: { type: Number, default: 0, min: 0 },
        baseDistanceKm: { type: Number, default: 0, min: 0 },
        perKmRate: { type: Number, default: 0, min: 0 },
        /** Free weight included before per-kg charges apply */
        freeWeightKg: { type: Number, default: 0, min: 0 },
        /** Charge per kg above freeWeightKg */
        perKgRate: { type: Number, default: 0, min: 0 },
        platformFee: { type: Number, default: 0, min: 0 },
        surgeMultiplier: { type: Number, default: 1, min: 0 },
    },
    { _id: false },
);

const porterPricingSchema = new mongoose.Schema(
    {
        vehicleId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PorterZone',
            default: null,
            index: true,
        },
        /**
         * Distance slabs. Fare uses the single matching slab for the whole trip
         * (fromKm ≤ distance ≤ toKm; at boundaries the higher fromKm wins).
         */
        slabs: {
            type: [distanceSlabSchema],
            default: [],
        },
        // Legacy flat fields — kept in sync with first slab
        baseFare: { type: Number, default: 0, min: 0 },
        baseDistanceKm: { type: Number, default: 0, min: 0 },
        perKmRate: { type: Number, default: 0, min: 0 },
        freeWeightKg: { type: Number, default: 0, min: 0 },
        perKgRate: { type: Number, default: 0, min: 0 },
        platformFee: { type: Number, default: 0, min: 0 },
        surgeMultiplier: { type: Number, default: 1, min: 0 },
        /**
         * Admin commission % of (total − platformFee).
         */
        adminCommissionPercent: { type: Number, default: 0, min: 0, max: 100 },
        /** Free loading / unloading time included in fare (minutes) */
        freeLoadingMinutes: { type: Number, default: 60, min: 0 },
        /** Charge per minute after free loading time */
        extraLoadingPerMinCharge: { type: Number, default: 3, min: 0 },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
            index: true,
        },
        pricingConfigured: {
            type: Boolean,
            default: true,
        },
        description: {
            type: String,
            default: '',
            trim: true,
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
        statusHistory: {
            type: [{
                status: { type: String, enum: ['active', 'inactive'] },
                changedAt: { type: Date, default: Date.now },
                changedBy: { type: actionPerformerSchema, default: null },
            }],
            default: [],
        },
    },
    {
        collection: 'porter_pricing',
        timestamps: true,
    },
);

porterPricingSchema.index(
    { vehicleId: 1, zoneId: 1 },
    { unique: true, partialFilterExpression: { isDeleted: false } },
);
porterPricingSchema.index({ status: 1, vehicleId: 1 });
porterPricingSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });

export const PorterPricing = mongoose.models.PorterPricing
    || mongoose.model('PorterPricing', porterPricingSchema, 'porter_pricing');
