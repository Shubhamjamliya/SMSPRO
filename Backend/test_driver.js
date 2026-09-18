import { config } from 'dotenv';
config({ path: '.env' });
import mongoose from 'mongoose';
import { Driver } from './src/core/models/driver.model.js';
mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const drivers = await Driver.find({}).lean();
        console.log("Total drivers:", drivers.length);
        for (const d of drivers) {
            console.log(d.name, {
                status: d.status,
                availabilityStatus: d.availabilityStatus,
                authorizedServices: d.authorizedServices,
                activeWorkModule: d.activeWorkModule,
                lastLat: d.lastLat,
                lastLng: d.lastLng,
                vehicleConfigurationId: d.vehicleConfigurationId,
                lastLocationAt: d.lastLocationAt
            });
        }
    } catch (e) { console.error(e) }
    process.exit(0);
});
