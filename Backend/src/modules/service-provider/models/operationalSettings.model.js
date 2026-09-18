import mongoose from 'mongoose';

/**
 * Singleton admin-configurable dispatch + cancellation settings for Service Provider
 * bookings — mirrors Bike Rent's own settings model (one document, safe defaults).
 */
const operationalSettingsSchema = new mongoose.Schema(
  {
    /** How long a single offered provider has to accept/reject before dispatch
     *  auto-advances to the next candidate. */
    requestTimeoutSeconds: { type: Number, default: 120, min: 15, max: 900 },

    /** Cancellation policy — mirrors Bike Rent's freeCancelBeforePickupMinutes +
     *  cancellationChargeType/Value pattern. */
    freeCancelBeforeMinutes: { type: Number, default: 60, min: 0 },
    cancellationChargeType: { type: String, enum: ['fixed', 'percent'], default: 'percent' },
    cancellationChargeValue: { type: Number, default: 10, min: 0 },

    /** Repeated provider-initiated cancellations after acceptance auto-suspend the
     *  provider (isActive:false) so support can review — no existing precedent for this
     *  in the codebase (Bike Rent/Taxi have none), built minimal-but-real for this module. */
    maxProviderCancellations: { type: Number, default: 3, min: 1 },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
  },
  {
    collection: 'service_provider_operational_settings',
    timestamps: true,
  },
);

export const ServiceProviderOperationalSettings = mongoose.models.ServiceProviderOperationalSettings
  || mongoose.model('ServiceProviderOperationalSettings', operationalSettingsSchema, 'service_provider_operational_settings');
