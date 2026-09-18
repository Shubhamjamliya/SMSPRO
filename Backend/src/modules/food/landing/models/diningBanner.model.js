import mongoose from 'mongoose';

const foodDiningBannerSchema = new mongoose.Schema(
    {
        imageUrl: {
            type: String,
            required: true
        },
        publicId: {
            type: String,
            required: true
        },
        title: {
            type: String,
            default: ''
        },
        subtitle: {
            type: String,
            default: ''
        },
        description: {
            type: String,
            default: ''
        },
        ctaText: {
            type: String,
            default: ''
        },
        ctaLink: {
            type: String,
            default: ''
        },
        diningType: {
            type: String
        },
        sortOrder: {
            type: Number,
            default: 0,
            index: true
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        }
    },
    {
        collection: 'food_dining_banners',
        timestamps: true
    }
);

foodDiningBannerSchema.index({ isActive: 1, sortOrder: 1 });

export const FoodDiningBanner = mongoose.model('FoodDiningBanner', foodDiningBannerSchema, 'food_dining_banners');

