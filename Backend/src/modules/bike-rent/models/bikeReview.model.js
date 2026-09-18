import mongoose from 'mongoose';

const bikeReviewSchema = new mongoose.Schema(
    {
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeBooking',
            required: true,
            unique: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        bikeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeUnit',
            required: true,
            index: true,
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },
        comment: {
            type: String,
            default: '',
            trim: true,
            maxlength: 2000,
        },
        isVisible: {
            type: Boolean,
            default: true,
            index: true,
        },
    },
    {
        collection: 'bike_reviews',
        timestamps: true,
    },
);

bikeReviewSchema.index({ bikeId: 1, isVisible: 1, createdAt: -1 });

export const BikeReview = mongoose.models.BikeReview
    || mongoose.model('BikeReview', bikeReviewSchema, 'bike_reviews');
