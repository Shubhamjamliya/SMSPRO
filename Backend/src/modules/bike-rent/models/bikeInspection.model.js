import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

export const BIKE_INSPECTION_TYPES = Object.freeze(['PICKUP', 'RETURN']);

export const BIKE_INSPECTION_ANGLES = Object.freeze([
    'front',
    'back',
    'left',
    'right',
    'tyres',
    'damage',
    'meter',
    'fuel',
    'other',
]);

export const BIKE_RETURN_CONDITION = Object.freeze([
    'same_condition',
    'damage_found',
]);

const mediaItemSchema = new mongoose.Schema(
    {
        url: { type: String, required: true, trim: true },
        publicId: { type: String, default: '', trim: true },
        angle: {
            type: String,
            enum: [...BIKE_INSPECTION_ANGLES, ''],
            default: 'other',
        },
        caption: { type: String, default: '', trim: true },
        resourceType: {
            type: String,
            enum: ['image', 'video', 'raw', 'auto', ''],
            default: 'image',
        },
    },
    { _id: false },
);

const damageItemSchema = new mongoose.Schema(
    {
        description: { type: String, default: '', trim: true },
        severity: {
            type: String,
            enum: ['low', 'medium', 'high', ''],
            default: '',
        },
        estimatedCost: { type: Number, default: 0, min: 0 },
        images: { type: [mediaItemSchema], default: [] },
        videos: { type: [mediaItemSchema], default: [] },
    },
    { _id: false },
);

const bikeInspectionSchema = new mongoose.Schema(
    {
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeBooking',
            required: true,
            index: true,
        },
        bikeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeUnit',
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        inspectionType: {
            type: String,
            enum: BIKE_INSPECTION_TYPES,
            required: true,
            index: true,
        },
        images: { type: [mediaItemSchema], default: [] },
        videos: { type: [mediaItemSchema], default: [] },
        conditionNotes: { type: String, default: '', trim: true },
        fuelLevel: { type: String, default: '', trim: true },
        meterReading: { type: Number, default: null, min: 0 },
        damages: { type: [damageItemSchema], default: [] },
        returnCondition: {
            type: String,
            enum: [...BIKE_RETURN_CONDITION, ''],
            default: '',
        },
        repairCharges: { type: Number, default: 0, min: 0 },
        comparedWithInspectionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeInspection',
            default: null,
        },
        pickupCodeVerified: { type: Boolean, default: false },
        inspectedBy: { type: actionPerformerSchema, default: null },
        inspectedAt: { type: Date, default: Date.now, index: true },
        isDeleted: { type: Boolean, default: false, index: true },
        deletedAt: { type: Date, default: null },
    },
    {
        collection: 'bike_inspections',
        timestamps: true,
    },
);

bikeInspectionSchema.index({ bookingId: 1, inspectionType: 1 });
bikeInspectionSchema.index({ inspectionType: 1, inspectedAt: -1 });

export const BikeInspection = mongoose.models.BikeInspection
    || mongoose.model('BikeInspection', bikeInspectionSchema, 'bike_inspections');
