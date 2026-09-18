import mongoose from "mongoose";

const sellerOrderSchema = new mongoose.Schema(
  {
    orderType: {
      type: String,
      enum: ["quick", "mixed"],
      default: "quick",
      index: true,
    },
    parentOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodOrder",
      default: null,
      index: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },
    orderId: {
      type: String,
      required: true,
      trim: true,
    },
    customer: {
      name: { type: String, trim: true, default: "Customer" },
      phone: { type: String, trim: true, default: "" },
    },
    items: {
      type: [
        new mongoose.Schema(
          {
            productId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "SellerProduct",
              default: null,
            },
            name: { type: String, trim: true, default: "" },
            variantName: { type: String, trim: true, default: "" },
            price: { type: Number, min: 0, default: 0 },
            quantity: { type: Number, min: 1, default: 1 },
            image: { type: String, default: "" },
            packingAmount: { type: Number, min: 0, default: 0 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    pricing: {
      subtotal: { type: Number, min: 0, default: 0 },
      packingAmount: { type: Number, min: 0, default: 0 },
      commission: { type: Number, min: 0, default: 0 },
      total: { type: Number, min: 0, default: 0 },
      /** Net amount payable to seller for this order leg. */
      receivable: { type: Number, min: 0, default: 0 },
      /** Seller-funded coupon discount already deducted from receivable. */
      couponDiscount: { type: Number, min: 0, default: 0 },
      couponSource: { type: String, enum: ['', 'admin', 'seller'], default: '' },
    },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "packed",
        "ready_for_pickup",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
    cancellationReason: {
      type: String,
      default: "",
    },
    /**
     * Denormalized mirror of the SellerReturn document for this order leg.
     *
     * `status` intentionally stays `delivered` for returned orders so existing
     * fulfilment queries/filters keep working; return state lives here instead.
     * Always recomputed from SellerReturn by syncOrderReturnMirrors, never
     * incremented, so replays cannot drift.
     */
    returnSummary: {
      hasReturn: { type: Boolean, default: false },
      returnId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SellerReturn",
        default: null,
      },
      returnStatus: { type: String, trim: true, default: "" },
      refundStatus: { type: String, trim: true, default: "" },
      refundMethod: { type: String, trim: true, default: "" },
      returnReason: { type: String, trim: true, default: "" },
      returnRejectedReason: { type: String, trim: true, default: "" },
      /** Refund owed to the customer for this return cycle. */
      refundAmount: { type: Number, min: 0, default: 0 },
      /** Refund actually paid out to the customer (refundStatus === completed). */
      refundedAmount: { type: Number, min: 0, default: 0 },
      /** Amount recovered from this seller (pre-settlement + post-settlement). */
      sellerDeductedAmount: { type: Number, min: 0, default: 0 },
      /** Return pickup fee borne by the platform, shown to seller as informational. */
      pickupFeeAdminExpense: { type: Number, min: 0, default: 0 },
      returnedItemCount: { type: Number, min: 0, default: 0 },
      returnedQuantity: { type: Number, min: 0, default: 0 },
      /** pricing.receivable minus the amount recovered for this return. */
      netReceivable: { type: Number, default: 0 },
      requestedAt: { type: Date, default: null },
      decidedAt: { type: Date, default: null },
      returnedAt: { type: Date, default: null },
      refundedAt: { type: Date, default: null },
      syncedAt: { type: Date, default: null },
    },
    workflowStatus: {
      type: String,
      default: "SELLER_PENDING",
    },
    deliveredAt: {
      type: Date,
      default: null,
      index: true,
    },
    workflowVersion: {
      type: Number,
      default: 1,
    },
    sellerPendingExpiresAt: {
      type: Date,
      default: null,
    },
    address: {
      address: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
      location: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
      },
    },
    payment: {
      method: {
        type: String,
        enum: ["cash", "cod", "online"],
        default: "online",
      },
    },
  },
  {
    collection: 'quick_seller_orders',
    timestamps: true,
  },
);

sellerOrderSchema.index({ sellerId: 1, createdAt: -1 });
sellerOrderSchema.index({ sellerId: 1, orderType: 1, createdAt: -1 });
sellerOrderSchema.index({ sellerId: 1, orderId: 1 }, { unique: true });
sellerOrderSchema.index({ status: 1, sellerPendingExpiresAt: 1 });
sellerOrderSchema.index({ sellerId: 1, "returnSummary.hasReturn": 1, createdAt: -1 });

export const SellerOrder = mongoose.model('SellerOrder', sellerOrderSchema, 'quick_seller_orders');
