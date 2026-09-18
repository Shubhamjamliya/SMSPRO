import mongoose from 'mongoose';

const deliverySponsorRuleSchema = new mongoose.Schema(
    {
        minOrderAmount: { type: Number, required: true, min: 0 },
        maxOrderAmount: { type: Number, min: 0, default: null },
        maxDistanceKm: { type: Number, required: true, min: 0 },
        sponsorType: {
            type: String,
            enum: ['USER_FULL', 'RESTAURANT_FULL', 'SPLIT'],
            required: true
        },
        sponsoredKm: { type: Number, min: 0, default: null }
    },
    { _id: false }
);

const deliveryDistanceSlabSchema = new mongoose.Schema(
    {
        fromKm: { type: Number, required: true, min: 0 },
        toKm: { type: Number, required: true, min: 0 },
        deliveryFee: { type: Number, required: true, min: 0 },
        extraAmount: { type: Number, default: 0, min: 0 },
        extraType: { type: String, enum: ['FLAT', 'PERCENT'], default: 'FLAT' }
    },
    { _id: false }
);

// Admin-configurable delivery speed tiers (Eco / Standard / Express, etc.)
// shown as a selector on the user cart. `extraFee` is added on top of the
// distance-based delivery fee for whichever tier the user picks.
const deliverySpeedOptionSchema = new mongoose.Schema(
    {
        code: { type: String, required: true, trim: true, lowercase: true },
        label: { type: String, required: true, trim: true },
        description: { type: String, default: '', trim: true },
        etaMinutesMin: { type: Number, required: true, min: 0 },
        etaMinutesMax: { type: Number, required: true, min: 0 },
        extraFee: { type: Number, required: true, min: 0, default: 0 },
        isDefault: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 }
    },
    { _id: false }
);

// Who owns the food packaging charge, and how much it is when admin owns it.
// RESTAURANT mode reads the per-item charge off each menu item instead
// (see FoodItem.packagingCharge and shared/packagingCharge.js).
const packagingChargeSchema = new mongoose.Schema(
    {
        isEnabled: { type: Boolean, default: false },
        mode: { type: String, enum: ['ADMIN', 'RESTAURANT'], default: 'ADMIN' },
        /** Flat charge added once per order in ADMIN mode. */
        adminChargePerOrder: { type: Number, min: 0, default: 0 }
    },
    { _id: false }
);

const feeSettingsSchema = new mongoose.Schema(
    {
        // Legacy alias kept so quick/mixed flows that still read `deliveryFee`
        // continue to work without changing their execution path.
        deliveryFee: { type: Number, min: 0 },
        baseDistanceKm: { type: Number, min: 0 },
        baseDeliveryFee: { type: Number, min: 0 },
        perKmCharge: { type: Number, min: 0 },
        sponsorRules: { type: [deliverySponsorRuleSchema], default: [] },
        deliveryDistanceSlabs: { type: [deliveryDistanceSlabSchema], default: [] },
        deliverySpeedOptions: { type: [deliverySpeedOptionSchema], default: [] },
        platformFee: { type: Number, min: 0 },
        gstRate: { type: Number, min: 0, max: 100 },
        packagingCharge: { type: packagingChargeSchema, default: () => ({}) },
        mixedOrderDistanceLimit: { type: Number, min: 0, default: 2 },
        mixedOrderAngleLimit: { type: Number, min: 0, default: 35 },
        isActive: { type: Boolean, default: true, index: true }
    },
    { collection: 'food_fee_settings', timestamps: true }
);

feeSettingsSchema.index({ isActive: 1, createdAt: -1 });

export const FoodFeeSettings = mongoose.model('FoodFeeSettings', feeSettingsSchema, 'food_fee_settings');

