import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'quick_product', required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  variantName: { type: String, default: '', trim: true },
  variantKey: { type: String, default: '', trim: true },
  variantSku: { type: String, default: '', trim: true },
  unitPrice: { type: Number, min: 0, default: 0 },
}, { _id: false });

const quickCartSchema = new mongoose.Schema({
  // Seller is derived from cart line products at runtime (ONE CART = ONE SELLER policy).
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', default: null },
  sessionId: { type: String, default: '', trim: true },
  items: { type: [cartItemSchema], default: [] },
}, { timestamps: true });

quickCartSchema.index(
  { userId: 1 },
  {
    unique: true,
// NOTE: partialFilterExpression accepts only equality-style operators. MongoDB
// treats `$ne` as `$not` and REJECTS the whole index spec, which means the index
// is never built and the uniqueness declared here silently does not exist.
// Equivalents that ARE accepted: `isDeleted: false`, `{ $type: 'objectId' }` for
// a present reference, `{ $type: 'string', $gt: '' }` for a non-empty string.
    partialFilterExpression: { userId: { $type: 'objectId' } },
  }
);

quickCartSchema.index(
  { sessionId: 1 },
  {
    unique: true,
    partialFilterExpression: { sessionId: { $type: 'string', $gt: '' } },
  }
);

export const QuickCart = mongoose.model('quick_cart', quickCartSchema, 'quick_carts');
