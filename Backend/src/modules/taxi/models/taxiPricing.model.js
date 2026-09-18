import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/** One distance band with a full rate card (whole-trip pricing). */
const distanceSlabSchema = new mongoose.Schema(
    {
        fromKm: { type: Number, required: true, min: 0, default: 0 },
        /** null = unlimited (this slab and above) */
        toKm: { type: Number, default: null, min: 0 },
        baseFare: { type: Number, default: 0, min: 0 },
        baseDistanceKm: { type: Number, default: 0, min: 0 },
        perKmRate: { type: Number, default: 0, min: 0 },
        perMinRate: { type: Number, default: 0, min: 0 },
        freeWaitMinutes: { type: Number, default: 0, min: 0 },
        perMinWaitRate: { type: Number, default: 0, min: 0 },
        platformFee: { type: Number, default: 0, min: 0 },
        surgeMultiplier: { type: Number, default: 1, min: 0 },
    },
    { _id: false },
);

const taxiPricingSchema = new mongoose.Schema(
    {
        vehicleTypeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TaxiVehicleType',
            required: true,
            index: true,
        },
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TaxiZone',
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
        // Legacy flat fields — kept in sync with first slab for older clients / list stats
        baseFare: { type: Number, default: 0, min: 0 },
        baseDistanceKm: { type: Number, default: 0, min: 0 },
        perKmRate: { type: Number, default: 0, min: 0 },
        perMinRate: { type: Number, default: 0, min: 0 },
        freeWaitMinutes: { type: Number, default: 0, min: 0 },
        perMinWaitRate: { type: Number, default: 0, min: 0 },
        platformFee: { type: Number, default: 0, min: 0 },
        surgeMultiplier: { type: Number, default: 1, min: 0 },
        /**
         * Admin commission % of (total − platformFee).
         * Driver gets the rest of that amount.
         */
        adminCommissionPercent: { type: Number, default: 0, min: 0, max: 100 },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
            index: true,
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
        collection: 'taxi_pricing',
        timestamps: true,
    },
);

taxiPricingSchema.index(
    { vehicleTypeId: 1, zoneId: 1 },
    { unique: true, partialFilterExpression: { isDeleted: false } },
);
taxiPricingSchema.index({ status: 1, vehicleTypeId: 1 });
taxiPricingSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });

export const TaxiPricing = mongoose.models.TaxiPricing
    || mongoose.model('TaxiPricing', taxiPricingSchema, 'taxi_pricing');
