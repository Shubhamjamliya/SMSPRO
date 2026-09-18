import mongoose from 'mongoose';

const foodCategorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, index: true },
        image: { type: String, trim: true, default: '' },
        type: { type: String, trim: true, default: '' },
        foodTypeScope: { type: String, enum: ['Veg', 'Non-Veg', 'Both'], default: 'Both', index: true },
        /**
         * Category scope:
         * - When restaurantId is missing: category is admin/global and can be shared across restaurants.
         * - When restaurantId is set: category is private to that restaurant only.
         *
         * Approval remains available for admin moderation, but approval does not make a
         * restaurant-owned category globally reusable.
         *
         * Note: existing categories (created by admin historically) should be treated as approved.
         */
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', index: true, default: undefined },
        createdByRestaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', index: true, default: undefined },
        approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },
        isApproved: { type: Boolean, default: true, index: true },
        rejectionReason: { type: String, trim: true, default: '' },
        requestedAt: { type: Date },
        approvedAt: { type: Date },
        rejectedAt: { type: Date },
        globalizedAt: { type: Date },
        /**
         * Optional zone binding.
         * - When set: category is visible only for that zone.
         * - When null/undefined: category is global (visible for all zones).
         */
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', index: true, default: undefined },
        isActive: { type: Boolean, default: true, index: true },
        /** Set when restaurant type becomes Pure Veg — hides Non-Veg categories from customers without deleting. */
        hiddenByRestaurantType: { type: Boolean, default: false, index: true },
        sortOrder: { type: Number, default: 0, index: true },
        /**
         * Snapshot of the last-approved values, captured the moment a restaurant edit
         * puts the category back into 'pending'. Lets admin see exactly what changed
         * (old vs new) instead of only the already-changed current values.
         * Left unset for brand-new restaurant-submitted categories (nothing to diff against).
         */
        previousApproved: {
            name: { type: String, default: undefined },
            image: { type: String, default: undefined },
            type: { type: String, default: undefined },
            foodTypeScope: { type: String, default: undefined }
        }
    },
    {
        collection: 'food_categories',
        timestamps: true
    }
);

foodCategorySchema.index({ isApproved: 1, createdAt: -1 });
foodCategorySchema.index({ restaurantId: 1, isApproved: 1, createdAt: -1 });
foodCategorySchema.index({ approvalStatus: 1, createdAt: -1 });
foodCategorySchema.index({ createdByRestaurantId: 1, createdAt: -1 });

export const FoodCategory = mongoose.model('FoodCategory', foodCategorySchema, 'food_categories');

