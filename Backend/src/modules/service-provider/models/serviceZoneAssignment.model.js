import mongoose from 'mongoose';

/**
 * Catalog-level Service ↔ Zone availability.
 * A Service can be available in multiple zones without duplicating the Service row.
 */
const serviceZoneAssignmentSchema = new mongoose.Schema(
  {
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
    collection: 'service_provider_service_zone_assignments',
    timestamps: true,
  },
);

serviceZoneAssignmentSchema.index({ serviceId: 1, zoneId: 1 }, { unique: true });
serviceZoneAssignmentSchema.index({ zoneId: 1, serviceId: 1 });

export const ServiceZoneAssignment = mongoose.models.ServiceZoneAssignment
  || mongoose.model('ServiceZoneAssignment', serviceZoneAssignmentSchema, 'service_provider_service_zone_assignments');
