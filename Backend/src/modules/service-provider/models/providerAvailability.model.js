import mongoose from 'mongoose';

/** 0 = Sunday … 6 = Saturday, matching JS Date#getDay(). */
const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];

const breakSchema = new mongoose.Schema(
  {
    startTime: { type: String, required: true }, // 'HH:mm', 24h
    endTime: { type: String, required: true },
  },
  { _id: true },
);

const dayScheduleSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    isEnabled: { type: Boolean, default: false },
    startTime: { type: String, default: '' }, // 'HH:mm' — required only when isEnabled
    endTime: { type: String, default: '' },
    breaks: { type: [breakSchema], default: [] },
  },
  { _id: false },
);

/**
 * One document per provider — their recurring weekly working hours, per-day breaks,
 * and the booking buffer applied between consecutive slots. Providers manage this
 * schedule only; actual bookable customer slots are always derived/computed from it
 * (see slotCalculation.service.js), never stored here.
 */
const providerAvailabilitySchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceProviderProfile',
      required: true,
      unique: true,
      index: true,
    },
    weeklySchedule: {
      type: [dayScheduleSchema],
      default: () => DAYS_OF_WEEK.map((dayOfWeek) => ({ dayOfWeek, isEnabled: false, startTime: '', endTime: '', breaks: [] })),
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 7 && DAYS_OF_WEEK.every((d) => v.some((entry) => entry.dayOfWeek === d)),
        message: 'Weekly schedule must have exactly one entry for each day (0-6).',
      },
    },
    /** Minutes reserved after every booking before the next one can start — configurable
     *  now, intended to later grow into zone-to-zone travel time. */
    bufferMinutes: { type: Number, default: 0, min: 0, max: 240 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceProviderProfile', default: null },
  },
  {
    collection: 'service_provider_availability',
    timestamps: true,
  },
);

export const ProviderAvailability = mongoose.models.ProviderAvailability
  || mongoose.model('ProviderAvailability', providerAvailabilitySchema, 'service_provider_availability');
export { DAYS_OF_WEEK };
