import mongoose from 'mongoose';

const quickPaymentIntentSchema = new mongoose.Schema(
  {
    intentId: { type: String, required: true, unique: true, index: true },
    razorpayOrderId: { type: String, default: '', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', default: null, index: true },
    sessionId: { type: String, default: '', index: true },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'expired'],
      default: 'pending',
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    /** Full place-order context needed to create FoodOrder only after payment success */
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    orderId: { type: String, default: '' },
    orderMongoId: { type: mongoose.Schema.Types.ObjectId, default: null },
    razorpayPaymentId: { type: String, default: '' },
    expiresAt: { type: Date, required: true, index: true },
  },
  { collection: 'quick_payment_intents', timestamps: true },
);

quickPaymentIntentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const QuickPaymentIntent = mongoose.model(
  'QuickPaymentIntent',
  quickPaymentIntentSchema,
);
