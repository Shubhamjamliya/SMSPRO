import { config } from 'dotenv';
config({ path: '.env' });
import mongoose from 'mongoose';
import { TaxiZone } from './src/modules/taxi/models/zone.model.js';
mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const zones = await TaxiZone.find();
        for (const z of zones) {
            console.log(z.name, z.polygon[0]);
        }
    } catch (e) {}
    process.exit(0);
});
