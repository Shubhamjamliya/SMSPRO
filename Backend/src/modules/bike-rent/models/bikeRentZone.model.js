import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const coordinateSchema = new mongoose.Schema(
    {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
    },
    { _id: false },
);

const bikeRentZoneSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        country: {
            type: String,
            default: 'India',
            trim: true,
            index: true,
        },
        unit: {
            type: String,
            default: 'kilometer',
            enum: ['kilometer', 'mile'],
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
            index: true,
        },
        polygon: {
            type: String,
            default: '',
            trim: true,
        },
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
        displayOrder: {
            type: Number,
            default: 0,
            index: true,
        },
        ownerType: {
            type: String,
            enum: ['admin', 'vendor'],
            default: 'admin',
            index: true,
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeVendor',
            default: null,
            index: true,
        },
        /** Where riders collect / return bikes for this zone */
        pickupHub: {
            name: { type: String, default: '', trim: true },
            address: { type: String, default: '', trim: true },
            landmark: { type: String, default: '', trim: true },
            instructions: { type: String, default: '', trim: true },
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
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
        collection: 'bike_rent_zones',
        timestamps: true,
    },
);

bikeRentZoneSchema.index({ status: 1, country: 1 });
bikeRentZoneSchema.index({ status: 1, displayOrder: 1 });
bikeRentZoneSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });

export const BikeRentZone = mongoose.models.BikeRentZone
    || mongoose.model('BikeRentZone', bikeRentZoneSchema, 'bike_rent_zones');
