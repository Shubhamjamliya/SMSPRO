import { config } from 'dotenv';
config({ path: '.env' });
import mongoose from 'mongoose';
import { findNearbyTaxiDrivers } from './src/modules/taxi/services/rideDispatch.service.js';

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const drivers = await findNearbyTaxiDrivers({ lat: 22.7196, lng: 75.8577 }, null);
        console.log("Nearby drivers found:", drivers.length);
        console.log(drivers);
    } catch (e) { console.error(e); }
    process.exit(0);
});
