import mongoose from 'mongoose';

/**
 * BikeVendorWallet — tracks the financial balance for each bike-rent vendor.
 * Credited when bookings complete; debited when withdrawals are processed.
 */
const bikeVendorWalletSchema = new mongoose.Schema(
    {
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeVendor',
            required: true,
            unique: true,
        },
        balance: { type: Number, default: 0 },
        /** Amount locked for pending withdrawal requests (cannot be double-withdrawn) */
        lockedAmount: { type: Number, default: 0, min: 0 },
        /** Lifetime earnings credited from completed bookings */
        totalEarnings: { type: Number, default: 0, min: 0 },
        /** Total amount already withdrawn/paid out */
        totalWithdrawn: { type: Number, default: 0, min: 0 },
    },
    { collection: 'bike_rent_vendor_wallets', timestamps: true },
);

export const BikeVendorWallet = mongoose.models.BikeVendorWallet
    || mongoose.model('BikeVendorWallet', bikeVendorWalletSchema, 'bike_rent_vendor_wallets');
