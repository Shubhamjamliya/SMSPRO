import mongoose from 'mongoose';

/**
 * ConstructionContractorWallet — payee wallet for construction contractors.
 *
 * Lives in `core/payments` rather than the construction module because
 * `transaction.service.resolveWallet()` must resolve it, and core must not
 * import from a business module. It follows the exact shape of the existing
 * restaurant / delivery wallets so `recordTransaction()` — the single atomic
 * ledger+wallet write — works against it unchanged.
 *
 * Contractor earnings therefore flow through the same `Transaction` ledger as
 * every other payee on the platform, which is what BRD Rule 2 ("all money moves
 * through one wallet system") requires. Do not add a module-local wallet.
 */
const contractorWalletSchema = new mongoose.Schema(
    {
        contractorId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            unique: true,
        },
        balance: { type: Number, default: 0 },
        /** Reserved against an in-flight payout request; cannot be withdrawn twice. */
        lockedAmount: { type: Number, default: 0, min: 0 },
        /** Lifetime earnings credited from released project stages. */
        totalEarnings: { type: Number, default: 0, min: 0 },
        /** Total already paid out to the contractor's bank account. */
        totalWithdrawn: { type: Number, default: 0, min: 0 },
    },
    { collection: 'construction_contractor_wallets', timestamps: true },
);

export const ConstructionContractorWallet = mongoose.models.ConstructionContractorWallet
    || mongoose.model(
        'ConstructionContractorWallet',
        contractorWalletSchema,
        'construction_contractor_wallets',
    );
