import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ['addition', 'deduction', 'refund'],
            required: true
        },
        amount: { type: Number, required: true },
        status: { type: String, default: 'Completed' }, // UI expects "Completed"
        description: { type: String, default: '' },
        /** Canonical reason code / short reason (ADD_MONEY, REFUND, …) */
        reason: { type: String, default: '' },
        openingBalance: { type: Number, default: null },
        closingBalance: { type: Number, default: null },
        metadata: { type: Object, default: {} },
        razorpayOrderId: { type: String, default: null },
        razorpayPaymentId: { type: String, default: null },
        razorpaySignature: { type: String, default: null }
    },
    { timestamps: true }
);

const userWalletSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
        balance: { type: Number, default: 0 },
        /**
         * Sum of every active escrow hold against this wallet (see `wallet_holds`).
         * The money is still counted in `balance` — it simply cannot be spent.
         * Spendable balance is always `balance - lockedAmount`, which is what the
         * shared debit path checks. Only the hold service may write this field.
         */
        lockedAmount: { type: Number, default: 0, min: 0 },
        referralEarnings: { type: Number, default: 0 },
        transactions: { type: [walletTransactionSchema], default: [] }
    },
    { collection: 'food_user_wallets', timestamps: true }
);

export const FoodUserWallet = mongoose.model('FoodUserWallet', userWalletSchema, 'food_user_wallets');

