import { config } from 'dotenv';
config({ path: '.env' });
import mongoose from 'mongoose';
import { TaxiRide } from './src/modules/taxi/models/taxiRide.model.js';
import { quoteRide } from './src/modules/taxi/services/ride.service.js';
import { GlobalSettings } from './src/modules/common/models/settings.model.js';

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const settings = await GlobalSettings.findOne({});
        const vehicles = settings.vehicleConfigurations;
        
        for (const v of vehicles) {
            console.log(`\nQuoting for ${v.name} (${v._id})...`);
            try {
                const result = await quoteRide({
                    pickup: { lat: 22.7196, lng: 75.8577, address: 'Indore' },
                    drop: { lat: 22.7533, lng: 75.8937, address: 'Vijay Nagar' },
                    vehicleTypeId: v._id.toString(),
                });
                console.log("Success! Fare:", result.fareEstimateTotal);
            } catch (err) {
                console.error("ERROR:", err.message);
            }
        }
    } catch (e) {
        console.error("FATAL ERROR:", e.message);
    }
    process.exit(0);
});
