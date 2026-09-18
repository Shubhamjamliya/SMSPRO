import mongoose from 'mongoose';

const providerServiceSchema = new mongoose.Schema(
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
    price: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
  },
  {
    collection: 'service_provider_provider_services',
    timestamps: true,
  },
);

providerServiceSchema.index({ providerId: 1, serviceId: 1 }, { unique: true });

export const ProviderService = mongoose.models.ProviderService
  || mongoose.model('ProviderService', providerServiceSchema, 'service_provider_provider_services');
