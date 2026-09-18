import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const bikeDepositLedgerSchema = new mongoose.Schema(
    {
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeBooking',
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ['hold', 'capture', 'refund', 'adjust'],
            required: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            default: 'INR',
        },
        reason: {
            type: String,
            default: '',
            trim: true,
        },
        reference: {
            type: String,
            default: '',
            trim: true,
        },
        meta: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
        performedBy: {
            type: actionPerformerSchema,
            default: null,
        },
    },
    {
        collection: 'bike_deposit_ledger',
        timestamps: true,
    },
);

bikeDepositLedgerSchema.index({ bookingId: 1, createdAt: -1 });
bikeDepositLedgerSchema.index({ userId: 1, type: 1, createdAt: -1 });
bikeDepositLedgerSchema.index(
    { bookingId: 1, type: 1, reference: 1 },
    { unique: true, partialFilterExpression: { reference: { $type: 'string', $gt: '' } } },
);

export const BikeDepositLedger = mongoose.models.BikeDepositLedger
    || mongoose.model('BikeDepositLedger', bikeDepositLedgerSchema, 'bike_deposit_ledger');
