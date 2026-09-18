import mongoose from 'mongoose';

/**
 * Singleton admin-configurable platform fee + tax settings for Service Provider
 * bookings — mirrors Bike Rent's own TaxSettings/Food's FeeSettings pattern (one
 * document, safe zero defaults so a fresh install charges exactly the admin price
 * until an admin deliberately configures fees).
 */
const feeSettingsSchema = new mongoose.Schema(
  {
    platformFeeType: { type: String, enum: ['fixed', 'percent'], default: 'fixed' },
    platformFeeValue: { type: Number, default: 0, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
  },
  {
    collection: 'service_provider_fee_settings',
    timestamps: true,
  },
);

export const ServiceProviderFeeSettings = mongoose.models.ServiceProviderFeeSettings
  || mongoose.model('ServiceProviderFeeSettings', feeSettingsSchema, 'service_provider_fee_settings');
