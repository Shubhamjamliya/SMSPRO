import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const coordinateSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false },
);

const serviceZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    country: { type: String, default: 'India', trim: true, index: true },
    unit: {
      type: String,
      enum: ['kilometer', 'mile'],
      default: 'kilometer',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    polygon: { type: String, default: '', trim: true },
    coordinates: {
      type: [coordinateSchema],
      default: [],
      validate: {
        validator(v) {
          return !Array.isArray(v) || v.length === 0 || v.length >= 3;
        },
        message: 'Zone must have at least 3 coordinates when defined.',
      },
    },
    displayOrder: { type: Number, default: 0, index: true },
    /** Set when this zone was created from an approved ZoneRequest */
    sourceRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ZoneRequest',
      default: null,
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: actionPerformerSchema, default: null },
    createdBy: { type: actionPerformerSchema, default: null },
    updatedBy: { type: actionPerformerSchema, default: null },
  },
  {
    collection: 'service_provider_zones',
    timestamps: true,
  },
);

serviceZoneSchema.index({ isDeleted: 1, status: 1, displayOrder: 1 });

export const ServiceZone = mongoose.models.ServiceZone
  || mongoose.model('ServiceZone', serviceZoneSchema, 'service_provider_zones');
