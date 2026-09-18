import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * Taxi-side seats overlay for a global vehicle configuration.
 * vehicleConfigurationId = GlobalSettings.vehicleConfigurations._id
 */
const taxiVehicleConfigSchema = new mongoose.Schema(
    {
        vehicleConfigurationId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        seats: {
            type: Number,
            default: 0,
            min: 0,
            max: 20,
        },
        seatsConfigured: {
            type: Boolean,
            default: false,
            index: true,
        },
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: actionPerformerSchema, default: null },
        createdBy: { type: actionPerformerSchema, default: null },
        updatedBy: { type: actionPerformerSchema, default: null },
    },
    {
        collection: 'taxi_vehicle_configs',
        timestamps: true,
    },
);

taxiVehicleConfigSchema.index(
    { vehicleConfigurationId: 1 },
    { unique: true, partialFilterExpression: { isDeleted: false } },
);

export const TaxiVehicleConfig = mongoose.models.TaxiVehicleConfig
    || mongoose.model('TaxiVehicleConfig', taxiVehicleConfigSchema, 'taxi_vehicle_configs');
