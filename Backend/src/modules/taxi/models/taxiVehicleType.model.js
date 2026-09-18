import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const taxiVehicleTypeSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        code: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },
        category: {
            type: String,
            required: true,
            index: true,
        },
        icon: {
            type: String,
            default: 'Car',
            trim: true,
        },
        iconUrl: {
            type: String,
            default: '',
            trim: true,
        },
        seats: {
            type: Number,
            default: 4,
            min: 1,
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
            index: true,
        },
        displayOrder: {
            type: Number,
            default: 0,
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
        statusHistory: {
            type: [{
                status: { type: String, enum: ['active', 'inactive'] },
                changedAt: { type: Date, default: Date.now },
                changedBy: { type: actionPerformerSchema, default: null },
            }],
            default: [],
        },
    },
    {
        collection: 'taxi_vehicle_types',
        timestamps: true,
    },
);

taxiVehicleTypeSchema.index({ category: 1, status: 1 });
taxiVehicleTypeSchema.index({ status: 1, displayOrder: 1 });
taxiVehicleTypeSchema.index({ isDeleted: 1, status: 1, name: 1 });
taxiVehicleTypeSchema.index(
    { code: 1 },
    { unique: true, partialFilterExpression: { isDeleted: false } },
);

export const TaxiVehicleType = mongoose.models.TaxiVehicleType
    || mongoose.model('TaxiVehicleType', taxiVehicleTypeSchema, 'taxi_vehicle_types');
