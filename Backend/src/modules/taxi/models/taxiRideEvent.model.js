import mongoose from 'mongoose';

const taxiRideEventSchema = new mongoose.Schema(
    {
        rideId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TaxiRide',
            required: true,
            index: true,
        },
        eventType: {
            type: String,
            required: true,
            enum: [
                'RIDE_CREATED',
                'DISPATCH_ATTEMPT',
                'DRIVER_ACCEPTED',
                'DRIVER_REJECTED',
                'DRIVER_ARRIVED',
                'RIDE_STARTED',
                'RIDE_COMPLETED',
                'SYSTEM_CANCELLED',
                'USER_CANCELLED',
                'PAYMENT_COMPLETED'
            ],
            index: true,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        createdAt: {
            type: Date,
            default: Date.now,
            index: true,
        }
    },
    {
        collection: 'taxi_ride_events',
        timestamps: false, // We only need createdAt, which is defined above
    }
);

export const TaxiRideEvent = mongoose.models.TaxiRideEvent || mongoose.model('TaxiRideEvent', taxiRideEventSchema, 'taxi_ride_events');
