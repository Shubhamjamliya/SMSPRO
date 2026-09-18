import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * Global recurring weekly surge slots for the taxi module.
 * Flat ₹ amount; highest priority wins on overlap.
 */
const taxiSurgeSlotSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 80,
        },
        /** 0 = Sunday … 6 = Saturday (JS getDay) */
        daysOfWeek: {
            type: [Number],
            default: [],
            validate: {
                validator(v) {
                    return Array.isArray(v)
                        && v.length > 0
                        && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
                },
                message: 'daysOfWeek must be a non-empty list of 0–6',
            },
        },
        /** HH:mm in Asia/Kolkata */
        startTime: {
            type: String,
            required: true,
            trim: true,
            match: /^([01]\d|2[0-3]):[0-5]\d$/,
        },
        /** HH:mm in Asia/Kolkata; may be earlier than startTime for overnight windows */
        endTime: {
            type: String,
            required: true,
            trim: true,
            match: /^([01]\d|2[0-3]):[0-5]\d$/,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        priority: {
            type: Number,
            default: 0,
            index: true,
        },
        isActive: {
            type: Boolean,
            default: true,
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
        collection: 'taxi_surge_slots',
        timestamps: true,
    },
);

taxiSurgeSlotSchema.index({ isDeleted: 1, isActive: 1, priority: -1 });

export const TaxiSurgeSlot = mongoose.models.TaxiSurgeSlot
    || mongoose.model('TaxiSurgeSlot', taxiSurgeSlotSchema, 'taxi_surge_slots');
