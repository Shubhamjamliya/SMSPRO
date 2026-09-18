import mongoose from 'mongoose';

/**
 * Selected restaurant add-ons for a line. Only the id and quantity are stored —
 * name and price are always resolved from the approved add-on at read time
 * (see shared/addonPricing.js), so a stale cart can never bill a stale price.
 */
const foodCartAddonSchema = new mongoose.Schema(
  {
    addonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodAddon',
      required: true,
    },
    quantity: { type: Number, default: 1, min: 1 },
  },
  { _id: false },
);

const foodCartItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodItem',
      required: true,
      index: true,
    },
    variantId: { type: String, default: '', trim: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    addons: { type: [foodCartAddonSchema], default: [] },
    /** Snapshot of pricing when line was added/updated — stays stable until cart refresh. */
    basePrice: { type: Number, default: null, min: 0 },
    otherPrice: { type: Number, default: 0, min: 0 },
    appliedPricingType: { type: String, default: null },
    appliedPricingValue: { type: Number, default: null },
    pricingScope: { type: String, default: null },
    pricingRule: { type: mongoose.Schema.Types.Mixed, default: null },
    pricingCapturedAt: { type: Date, default: null },
  },
  { _id: true }
);

const foodCartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodUser',
      required: true,
      unique: true,
      index: true,
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodRestaurant',
      default: null,
      index: true,
    },
    items: { type: [foodCartItemSchema], default: [] },
    couponCode: { type: String, default: '', trim: true, uppercase: true },
  },
  {
    collection: 'food_carts',
    timestamps: true,
  }
);

foodCartSchema.index({ userId: 1, 'items.itemId': 1, 'items.variantId': 1 });

export const FoodCart = mongoose.model('FoodCart', foodCartSchema, 'food_carts');
