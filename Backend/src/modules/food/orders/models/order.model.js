import mongoose from 'mongoose';

const geoPointSchema = new mongoose.Schema(
    {
        type: { type: String, enum: ['Point'], default: undefined },
        coordinates: { type: [Number], default: undefined }
    },
    { _id: false }
);

const orderItemAddonSchema = new mongoose.Schema(
    {
        /** Source add-on, kept for traceability back to the restaurant's catalogue. */
        addonId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAddon', default: null },
        name: { type: String, default: '', trim: true },
        quantity: { type: Number, default: 1, min: 1 },
        /** Price per add-on unit at order time; charged per unit of the parent item. */
        price: { type: Number, default: 0, min: 0 },
    },
    { _id: false }
);

/**
 * Quick Commerce only — immutable return policy captured when the order is created.
 * Food orders never populate this; absence means "legacy / not applicable".
 */
const returnPolicySnapshotSchema = new mongoose.Schema(
    {
        eligible: { type: Boolean, default: true },
        returnWindowDays: { type: Number, default: 0, min: 0 },
        source: { type: String, default: '', trim: true },
        sourceId: { type: String, default: '', trim: true },
        snapshotAt: { type: Date, default: null },
    },
    { _id: false }
);

const orderItemSchema = new mongoose.Schema(
    {
        itemId: { type: String, required: true, trim: true },
        name: { type: String, required: true, trim: true },
        type: { type: String, enum: ['food', 'quick'], required: true },
        sourceId: { type: String, required: true, trim: true },
        sourceName: { type: String, default: '', trim: true },
        price: { type: Number, required: true, min: 0 },
        /** Selling / base price at order time (never recalculated later). */
        basePrice: { type: Number, default: null, min: 0 },
        /** Compare-at / Other Price from Pricing Management at order time. */
        otherPrice: { type: Number, default: 0, min: 0 },
        markupAmount: { type: Number, default: 0, min: 0 },
        appliedPricingType: { type: String, default: null },
        appliedPricingValue: { type: Number, default: null },
        pricingScope: { type: String, default: null },
        pricingRule: { type: mongoose.Schema.Types.Mixed, default: null },
        quantity: { type: Number, required: true, min: 1 },
        isVeg: { type: Boolean, default: true },
        image: { type: String, default: '' },
        variantId: { type: String, default: '', trim: true },
        variantName: { type: String, default: '', trim: true },
        notes: { type: String, default: '' },
        /** QC flat packing fee snapshot (per unique product; not multiplied by qty). */
        packingAmount: { type: Number, default: 0, min: 0 },
        /** Food only — per-unit packaging charge snapshot (multiplied by qty). */
        foodPackagingCharge: { type: Number, default: 0, min: 0 },
        categoryId: { type: String, default: '', trim: true },
        categoryName: { type: String, default: '', trim: true },
        /** QC only — header (top-level) category snapshot used to resolve the return policy. */
        headerId: { type: String, default: '', trim: true },
        headerName: { type: String, default: '', trim: true },
        /**
         * QC only — variant-safe stable identifier for this order line.
         * Legacy lines have '' and fall back to itemId based matching.
         */
        lineKey: { type: String, default: '', trim: true },
        /** QC only — immutable at order creation; never re-resolved from live categories. */
        returnPolicySnapshot: { type: returnPolicySnapshotSchema, default: undefined },
        /** QC only — cumulative quantity already returned for this line. */
        returnedQuantity: { type: Number, default: 0, min: 0 },
        /** QC only — derived rollup of this line's return lifecycle. */
        itemReturnStatus: {
            type: String,
            enum: ['none', 'requested', 'approved', 'returned', 'refunded', 'rejected'],
            default: 'none',
        },
        addons: { type: [orderItemAddonSchema], default: [] },
    },
    { _id: false }
);

const pickupPointSchema = new mongoose.Schema(
    {
        pickupType: { type: String, enum: ['food', 'quick'], required: true },
        sourceId: { type: String, required: true, trim: true },
        sourceName: { type: String, default: '', trim: true },
        address: { type: String, default: '', trim: true },
        location: {
            type: geoPointSchema,
            default: undefined
        },
        itemIds: { type: [String], default: [] }
    },
    { _id: false }
);

const dispatchLegSchema = new mongoose.Schema(
    {
        legId: { type: String, required: true, trim: true },
        pickupType: { type: String, enum: ['food', 'quick'], required: true },
        sourceId: { type: String, required: true, trim: true },
        sourceName: { type: String, default: '', trim: true },
        deliveryFee: { type: Number, default: 0, min: 0 },
        riderEarning: { type: Number, default: 0, min: 0 },
        deliveryPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null },
        assignedAt: { type: Date, default: null },
        partnerCandidates: [{
            partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
            distanceKm: { type: Number, min: 0, default: null }
        }]
    },
    { _id: false }
);

const dispatchPlanSchema = new mongoose.Schema(
    {
        strategy: {
            type: String,
            enum: ['single', 'split', 'express_split'],
            default: 'single'
        },
        combinedPickupEligible: { type: Boolean, default: false },
        pickupDistanceKm: { type: Number, default: null },
        sameDirection: { type: Boolean, default: false },
        reason: { type: String, default: '', trim: true },
        legs: { type: [dispatchLegSchema], default: [] }
    },
    { _id: false }
);

const deliveryAddressSchema = new mongoose.Schema(
    {
        label: { type: String, enum: ['Home', 'Office', 'Other'], default: 'Home' },
        street: { type: String, required: true, trim: true },
        additionalDetails: { type: String, default: '', trim: true },
        city: { type: String, required: true, trim: true },
        state: { type: String, required: true, trim: true },
        zipCode: { type: String, default: '', trim: true },
        area: { type: String, default: '', trim: true },
        landmark: { type: String, default: '', trim: true },
        formattedAddress: { type: String, default: '', trim: true },
        phone: { type: String, default: '', trim: true },
        location: {
            type: geoPointSchema,
            default: undefined
        }
    },
    { _id: false }
);

const pricingSchema = new mongoose.Schema(
    {
        subtotal: { type: Number, required: true, min: 0 },
        tax: { type: Number, default: 0, min: 0 },
        packagingFee: { type: Number, default: 0, min: 0 },
        /** Who owned the packaging charge when this order was placed ('' = none charged). */
        packagingMode: { type: String, enum: ['', 'ADMIN', 'RESTAURANT'], default: '' },
        deliveryFee: { type: Number, default: 0, min: 0 },
        riderBaseDeliveryFee: { type: Number, default: 0, min: 0 },
        deliveryExtraFee: { type: Number, default: 0, min: 0 },
        totalDeliveryFee: { type: Number, default: 0, min: 0 },
        userDeliveryFee: { type: Number, default: 0, min: 0 },
        restaurantDeliveryFee: { type: Number, default: 0, min: 0 },
        sponsoredDelivery: { type: Boolean, default: false },
        sponsoredKm: { type: Number, default: 0, min: 0 },
        deliveryDistanceKm: { type: Number, default: null, min: 0 },
        deliverySponsorType: { type: String, default: 'USER_FULL', trim: true },
        platformFee: { type: Number, default: 0, min: 0 },
        discount: { type: Number, default: 0, min: 0 },
        itemDiscount: { type: Number, default: 0, min: 0 },
        couponDiscount: { type: Number, default: 0, min: 0 },
        couponCode: { type: String, default: '', trim: true, uppercase: true },
        couponSource: { type: String, enum: ['', 'admin', 'restaurant', 'seller'], default: '' },
        couponRefId: { type: String, default: '', trim: true },
        couponFreeDelivery: { type: Boolean, default: false },
        couponConsumed: { type: Boolean, default: false },
        deliverySpeedFee: { type: Number, default: 0, min: 0 },
        deliverySpeed: {
            type: new mongoose.Schema(
                {
                    code: { type: String, default: '' },
                    label: { type: String, default: '' },
                    etaMinutesMin: { type: Number, default: null },
                    etaMinutesMax: { type: Number, default: null }
                },
                { _id: false }
            ),
            default: () => ({})
        },
        restaurantCommissionPercentage: { type: Number, default: 0, min: 0 },
        restaurantCommission: { type: Number, default: 0, min: 0 },
        total: { type: Number, required: true, min: 0 },
        currency: { type: String, default: 'INR' }
    },
    { _id: false }
);

const paymentSchema = new mongoose.Schema(
    {
        method: {
            type: String,
            enum: ['cash', 'razorpay', 'razorpay_qr', 'wallet'],
            required: true
        },
        status: {
            type: String,
            enum: [
                'cod_pending',
                'created',
                'authorized',
                'paid',
                'failed',
                'refunded',
                'pending_qr',
                'cancelled'
            ],
            default: 'cod_pending'
        },
        amountDue: { type: Number, min: 0 },
        razorpay: {
            orderId: { type: String },
            paymentId: { type: String },
            signature: { type: String }
        },
        /** Short-lived lock while minting a Razorpay retry order (prevents duplicate payment attempts). */
        retryInProgress: { type: Boolean, default: false },
        qr: {
            qrId: { type: String },
            imageUrl: { type: String },
            paymentLinkId: { type: String },
            shortUrl: { type: String },
            status: { type: String },
            expiresAt: { type: Date }
        },
        // ✅ NEW: Added refund object to track refund status without breaking existing flow
        refund: {
            status: { 
                type: String, 
                enum: ['none', 'pending', 'processed', 'failed'], 
                default: 'none' 
            },
            amount: { type: Number, default: 0 },
            refundId: { type: String, default: '' },
            requestedMethod: {
                type: String,
                enum: ['wallet', 'gateway'],
                default: undefined
            },
            processedMethod: {
                type: String,
                enum: ['wallet', 'gateway'],
                default: undefined
            },
            requestedAt: { type: Date, default: null },
            requestedByUser: { type: Boolean, default: false },
            reason: { type: String, default: '' },
            processedAt: { type: Date }
        }
    },
    { _id: false }
);

const dispatchSchema = new mongoose.Schema(
    {
        modeAtCreation: { type: String, enum: ['auto', 'manual'], default: 'manual' },
        status: {
            type: String,
            enum: ['unassigned', 'assigned', 'accepted', 'rejected', 'cancelled'],
            default: 'unassigned'
        },
        deliveryPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null },
        assignedAt: { type: Date },
        acceptedAt: { type: Date },
        /** List of partners who were offered this order (to avoid repeats and track timeouts) */
        offeredTo: [{
            partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
            at: { type: Date, default: Date.now },
            action: { type: String, enum: ['offered', 'rejected', 'timeout'], default: 'offered' }
        }]
    },
    { _id: false }
);

const deliveryStateSchema = new mongoose.Schema(
    {
        currentPhase: {
            type: String,
            enum: [
                'en_route_to_pickup',
                'at_pickup',
                'en_route_to_delivery',
                'at_drop',
                'delivered',
                'completed'
            ],
            default: 'en_route_to_pickup'
        },
        status: { type: String, default: '' },
        reachedPickupAt: { type: Date, default: null },
        reachedDropAt: { type: Date, default: null },
        pickedUpAt: { type: Date, default: null },
        deliveredAt: { type: Date, default: null },
        billImageUrl: { type: String, default: '' }
    },
    { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
    {
        at: { type: Date, default: Date.now },
        byRole: { type: String, enum: ['USER', 'RESTAURANT', 'SELLER', 'DELIVERY_PARTNER', 'ADMIN', 'SYSTEM'] },
        byId: { type: mongoose.Schema.Types.ObjectId },
        from: { type: String },
        to: { type: String },
        note: { type: String, default: '' }
    },
    { _id: false }
);

const orderEntityRatingSchema = new mongoose.Schema(
    {
        rating: { type: Number, min: 1, max: 5 },
        comment: { type: String, default: '', trim: true },
        ratedAt: { type: Date, default: Date.now }
    },
    { _id: false }
);

const orderRatingsSchema = new mongoose.Schema(
    {
        restaurant: { type: orderEntityRatingSchema, default: undefined },
        deliveryPartner: { type: orderEntityRatingSchema, default: undefined }
    },
    { _id: false }
);

const deliveryVerificationSchema = new mongoose.Schema(
    {
        dropOtp: {
            required: { type: Boolean, default: false },
            verified: { type: Boolean, default: false }
        }
    },
    { _id: false }
);

const orderSchema = new mongoose.Schema(
    {
        orderType: {
            type: String,
            enum: ['food', 'quick','mixed'],
            default: 'food',
            index: true
        },
        orderId: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        sessionId: {
            type: String,
            default: '',
            trim: true,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            default: null
        },
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required() {
                return this.orderType === 'food';
            },
            default: null
        },
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodZone',
            index: true
        },
        transactionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodTransaction',
            index: true
        },
        items: {
            type: [orderItemSchema],
            required: true,
            validate: (v) => Array.isArray(v) && v.length > 0
        },
        pickupPoints: {
            type: [pickupPointSchema],
            default: []
        },
        deliveryAddress: {
            type: deliveryAddressSchema,
            required() {
                return this.orderType === 'food' || this.orderType === 'quick' || this.orderType === 'mixed';
            }
        },
        pricing: {
            type: pricingSchema,
            required: true
        },
        /**
         * Denormalized payment snapshot for fast reads & legacy clients.
         * Authoritative audit trail: collection `food_order_payments` (FoodOrderPayment model).
         */
        payment: {
            type: paymentSchema,
            required: true
        },
        orderStatus: {
            type: String,
            enum: [
                'placed',
                'created',
                'scheduled',
                'confirmed',
                'preparing',
                'ready_for_pickup',
                'picked_up',
                'delivered',
                'cancelled_by_user',
                'cancelled_by_restaurant',
                'cancelled_by_admin'
            ],
            default: 'created'
        },
        /**
         * Quick Commerce only — denormalized rollup of the order's return lifecycle.
         * Declared here so QC writes no longer need `validateBeforeSave: false`.
         * Food orders leave this empty.
         */
        returnStatus: { type: String, default: '', trim: true },
        dispatch: {
            type: dispatchSchema,
            default: () => ({})
        },
        dispatchPlan: {
            type: dispatchPlanSchema,
            default: () => ({})
        },
        deliveryState: {
            type: deliveryStateSchema,
            default: () => ({})
        },
        statusHistory: {
            type: [statusHistorySchema],
            default: []
        },
        ratings: {
            type: orderRatingsSchema,
            default: () => ({})
        },
        note: { type: String, default: '', trim: true },
        sendCutlery: { type: Boolean, default: true },
        /**
         * Order preparation time in minutes (MAX of item preparation times).
         * Restaurant may overwrite before / when accepting. Reused across customer, restaurant, driver, admin.
         */
        preparationTime: {
            type: Number,
            default: null,
            min: 1,
            max: 180
        },
        deliveryFleet: { type: String, default: 'standard', trim: true },
        scheduledAt: { type: Date, default: null },
        riderEarning: { type: Number, default: 0, min: 0 },
        platformProfit: { type: Number, default: 0, min: 0 },
        /** Plain 4-digit OTP for handover; cleared after successful verify (never expose to partner in API responses). */
        deliveryOtp: { type: String, default: '', select: false },
        deliveryVerification: {
            type: deliveryVerificationSchema,
            default: () => ({})
        },
        /** Latest rider location for this specific order (GeoJSON Point) */
        lastRiderLocation: {
            type: geoPointSchema,
            default: undefined
        }
    },
    {
        collection: 'food_orders',
        timestamps: true
    }
);

orderSchema.index({ 'deliveryAddress.location': '2dsphere' });
orderSchema.index({ lastRiderLocation: '2dsphere' });
orderSchema.index({ orderType: 1, sessionId: 1, createdAt: -1 });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, orderStatus: 1, createdAt: -1 });
orderSchema.index({ 'dispatch.deliveryPartnerId': 1, orderStatus: 1 });
orderSchema.index({ 'dispatch.status': 1, orderStatus: 1 });
orderSchema.index({ 'payment.status': 1, createdAt: -1 });
orderSchema.index({ 'payment.method': 1, createdAt: -1 });

export const FoodOrder = mongoose.model('FoodOrder', orderSchema, 'food_orders');

const settingsSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, trim: true },
        dispatchMode: { type: String, enum: ['auto', 'manual'], default: 'manual' },
        updatedBy: {
            role: { type: String },
            adminId: { type: mongoose.Schema.Types.ObjectId },
            at: { type: Date }
        }
    },
    { collection: 'food_settings', timestamps: true }
);

export const FoodSettings = mongoose.model('FoodSettings', settingsSchema, 'food_settings');
