import mongoose from 'mongoose';

const serviceProviderZoneSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceProviderProfile',
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
    collection: 'service_provider_provider_zones',
    timestamps: true,
  },
);

serviceProviderZoneSchema.index({ providerId: 1, zoneId: 1 }, { unique: true });

export const ServiceProviderZone = mongoose.models.ServiceProviderZone
  || mongoose.model('ServiceProviderZone', serviceProviderZoneSchema, 'service_provider_provider_zones');
