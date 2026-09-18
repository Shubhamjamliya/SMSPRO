import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../models/actionPerformer.schema.js';

/**
 * WalletHold — an aggregate claim against a customer's wallet balance.
 *
 * A hold NEVER moves money. It records that some of the customer's balance is
 * spoken for, and `FoodUserWallet.lockedAmount` mirrors the sum of every active
 * hold so the shared debit path can refuse to spend it elsewhere.
 *
 * There is exactly ONE hold row per (module, refType, refId) — e.g. one per
 * construction project. Repeated funding grows `amountHeld` via new ledger
 * entries rather than creating a second hold, which keeps the reconciliation
 * invariant on a single row:
 *
 *     amountHeld === amountReleased + amountRefunded + outstanding
 *
 * These three totals are a CACHE. `wallet_hold_ledger` is the source of truth,
 * and `reconcileHold()` recomputes them from it. Never write them by hand.
 */
const HOLD_STATUSES = ['active', 'settled', 'cancelled'];

const walletHoldSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            required: true,
            index: true,
        },
        /** Owning module — holds are a platform primitive, not construction-only. */
        module: { type: String, required: true, trim: true, index: true },
        /** What the hold is against, e.g. 'construction_project'. */
        refType: { type: String, required: true, trim: true },
        refId: { type: mongoose.Schema.Types.ObjectId, required: true },

        currency: { type: String, default: 'INR', trim: true },

        /** Running totals — derived from the ledger, cached here for fast reads. */
        amountHeld: { type: Number, default: 0, min: 0 },
        amountReleased: { type: Number, default: 0, min: 0 },
        amountRefunded: { type: Number, default: 0, min: 0 },

        status: {
            type: String,
            enum: HOLD_STATUSES,
            default: 'active',
            index: true,
        },

        meta: { type: mongoose.Schema.Types.Mixed, default: null },
        createdBy: { type: actionPerformerSchema, default: null },
        closedAt: { type: Date, default: null },
    },
    { collection: 'wallet_holds', timestamps: true },
);

/** One hold per business object — the whole reconciliation model depends on this. */
walletHoldSchema.index({ module: 1, refType: 1, refId: 1 }, { unique: true });
walletHoldSchema.index({ userId: 1, status: 1, createdAt: -1 });

/** Money still locked: held minus everything already paid out or given back. */
walletHoldSchema.virtual('outstanding').get(function outstanding() {
    const held = Number(this.amountHeld) || 0;
    const released = Number(this.amountReleased) || 0;
    const refunded = Number(this.amountRefunded) || 0;
    return Math.round((held - released - refunded) * 100) / 100;
});

walletHoldSchema.set('toObject', { virtuals: true });
walletHoldSchema.set('toJSON', { virtuals: true });

export const WalletHold = mongoose.models.WalletHold
    || mongoose.model('WalletHold', walletHoldSchema, 'wallet_holds');

export const WALLET_HOLD_STATUSES = HOLD_STATUSES;
