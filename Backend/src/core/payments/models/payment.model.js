import mongoose from 'mongoose';

/**
 * Payment — one record per payment attempt on an order.
 * Tracks gateway interactions and final payment status.
 */
const paymentSchema = new mongoose.Schema(
    {
        /**
         * Food/Quick order this payment settles. No longer required: modules whose
         * payable is not a FoodOrder (construction project stages, and any future
         * staged-payment module) identify their subject via refType/refId instead.
         * Leaving this mandatory is why service-provider and bike-rent bypassed
         * `Payment` entirely and kept payment state on their own booking docs —
         * which is the drift away from one financial record that BRD Rule 2 forbids.
         */
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodOrder',
            default: null,
            index: true
        },
        /** Polymorphic subject for non-order payables, e.g. 'construction_stage'. */
        refType: { type: String, default: '', trim: true },
        refId: { type: mongoose.Schema.Types.ObjectId, default: null },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            required: true,
            index: true
        },
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, default: 'INR', trim: true },

        method: {
            type: String,
            enum: ['cash', 'razorpay', 'razorpay_qr', 'wallet', 'upi', 'card', 'netbanking'],
            required: true
        },
        gateway: {
            type: String,
            enum: ['razorpay', 'stripe', 'paypal', 'none'],
            default: 'none'
        },

        gatewayOrderId: { type: String, default: '', sparse: true },
        gatewayPaymentId: { type: String, default: '', sparse: true },

        status: {
            type: String,
            enum: ['created', 'pending', 'success', 'failed', 'refunded'],
            default: 'created',
            index: true
        },

        /** Module that triggered the payment (future: dining, grocery, etc.) */
        module: { type: String, default: 'food', trim: true, index: true },

        /** Full gateway response snapshot — stored for audit/support. Never expose to clients. */
        rawResponse: { type: mongoose.Schema.Types.Mixed, default: undefined },

        metadata: { type: mongoose.Schema.Types.Mixed, default: undefined }
    },
    { collection: 'payments', timestamps: true }
);

paymentSchema.index({ orderId: 1, createdAt: -1 });
paymentSchema.index({ userId: 1, status: 1, createdAt: -1 });
paymentSchema.index(
    { refType: 1, refId: 1, createdAt: -1 },
    { partialFilterExpression: { refType: { $type: 'string', $gt: '' } } },
);

/** Every payment must say what it is for — either an order or a polymorphic ref. */
paymentSchema.pre('validate', function requireSubject(next) {
    if (!this.orderId && !(this.refType && this.refId)) {
        return next(new Error('Payment requires either orderId or both refType and refId'));
    }
    next();
});

export const Payment = mongoose.model('Payment', paymentSchema);
