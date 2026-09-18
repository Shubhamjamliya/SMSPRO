import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const bikeRentHubSchema = new mongoose.Schema(
    {
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeRentZone',
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        address: {
            type: String,
            required: true,
            trim: true,
        },
        landmark: {
            type: String,
            default: '',
            trim: true,
        },
        instructions: {
            type: String,
            default: '',
            trim: true,
        },
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
        /**
         * Max bikes allowed at this pickup hub.
         * null / 0 = unlimited. Example: 3 means only 3 bikes can be assigned here.
         */
        maxBikes: {
            type: Number,
            default: null,
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
        collection: 'bike_rent_hubs',
        timestamps: true,
    },
);

bikeRentHubSchema.index({ zoneId: 1, status: 1, displayOrder: 1 });
bikeRentHubSchema.index(
    { zoneId: 1, name: 1 },
// NOTE: partialFilterExpression accepts only equality-style operators. MongoDB
// treats `$ne` as `$not` and REJECTS the whole index spec, which means the index
// is never built and the uniqueness declared here silently does not exist.
// Equivalents that ARE accepted: `isDeleted: false`, `{ $type: 'objectId' }` for
// a present reference, `{ $type: 'string', $gt: '' }` for a non-empty string.
    { unique: true, partialFilterExpression: { isDeleted: false } },
);

export const BikeRentHub = mongoose.models.BikeRentHub
    || mongoose.model('BikeRentHub', bikeRentHubSchema, 'bike_rent_hubs');
