import mongoose from 'mongoose';
import { Driver } from './src/core/models/driver.model.js';
import dotenv from 'dotenv';
dotenv.config({ path: 'Backend/.env' });

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/just_order').then(async () => {
    const drivers = await Driver.find({});
    console.log("Total drivers:", drivers.length);
    console.log(drivers.map(d => ({
        name: d.name,
        availability: d.availabilityStatus,
        services: d.authorizedServices,
        module: d.activeWorkModule,
        status: d.status,
        lat: d.lastLat,
        lng: d.lastLng,
        vehicleConfigurationId: d.vehicleConfigurationId,
    })));
    process.exit(0);
});
