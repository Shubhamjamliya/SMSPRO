import { config } from 'dotenv';
config({ path: '.env' });
import mongoose from 'mongoose';
import { Driver } from './src/core/models/driver.model.js';
import { GlobalSettings } from './src/modules/common/models/settings.model.js';

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const settings = await GlobalSettings.findOne({});
        const vehicles = settings.vehicleConfigurations;
        
        const drivers = await Driver.find({ 
           authorizedServices: 'taxi'
        });
        
        let updated = 0;
        for (const d of drivers) {
            let matched = false;
            // try to match by name or old type name
            const dTypeName = (d.vehicleType || '').toLowerCase();
            if (dTypeName) {
                const globalV = vehicles.find(v => (v.name || '').toLowerCase() === dTypeName || (v.category || '').toLowerCase() === dTypeName);
                if (globalV) {
                    d.vehicleConfigurationId = globalV._id;
                    await d.save();
                    matched = true;
                    updated++;
                    console.log(`Updated driver ${d.name} to vehicle ${globalV.name}`);
                }
            }
            if (!matched && vehicles.length > 0) {
                // Just map them to the first vehicle if they are a bike, etc
                const isBike = dTypeName.includes('bike');
                const v = vehicles.find(v => (v.category||'').toLowerCase().includes(isBike ? 'bike' : 'economy')) || vehicles[0];
                d.vehicleConfigurationId = v._id;
                await d.save();
                updated++;
                console.log(`Fallback mapped driver ${d.name} to vehicle ${v.name}`);
            }
        }
        console.log(`Updated ${updated} drivers.`);
    } catch (e) {
        console.error("ERROR:", e.message);
    }
    process.exit(0);
});
