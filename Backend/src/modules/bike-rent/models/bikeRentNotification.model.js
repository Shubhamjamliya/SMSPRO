import mongoose from 'mongoose';

const bikeRentNotificationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            index: true,
        },
        adminAudience: {
            type: Boolean,
            default: false,
            index: true,
        },
        event: { type: String, required: true, trim: true, index: true },
        title: { type: String, default: '', trim: true },
        body: { type: String, default: '', trim: true },
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeBooking',
            default: null,
            index: true,
        },
        bookingNumber: { type: String, default: '', trim: true },
        read: { type: Boolean, default: false, index: true },
        meta: { type: mongoose.Schema.Types.Mixed, default: null },
        channels: { type: [String], default: () => ['push', 'inbox'] },
    },
    {
        collection: 'bike_rent_notifications',
        timestamps: true,
    },
);

bikeRentNotificationSchema.index({ userId: 1, createdAt: -1 });
bikeRentNotificationSchema.index({ adminAudience: 1, createdAt: -1 });

export const BikeRentNotification = mongoose.models.BikeRentNotification
    || mongoose.model('BikeRentNotification', bikeRentNotificationSchema, 'bike_rent_notifications');
