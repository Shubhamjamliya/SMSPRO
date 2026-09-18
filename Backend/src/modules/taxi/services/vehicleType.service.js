import { GlobalSettings } from '../../../modules/common/models/settings.model.js';
import { TaxiVehicleConfig } from '../models/taxiVehicleConfig.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import { mapVehicleType } from '../utils/mappers.util.js';
import {
    validateVehicleTypeId,
    validateVehicleSeatsDto,
} from '../validators/vehicleType.validator.js';

const MODULE_KEY = 'taxi';

const asPlainMappings = (raw) => {
    if (!raw) return {};
    if (raw instanceof Map) return Object.fromEntries(raw);
    return typeof raw === 'object' ? raw : {};
};

function isSeatsComplete(seats) {
    return Number(seats) >= 1 && Number(seats) <= 20;
}

async function loadGlobalTaxiVehicles() {
    const settings = await GlobalSettings.findOne().lean();
    if (!settings) return [];

    const mappings = asPlainMappings(settings.moduleVehicleMappings);
    const mappedIds = new Set((mappings[MODULE_KEY] || []).map(String));
    if (!mappedIds.size) return [];

    return (settings.vehicleConfigurations || [])
        .filter((v) => mappedIds.has(String(v._id)))
        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
}

async function loadConfigMap(vehicleIds = []) {
    if (!vehicleIds.length) return new Map();
    const docs = await TaxiVehicleConfig.find({
        vehicleConfigurationId: { $in: vehicleIds },
        isDeleted: { $ne: true },
    }).lean();
    return new Map(docs.map((d) => [String(d.vehicleConfigurationId), d]));
}

/**
 * Prefer taxi config seats; fall back to legacy global.seats so existing fleets keep working
 * until an admin re-saves seats in Taxi Vehicle Types.
 */
function toShaped(globalVehicle, config = null) {
    const legacySeats = Number(globalVehicle.seats || 0);
    const seats = config
        ? Number(config.seats || 0)
        : legacySeats;
    const seatsConfigured = config
        ? Boolean(config.seatsConfigured) || isSeatsComplete(config.seats)
        : isSeatsComplete(legacySeats);

    return {
        _id: globalVehicle._id,
        id: String(globalVehicle._id),
        name: globalVehicle.name || '',
        code: globalVehicle.code || '',
        category: globalVehicle.category || globalVehicle.name || '',
        icon: 'Car',
        iconUrl: globalVehicle.icon?.url || '',
        seats,
        seatsConfigured,
        seatsNote: seatsConfigured
            ? ''
            : 'Complete seats configuration so this vehicle is ready for taxi booking',
        status: globalVehicle.status || 'inactive',
        displayOrder: globalVehicle.displayOrder || 0,
        createdAt: globalVehicle.createdAt,
        updatedAt: config?.updatedAt || globalVehicle.updatedAt,
    };
}

export async function getMappedTaxiVehicleOrThrow(vehicleId, { requireActive = false, requireSeats = false } = {}) {
    const id = validateVehicleTypeId(vehicleId);
    const globals = await loadGlobalTaxiVehicles();
    const globalVehicle = globals.find((v) => String(v._id) === id);
    if (!globalVehicle) {
        throw new NotFoundError('Vehicle not found or not enabled for Taxi. Enable it in Global Settings → Module Vehicle Mapping.');
    }
    if (requireActive && globalVehicle.status !== 'active') {
        throw new NotFoundError('Vehicle is inactive');
    }

    const config = await TaxiVehicleConfig.findOne({
        vehicleConfigurationId: id,
        isDeleted: { $ne: true },
    }).lean();

    const shaped = toShaped(globalVehicle, config);
    if (requireSeats && !shaped.seatsConfigured) {
        throw new ValidationError('Vehicle seats are not configured for Taxi yet');
    }
    return { globalVehicle, config, shaped };
}

export async function listVehicleTypeDropdown() {
    const docs = await loadGlobalTaxiVehicles();
    const active = docs.filter((v) => v.status === 'active');
    const configMap = await loadConfigMap(active.map((v) => v._id));

    return active
        .map((doc) => {
            const shaped = toShaped(doc, configMap.get(String(doc._id)) || null);
            return {
                id: shaped.id,
                name: shaped.name,
                code: shaped.code,
                category: shaped.category,
                icon: shaped.iconUrl || '',
                seats: shaped.seats,
                seatsConfigured: shaped.seatsConfigured,
            };
        })
        .filter((v) => v.seatsConfigured);
}

export async function listVehicleTypes() {
    const docs = await loadGlobalTaxiVehicles();
    const configMap = await loadConfigMap(docs.map((v) => v._id));

    const records = docs.map((doc) => {
        const shaped = toShaped(doc, configMap.get(String(doc._id)) || null);
        return mapVehicleType(shaped);
    });

    return {
        records,
        pagination: { total: records.length, page: 1, limit: 100, totalPages: 1 },
    };
}

/** Upsert taxi seats for a globally mapped vehicle. */
export async function updateVehicleSeats(id, body, reqUser) {
    const vehicleId = validateVehicleTypeId(id);
    await getMappedTaxiVehicleOrThrow(vehicleId);

    const payload = validateVehicleSeatsDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);
    const seatsConfigured = isSeatsComplete(payload.seats);

    await TaxiVehicleConfig.findOneAndUpdate(
        { vehicleConfigurationId: vehicleId, isDeleted: { $ne: true } },
        {
            $set: {
                seats: payload.seats,
                seatsConfigured,
                updatedBy: performer,
            },
            $setOnInsert: {
                vehicleConfigurationId: vehicleId,
                createdBy: performer,
                isDeleted: false,
            },
        },
        { upsert: true, new: true },
    );

    const { shaped } = await getMappedTaxiVehicleOrThrow(vehicleId);
    return mapVehicleType(shaped);
}

export async function getVehicleTypeById() {
    throw new ValidationError('Use global settings to manage vehicles');
}

export async function createVehicleType() {
    throw new ValidationError('Create vehicles in Global Settings → Vehicle Configuration, then enable them for Taxi in Module Vehicle Mapping.');
}

export async function updateVehicleType(id, body, reqUser) {
    // Taxi admin only updates seats
    return updateVehicleSeats(id, body, reqUser);
}

export async function updateVehicleTypeStatus() {
    throw new ValidationError('Change vehicle status in Global Settings → Vehicle Configuration.');
}

export async function deleteVehicleType() {
    throw new ValidationError('Remove vehicles from Taxi via Global Settings → Module Vehicle Mapping.');
}
