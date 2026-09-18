import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
    {
        ownerType: {
            type: String,
            enum: ['USER', 'RESTAURANT', 'DELIVERY_PARTNER', 'SERVICE_PROVIDER', 'CONTRACTOR'],
            required: true,
            index: true
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true
        },
        title: {
            type: String,
            required: true,
            trim: true
        },
        message: {
            type: String,
            required: true,
            trim: true
        },
        link: {
            type: String,
            default: '',
            trim: true
        },
        category: {
            type: String,
            default: 'broadcast',
            trim: true
        },
        source: {
            type: String,
            enum: [
                'ADMIN_BROADCAST',
                'FSSAI_EXPIRY',
                // Construction: the events that actually need to reach someone.
                'DOCUMENT_EXPIRY',      // a contractor licence is about to lapse (Rule 6)
                'NEW_LEAD',             // an enquiry matched to a contractor (W6)
                'SITE_VISIT_REMINDER',  // a missed visit wastes a day for both sides (C9/W8)
                'QUOTATION_RECEIVED',   // the quote is in the app (C10)
                'STAGE_SUBMITTED',      // contractor marked a stage complete (W16)
                'STAGE_APPROVED',       // the customer signed it off (C17)
                'PAYMENT_RELEASED',     // money reached the contractor (W17)
                'STAGE_DELAYED',        // a target date passed (C18)
                'PROJECT_STATUS',       // admin put a project on hold, reassigned, closed (A6)
            ],
            default: 'ADMIN_BROADCAST',
            index: true
        },
        broadcastId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BroadcastNotification',
            default: undefined,
            index: true
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        isRead: {
            type: Boolean,
            default: false,
            index: true
        },
        readAt: {
            type: Date,
            default: null
        },
        dismissedAt: {
            type: Date,
            default: null,
            index: true
        }
    },
    {
        collection: 'food_notifications',
        timestamps: true
    }
);

notificationSchema.index({ ownerType: 1, ownerId: 1, createdAt: -1 });
notificationSchema.index({ ownerType: 1, ownerId: 1, isRead: 1, dismissedAt: 1 });
notificationSchema.index({ broadcastId: 1, ownerType: 1, ownerId: 1 }, { unique: true, sparse: true });

export const FoodNotification = mongoose.model('FoodNotification', notificationSchema);
