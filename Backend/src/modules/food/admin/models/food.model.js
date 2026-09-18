import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../../core/models/actionPerformer.schema.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';

const foodVariantSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        price: { type: Number, required: true, min: 0 },
        otherPrice: { type: Number, min: 0, default: 0 },
        unit: { type: String, trim: true, default: '' }
    },
    { _id: true }
);

const foodSchema = new mongoose.Schema(
    {
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true, index: true },
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodCategory', index: true },
        categoryName: { type: String, trim: true, default: '' },
        name: { type: String, required: true, trim: true, index: true },
        description: { type: String, trim: true, default: '' },
        price: { type: Number, required: true, min: 0 },
        otherPrice: { type: Number, min: 0, default: 0 },
        variants: { type: [foodVariantSchema], default: [] },
        image: { type: String, trim: true, default: '' },
        images: { type: [String], default: [] },
        foodType: { type: String, enum: ['Veg', 'Non-Veg'], default: 'Non-Veg' },
        isAvailable: { type: Boolean, default: true, index: true },
        /** Set when restaurant type becomes Pure Veg — hides Non-Veg items from customers without deleting. */
        hiddenByRestaurantType: { type: Boolean, default: false, index: true },
        preparationTime: { type: String, trim: true, default: '' },
        /**
         * Order quantity limits for this item (see shared/orderQuantityRules.js).
         * `maxOrderQuantity: 0` means no item-specific cap.
         */
        minOrderQuantity: { type: Number, min: 1, default: 1 },
        maxOrderQuantity: { type: Number, min: 0, default: 0 },
        /**
         * Per-unit packaging charge set by the restaurant. Only billed when admin
         * puts packaging charges in RESTAURANT mode (food fee settings) — see
         * shared/packagingCharge.js.
         */
        packagingCharge: {
            type: new mongoose.Schema(
                {
                    isEnabled: { type: Boolean, default: false },
                    amount: { type: Number, min: 0, default: 0 }
                },
                { _id: false }
            ),
            default: () => ({})
        },
        approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },
        rejectionReason: { type: String, trim: true, default: '' },
        requestedAt: { type: Date },
        approvedAt: { type: Date },
        rejectedAt: { type: Date },
        approvedBy: { type: actionPerformerSchema, default: null },
        rejectedBy: { type: actionPerformerSchema, default: null },
        previousApproved: {
            name: { type: String, default: undefined },
            description: { type: String, default: undefined },
            price: { type: Number, default: undefined },
            otherPrice: { type: Number, default: undefined },
            image: { type: String, default: undefined },
            images: { type: [String], default: undefined },
            foodType: { type: String, default: undefined },
            preparationTime: { type: String, default: undefined },
            variants: { type: [foodVariantSchema], default: undefined }
        }
    },
    {
        collection: 'food_items',
        timestamps: true
    }
);

foodSchema.index({ restaurantId: 1, createdAt: -1 });
foodSchema.index({ approvalStatus: 1, createdAt: -1 });
foodSchema.index({ approvalStatus: 1, requestedAt: -1 });
foodSchema.index({ restaurantId: 1, approvalStatus: 1, createdAt: -1 });

const markRestaurantHasActiveItems = async (doc) => {
    if (!doc?.restaurantId) return;
    if (doc.approvalStatus !== 'approved' || doc.isAvailable === false) return;

    await FoodRestaurant.updateOne(
        { _id: doc.restaurantId, hasHadActiveItems: { $ne: true } },
        { $set: { hasHadActiveItems: true } }
    );
};

foodSchema.post('save', async function markActiveRestaurantAfterSave(doc, next) {
    try {
        await markRestaurantHasActiveItems(doc);
        next();
    } catch (error) {
        next(error);
    }
});

foodSchema.post('findOneAndUpdate', async function markActiveRestaurantAfterUpdate(doc, next) {
    try {
        await markRestaurantHasActiveItems(doc);
        next();
    } catch (error) {
        next(error);
    }
});

export const FoodItem = mongoose.model('FoodItem', foodSchema, 'food_items');
