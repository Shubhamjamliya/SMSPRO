import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const bikePricingRuleSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        scope: {
            type: String,
            enum: ['global', 'category', 'zone', 'bike', 'vendor'],
            default: 'global',
            index: true,
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeVendor',
            default: null,
            index: true,
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeCategory',
            default: null,
            index: true,
        },
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeRentZone',
            default: null,
            index: true,
        },
        bikeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeUnit',
            default: null,
            index: true,
        },
        hourlyPrice: { type: Number, default: null, min: 0 },
        dailyPrice: { type: Number, default: null, min: 0 },
        weeklyPrice: { type: Number, default: null, min: 0 },
        securityDeposit: { type: Number, default: null, min: 0 },
        overtimeRatePerHour: { type: Number, default: 0, min: 0 },
        taxPercent: { type: Number, default: 0, min: 0, max: 100 },
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
    },
    {
        collection: 'bike_rent_pricing_rules',
        timestamps: true,
    },
);

bikePricingRuleSchema.index({ scope: 1, status: 1, isDeleted: 1 });

export const BikePricingRule = mongoose.models.BikePricingRule
    || mongoose.model('BikePricingRule', bikePricingRuleSchema, 'bike_rent_pricing_rules');
