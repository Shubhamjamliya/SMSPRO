import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../models/actionPerformer.schema.js';

/**
 * WalletHoldLedger — the append-only source of truth for escrow money.
 *
 * Every change to a WalletHold writes one row here and never touches an existing
 * one. Mistakes are corrected by adding an `adjust` entry; the original stays
 * visible forever. This is what makes the balance reconstructible and the
 * financial record trustworthy.
 *
 * Entry types:
 *   hold     customer's money became locked (balance unchanged, lockedAmount up)
 *   release  locked money was paid out to a payee (balance down, lockedAmount down)
 *   refund   locked money was returned to the customer (lockedAmount down only)
 *   adjust   manual correction, signed by `amount` + `entryType` semantics
 *
 * `reference` is the idempotency guarantee. It is unique-indexed with a partial
 * filter, so a retried release can never pay twice — the second insert throws
 * E11000 and the caller replays the first result. Same pattern as
 * `bike_deposit_ledger`, which has been in production since bike-rent shipped.
 */
const LEDGER_ENTRY_TYPES = ['hold', 'release', 'refund', 'adjust'];

const walletHoldLedgerSchema = new mongoose.Schema(
    {
        holdId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WalletHold',
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        module: { type: String, required: true, trim: true, index: true },

        entryType: {
            type: String,
            enum: LEDGER_ENTRY_TYPES,
            required: true,
            index: true,
        },

        /** Always positive — direction is carried by `entryType`, never by sign. */
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, default: 'INR', trim: true },

        /** Hold outstanding immediately after this entry — a frozen audit snapshot. */
        outstandingAfter: { type: Number, default: null },

        reason: { type: String, default: '', trim: true },

        /**
         * Idempotency key. Callers MUST pass a stable, operation-specific value
         * (e.g. `stage_release_<stageId>`). Unique among non-empty values.
         */
        reference: { type: String, default: '', trim: true },

        /** Where released money went. Absent for hold / refund entries. */
        payee: {
            entityType: { type: String, default: '', trim: true },
            entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
        },

        /** BRD Rule 4 — who did it, recorded permanently. */
        performedBy: { type: actionPerformerSchema, default: null },

        meta: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { collection: 'wallet_hold_ledger', timestamps: true },
);

walletHoldLedgerSchema.index({ holdId: 1, createdAt: -1 });
walletHoldLedgerSchema.index({ userId: 1, entryType: 1, createdAt: -1 });
walletHoldLedgerSchema.index(
    { reference: 1 },
    { unique: true, partialFilterExpression: { reference: { $type: 'string', $gt: '' } } },
);

/**
 * Append-only enforcement. Corrections are new `adjust` rows — never edits.
 * These guards are deliberate: an ORM-level slip on this collection would
 * silently destroy the audit trail the whole escrow model rests on.
 */
const rejectMutation = (operation) => function blockMutation(next) {
    next(new Error(
        `wallet_hold_ledger is append-only — ${operation} is not permitted. `
        + 'Record a new "adjust" entry instead.',
    ));
};

walletHoldLedgerSchema.pre('updateOne', { document: false, query: true }, rejectMutation('updateOne'));
walletHoldLedgerSchema.pre('updateMany', { document: false, query: true }, rejectMutation('updateMany'));
walletHoldLedgerSchema.pre('findOneAndUpdate', rejectMutation('findOneAndUpdate'));
walletHoldLedgerSchema.pre('replaceOne', { document: false, query: true }, rejectMutation('replaceOne'));
walletHoldLedgerSchema.pre('deleteOne', { document: false, query: true }, rejectMutation('deleteOne'));
walletHoldLedgerSchema.pre('deleteMany', { document: false, query: true }, rejectMutation('deleteMany'));
walletHoldLedgerSchema.pre('findOneAndDelete', rejectMutation('findOneAndDelete'));
walletHoldLedgerSchema.pre('findOneAndReplace', rejectMutation('findOneAndReplace'));

/** Block re-saving an already-persisted row (document-level edit). */
walletHoldLedgerSchema.pre('save', function blockResave(next) {
    if (!this.isNew) {
        return next(new Error('wallet_hold_ledger rows are immutable once written.'));
    }
    next();
});

export const WalletHoldLedger = mongoose.models.WalletHoldLedger
    || mongoose.model('WalletHoldLedger', walletHoldLedgerSchema, 'wallet_hold_ledger');

export const WALLET_HOLD_ENTRY_TYPES = LEDGER_ENTRY_TYPES;
