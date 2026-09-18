import { config } from 'dotenv';
config({ path: '.env' });
import mongoose from 'mongoose';
import { TaxiPricing } from './src/modules/taxi/models/pricing.model.js';
mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const pricing = await TaxiPricing.find();
        for (const p of pricing) {
            console.log(p.vehicleType, p.isActive, p.zoneId);
        }
    } catch (e) {}
    process.exit(0);
});
