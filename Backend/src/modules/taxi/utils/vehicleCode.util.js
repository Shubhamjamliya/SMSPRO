import { TaxiVehicleType } from '../models/taxiVehicleType.model.js';

export async function generateVehicleTypeCode() {
    const latest = await TaxiVehicleType.findOne({
        isDeleted: { $ne: true },
        code: { $regex: /^TV\d+$/ },
    })
        .sort({ code: -1 })
        .select('code')
        .lean();

    if (!latest?.code) {
        return 'TV001';
    }

    const next = Number.parseInt(String(latest.code).replace(/\D/g, ''), 10) + 1;
    return `TV${String(next).padStart(3, '0')}`;
}
