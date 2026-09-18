import mongoose from 'mongoose';

const bikeVendorWithdrawalSchema = new mongoose.Schema({
    vendorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BikeVendor',
        required: true,
        index: true,
    },
    amount: {
        type: Number,
        required: true,
        min: [1, 'Minimum withdrawal amount is ₹1'],
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
        index: true,
    },
    paymentMethod: {
        type: String,
        default: 'bank_transfer',
    },
    bankDetails: {
        accountNumber: String,
        ifscCode: String,
        bankName: String,
        accountHolderName: String,
    },
    adminNote: String,
    rejectionReason: String,
    transactionId: String, // Final bank transaction reference from admin
    processedAt: Date,
}, {
    collection: 'bike_rent_vendor_withdrawals',
    timestamps: true,
});

bikeVendorWithdrawalSchema.index({ createdAt: -1 });

export const BikeVendorWithdrawal = mongoose.models.BikeVendorWithdrawal
    || mongoose.model('BikeVendorWithdrawal', bikeVendorWithdrawalSchema, 'bike_rent_vendor_withdrawals');
