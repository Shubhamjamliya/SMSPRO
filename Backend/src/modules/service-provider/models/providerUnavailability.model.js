import mongoose from 'mongoose';

/**
 * One-off exceptions layered on top of the recurring weekly schedule — a specific
 * calendar date that's fully or partially blocked (holiday, personal leave, etc).
 * A single date can have multiple partial entries (e.g. 2-3pm AND 5-6pm blocked)
 * but at most one full-day entry (enforced in the service layer, not by a unique
 * index, since "conflicting" here means overlapping time ranges, not just same date).
 */
const providerUnavailabilitySchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceProviderProfile',
      required: true,
      index: true,
    },
    /** 'YYYY-MM-DD', always interpreted in the app's configured timezone (IST). */
    date: { type: String, required: true, index: true },
    isFullDay: { type: Boolean, default: true },
    startTime: { type: String, default: '' }, // 'HH:mm' — required when !isFullDay
    endTime: { type: String, default: '' },
    reason: { type: String, trim: true, default: '', maxlength: 200 },
  },
  {
    collection: 'service_provider_unavailability',
    timestamps: true,
  },
);

providerUnavailabilitySchema.index({ providerId: 1, date: 1 });

export const ProviderUnavailability = mongoose.models.ProviderUnavailability
  || mongoose.model('ProviderUnavailability', providerUnavailabilitySchema, 'service_provider_unavailability');
