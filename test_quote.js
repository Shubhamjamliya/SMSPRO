import { config } from 'dotenv';
config({ path: 'Backend/.env' });
import mongoose from 'mongoose';
import { TaxiRide } from './Backend/src/modules/taxi/models/taxiRide.model.js';
import { quoteRide } from './Backend/src/modules/taxi/services/ride.service.js';

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const result = await quoteRide({
            pickup: { lat: 22.7196, lng: 75.8577, address: 'Indore' },
            drop: { lat: 22.7533, lng: 75.8937, address: 'Vijay Nagar' },
            vehicleTypeId: '668f12345678901234567890', // invalid id
        });
        console.log(result);
    } catch (e) {
        console.error("ERROR:", e.message);
    }
    process.exit(0);
});
