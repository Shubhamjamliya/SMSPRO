import mongoose from 'mongoose';

const historyEntrySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    reason: { type: String, trim: true, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const coordinateSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false },
);

const zoneRequestSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceProviderProfile',
      required: true,
      index: true,
    },
    requestedName: { type: String, required: true, trim: true },
    country: { type: String, default: 'India', trim: true },
    unit: { type: String, enum: ['kilometer', 'mile'], default: 'kilometer' },
    polygon: { type: String, default: '', trim: true },
    coordinates: { type: [coordinateSchema], default: [] },
    reason: { type: String, trim: true, default: '', maxlength: 1000 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    rejectionReason: { type: String, trim: true, default: '' },
    /** Prior rejection(s), preserved across edit+resubmit cycles. */
    history: { type: [historyEntrySchema], default: [] },
    /** Set when approval created the actual catalog ServiceZone row */
    createdZoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceZone',
      default: null,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    reviewedAt: { type: Date, default: null },
  },
  {
    collection: 'service_provider_zone_requests',
    timestamps: true,
  },
);

zoneRequestSchema.index({ status: 1, createdAt: -1 });

export const ZoneRequest = mongoose.models.ZoneRequest
  || mongoose.model('ZoneRequest', zoneRequestSchema, 'service_provider_zone_requests');
