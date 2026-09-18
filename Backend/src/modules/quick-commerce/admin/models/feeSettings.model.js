import mongoose from 'mongoose';

const deliveryFeeRangeSchema = new mongoose.Schema(
  {
    min: { type: Number, required: true, min: 0 },
    max: { type: Number, required: true, min: 0 },
    fee: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const quickFeeSettingsSchema = new mongoose.Schema(
  {
    // Legacy fields kept for mixed-order food paths that still read them.
    // QC admin billing UI no longer edits these; delivery fee comes from commission slabs.
    deliveryFee: { type: Number, min: 0 },
    deliveryFeeRanges: { type: [deliveryFeeRangeSchema], default: [] },
    freeDeliveryThreshold: { type: Number, min: 0 },
    platformFee: { type: Number, min: 0 },
    // Legacy — GST now comes from header category handlingFees
    gstRate: { type: Number, min: 0, max: 100 },
    returnDeliveryCommission: { type: Number, min: 0, default: 0 },
    returnPickupFee: { type: Number, min: 0, default: 0 },
    // Legacy fallback — return window days now set on header categories
    returnWindowHours: { type: Number, min: 1, default: 72 },
    returnsEnabled: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { collection: 'quick_fee_settings', timestamps: true },
);

quickFeeSettingsSchema.index({ isActive: 1, createdAt: -1 });

export const QuickFeeSettings = mongoose.model(
  'QuickFeeSettings',
  quickFeeSettingsSchema,
  'quick_fee_settings',
);
