import mongoose from 'mongoose';

/**
 * Provider-level offering of a Service in a specific Zone.
 * Unique (providerId, serviceId, zoneId) prevents duplicate Service+Zone assignments
 * for the same provider without duplicating the catalog Service.
 */
const providerServiceZoneSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceProviderProfile',
      required: true,
      index: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
      index: true,
    },
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceZone',
      required: true,
      index: true,
    },
  },
  {
    collection: 'service_provider_provider_service_zones',
    timestamps: true,
  },
);

providerServiceZoneSchema.index({ providerId: 1, serviceId: 1, zoneId: 1 }, { unique: true });
providerServiceZoneSchema.index({ zoneId: 1, serviceId: 1 });
providerServiceZoneSchema.index({ providerId: 1, zoneId: 1 });

export const ProviderServiceZone = mongoose.models.ProviderServiceZone
  || mongoose.model('ProviderServiceZone', providerServiceZoneSchema, 'service_provider_provider_service_zones');
