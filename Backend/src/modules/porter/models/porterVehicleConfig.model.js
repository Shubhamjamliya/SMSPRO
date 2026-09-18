import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * Porter-side capacity overlay for a global vehicle configuration.
 * vehicleConfigurationId = GlobalSettings.vehicleConfigurations._id
 */
const porterVehicleConfigSchema = new mongoose.Schema(
    {
        vehicleConfigurationId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            unique: true,
            index: true,
        },
        minWeight: {
            type: Number,
            default: 0,
            min: 0,
        },
        maxWeight: {
            type: Number,
            default: 0,
            min: 0,
        },
        maxLengthCm: {
            type: Number,
            default: 0,
            min: 0,
        },
        maxWidthCm: {
            type: Number,
            default: 0,
            min: 0,
        },
        maxHeightCm: {
            type: Number,
            default: 0,
            min: 0,
        },
        /** Optional free-text size / load note shown to ops */
        sizeLabel: {
            type: String,
            default: '',
            trim: true,
            maxlength: 120,
        },
        description: {
            type: String,
            default: '',
            trim: true,
            maxlength: 500,
        },
        capacityConfigured: {
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
        collection: 'porter_vehicle_configs',
        timestamps: true,
    },
);

porterVehicleConfigSchema.index(
    { vehicleConfigurationId: 1 },
    { unique: true, partialFilterExpression: { isDeleted: false } },
);

export const PorterVehicleConfig = mongoose.models.PorterVehicleConfig
    || mongoose.model('PorterVehicleConfig', porterVehicleConfigSchema, 'porter_vehicle_configs');
