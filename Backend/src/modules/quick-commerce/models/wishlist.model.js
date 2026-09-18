import mongoose from 'mongoose';

const quickWishlistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodUser',
      default: null,
    },
    sessionId: {
      type: String,
      default: '',
      trim: true,
    },
    products: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  { timestamps: true }
);

quickWishlistSchema.index(
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

quickWishlistSchema.index(
  { sessionId: 1 },
  {
    unique: true,
    partialFilterExpression: { sessionId: { $type: 'string', $gt: '' } },
  }
);

export const QuickWishlist = mongoose.model('quick_wishlist', quickWishlistSchema, 'quick_wishlists');
