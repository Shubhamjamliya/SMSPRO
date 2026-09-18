import { GlobalSettings } from '../../common/models/settings.model.js';
import { PorterVehicleConfig } from '../models/porterVehicleConfig.model.js';
import { PorterPricing } from '../models/porterPricing.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import { parseListQuery, toPorterPagination } from '../utils/pagination.util.js';
import { mapVehicle } from '../utils/mappers.util.js';
import {
    validateVehicleId,
    validateVehicleCapacityDto,
} from '../validators/vehicle.validator.js';
import { validateListQuery } from '../validators/listQuery.validator.js';

const MODULE_KEY = 'porter';

const asPlainMappings = (raw) => {
    if (!raw) return {};
    if (raw instanceof Map) return Object.fromEntries(raw);
    return typeof raw === 'object' ? raw : {};
};

function isCapacityComplete(config = {}) {
    const maxW = Number(config.maxWeight || 0);
    const l = Number(config.maxLengthCm || 0);
    const w = Number(config.maxWidthCm || 0);
    const h = Number(config.maxHeightCm || 0);
    return maxW > 0 && l > 0 && w > 0 && h > 0;
}

async function loadGlobalPorterVehicles() {
    const settings = await GlobalSettings.findOne().lean();
    if (!settings) return [];

    const mappings = asPlainMappings(settings.moduleVehicleMappings);
    const mappedIds = new Set((mappings[MODULE_KEY] || []).map(String));
    if (!mappedIds.size) return [];

    return (settings.vehicleConfigurations || [])
        .filter((v) => mappedIds.has(String(v._id)))
        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
}

export async function countActivePorterVehicles() {
    const docs = await loadGlobalPorterVehicles();
    return docs.filter((v) => v.status === 'active').length;
}

async function loadConfigMap(vehicleIds = []) {
    if (!vehicleIds.length) return new Map();
    const docs = await PorterVehicleConfig.find({
        vehicleConfigurationId: { $in: vehicleIds },
        isDeleted: { $ne: true },
    }).lean();
    return new Map(docs.map((d) => [String(d.vehicleConfigurationId), d]));
}

async function attachPricingMap(vehicleIds = []) {
    if (!vehicleIds.length) return new Map();
    const pricingDocs = await PorterPricing.find({
        vehicleId: { $in: vehicleIds },
        status: 'active',
        isDeleted: { $ne: true },
    }).lean();
    const map = new Map();
    for (const doc of pricingDocs) {
        const key = String(doc.vehicleId);
        const existing = map.get(key);
        // Prefer global (zoneId null); otherwise keep first configured row
        if (!existing || (doc.zoneId == null && existing.zoneId != null)) {
            map.set(key, doc);
        }
    }
    return map;
}

function toGlobalDocShape(globalVehicle, config = null) {
    return {
        _id: globalVehicle._id,
        name: globalVehicle.name,
        vehicleCode: globalVehicle.code || '',
        code: globalVehicle.code || '',
        category: globalVehicle.category || globalVehicle.name || '',
        icon: 'Truck',
        iconUrl: globalVehicle.icon?.url || '',
        seats: 0,
        status: globalVehicle.status || 'inactive',
        displayOrder: globalVehicle.displayOrder || 0,
        description: config?.description || '',
        minWeight: config?.minWeight ?? 0,
        maxWeight: config?.maxWeight ?? 0,
        maxLengthCm: config?.maxLengthCm ?? 0,
        maxWidthCm: config?.maxWidthCm ?? 0,
        maxHeightCm: config?.maxHeightCm ?? 0,
        sizeLabel: config?.sizeLabel || '',
        capacityConfigured: Boolean(config?.capacityConfigured) || isCapacityComplete(config || {}),
        createdAt: globalVehicle.createdAt,
        updatedAt: config?.updatedAt || globalVehicle.updatedAt,
    };
}

/**
 * Resolve a global vehicle enabled for Porter (+ optional capacity config).
 * Throws if not mapped / not found.
 */
export async function getMappedPorterVehicleOrThrow(vehicleId, { requireActive = false, requireCapacity = false } = {}) {
    const id = validateVehicleId(vehicleId);
    const globals = await loadGlobalPorterVehicles();
    const globalVehicle = globals.find((v) => String(v._id) === id);
    if (!globalVehicle) {
        throw new NotFoundError('Vehicle not found or not enabled for Porter. Enable it in Global Settings → Module Vehicle Mapping.');
    }
    if (requireActive && globalVehicle.status !== 'active') {
        throw new NotFoundError('Vehicle is inactive');
    }

    const config = await PorterVehicleConfig.findOne({
        vehicleConfigurationId: id,
        isDeleted: { $ne: true },
    }).lean();

    const shaped = toGlobalDocShape(globalVehicle, config);
    if (requireCapacity && !shaped.capacityConfigured) {
        throw new ValidationError('Vehicle capacity is not configured for Porter yet');
    }
    return { globalVehicle, config, shaped };
}

export async function listVehicles(query = {}) {
    validateListQuery(query);
    const parsed = parseListQuery(query);

    let docs = await loadGlobalPorterVehicles();

    if (parsed.status) {
        docs = docs.filter((v) => v.status === parsed.status);
    }
    if (parsed.category) {
        docs = docs.filter((v) => String(v.category || '') === parsed.category);
    }
    if (parsed.search) {
        const term = String(parsed.search).trim().toLowerCase();
        docs = docs.filter((v) => {
            const hay = `${v.name || ''} ${v.category || ''} ${v.code || ''}`.toLowerCase();
            return hay.includes(term);
        });
    }

    const total = docs.length;
    const pageDocs = docs.slice(parsed.skip, parsed.skip + parsed.limit);
    const ids = pageDocs.map((v) => v._id);
    const [configMap, pricingMap] = await Promise.all([
        loadConfigMap(ids),
        attachPricingMap(ids),
    ]);

    const records = pageDocs.map((doc) => {
        const config = configMap.get(String(doc._id)) || null;
        const shaped = toGlobalDocShape(doc, config);
        return mapVehicle(shaped, pricingMap.get(String(doc._id)) || null);
    });

    return toPorterPagination({ docs: records, total, page: parsed.page, limit: parsed.limit });
}

export async function getVehicleById(id) {
    const { shaped } = await getMappedPorterVehicleOrThrow(id);
    const pricing = await PorterPricing.findOne({
        vehicleId: id,
        zoneId: null,
        isDeleted: { $ne: true },
    }).lean();
    return mapVehicle(shaped, pricing);
}

/** Upsert Porter capacity / size for a globally mapped vehicle. */
export async function updateVehicleCapacity(id, body, reqUser) {
    const vehicleId = validateVehicleId(id);
    await getMappedPorterVehicleOrThrow(vehicleId);

    const payload = validateVehicleCapacityDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);
    const capacityConfigured = isCapacityComplete(payload);

    const doc = await PorterVehicleConfig.findOneAndUpdate(
        { vehicleConfigurationId: vehicleId, isDeleted: { $ne: true } },
        {
            $set: {
                ...payload,
                capacityConfigured,
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

    const pricing = await PorterPricing.findOne({
        vehicleId,
        zoneId: null,
        isDeleted: { $ne: true },
    }).lean();

    const { shaped } = await getMappedPorterVehicleOrThrow(vehicleId);
    return mapVehicle(shaped, pricing);
}

export async function createVehicle() {
    throw new ValidationError('Create vehicles in Global Settings → Vehicle Configuration, then enable them for Porter in Module Vehicle Mapping.');
}

export async function updateVehicle(id, body, reqUser) {
    // Capacity-only updates from Porter admin
    return updateVehicleCapacity(id, body, reqUser);
}

export async function updateVehicleStatus() {
    throw new ValidationError('Change vehicle status in Global Settings → Vehicle Configuration.');
}

export async function deleteVehicle() {
    throw new ValidationError('Remove vehicles from Porter via Global Settings → Module Vehicle Mapping.');
}

export async function listVehicleDropdown() {
    const docs = await loadGlobalPorterVehicles();
    const active = docs.filter((v) => v.status === 'active');
    const ids = active.map((v) => v._id);
    const [configMap, pricingMap] = await Promise.all([
        loadConfigMap(ids),
        attachPricingMap(ids),
    ]);

    return active
        .map((doc) => {
            const config = configMap.get(String(doc._id)) || null;
            const shaped = toGlobalDocShape(doc, config);
            return mapVehicle(shaped, pricingMap.get(String(doc._id)) || null);
        })
        .filter((v) => v.capacityConfigured);
}

/** Public catalog — only active + capacity-configured vehicles. */
export async function listPublicVehicles() {
    const docs = await loadGlobalPorterVehicles();
    const active = docs.filter((v) => v.status === 'active');
    const ids = active.map((v) => v._id);
    const [configMap, pricingMap] = await Promise.all([
        loadConfigMap(ids),
        attachPricingMap(ids),
    ]);

    return active
        .map((doc) => {
            const config = configMap.get(String(doc._id)) || null;
            const shaped = toGlobalDocShape(doc, config);
            return mapVehicle(shaped, pricingMap.get(String(doc._id)) || null);
        })
        .filter((v) => v.capacityConfigured);
}

/**
 * Vehicles available near pickup for booking UI.
 * - Only types with an online Porter partner of that type within admin search radius
 * - Unpriced types are returned but not selectable
 * - Priced types include a live quote when drop is provided
 */
export async function listAvailableVehiclesForRoute(body = {}) {
    const pickup = body.pickup || {};
    const drop = body.drop || null;
    const parcel = body.parcel || {};

    const lat = Number(pickup.lat ?? pickup.latitude);
    const lng = Number(pickup.lng ?? pickup.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new ValidationError('Pickup lat/lng are required');
    }

    const placePickup = {
        lat,
        lng,
        address: pickup.address || pickup.title || '',
    };

    const { getSearchRadiusKm } = await import('./settings.service.js');
    const { findNearbyPorterDrivers } = await import('./tripDispatch.service.js');
    const { quoteTrip } = await import('./trip.service.js');

    const [vehicles, searchRadiusKm] = await Promise.all([
        listPublicVehicles(),
        getSearchRadiusKm(),
    ]);

    const allowedVehicleIds = new Set(vehicles.map((v) => String(v.id)));
    const nearbyPartners = await findNearbyPorterDrivers(placePickup, {
        allowedVehicleIds,
    });

    const partnersByVehicle = new Map();

    for (const p of nearbyPartners) {
        // Only count partners whose Porter enrollment vehicle is in the Porter catalog.
        // No taxi top-level ID / fuzzy name matching — that was leaking taxi types here.
        const key = p.vehicleConfigurationId && allowedVehicleIds.has(String(p.vehicleConfigurationId))
            ? String(p.vehicleConfigurationId)
            : null;
        if (!key) continue;
        if (!partnersByVehicle.has(key)) partnersByVehicle.set(key, []);
        partnersByVehicle.get(key).push(p);
    }

    const dropLat = drop != null ? Number(drop.lat ?? drop.latitude) : NaN;
    const dropLng = drop != null ? Number(drop.lng ?? drop.longitude) : NaN;
    const hasDrop = Number.isFinite(dropLat) && Number.isFinite(dropLng);
    const placeDrop = hasDrop
        ? {
            lat: dropLat,
            lng: dropLng,
            address: drop.address || drop.title || '',
        }
        : null;

    const results = [];

    for (const vehicle of vehicles) {
        const partners = partnersByVehicle.get(String(vehicle.id)) || [];
        if (!partners.length) continue;

        const nearest = partners[0];
        const pricingConfigured = Boolean(vehicle.pricingConfigured);
        const baseRow = {
            vehicle,
            pricingConfigured,
            selectable: false,
            nearbyPartners: partners.length,
            nearestPartnerDistanceKm: nearest?.distanceKm ?? null,
            searchRadiusKm,
            fare: null,
            fareEstimateTotal: null,
            distanceKm: null,
            durationMin: null,
            zoneId: null,
            error: null,
        };

        if (!pricingConfigured) {
            results.push({
                ...baseRow,
                error: 'Prices are not configured',
            });
            continue;
        }

        if (!hasDrop) {
            results.push({
                ...baseRow,
                selectable: true,
            });
            continue;
        }

        try {
            const quote = await quoteTrip({
                vehicleId: vehicle.id,
                pickup: placePickup,
                drop: placeDrop,
                parcel: {
                    weightKg: Number(parcel.weightKg || 0),
                    description: parcel.description || parcel.parcelDescription || '',
                },
            });
            results.push({
                ...baseRow,
                selectable: true,
                vehicle: quote.vehicle || vehicle,
                fare: quote.fare,
                fareEstimateTotal: quote.fareEstimateTotal ?? quote.fare?.total,
                distanceKm: quote.distanceKm,
                durationMin: quote.durationMin,
                zoneId: quote.zoneId,
                freeLoadingMinutes: quote.freeLoadingMinutes,
                extraLoadingPerMinCharge: quote.extraLoadingPerMinCharge,
                pricing: quote.pricing || null,
                error: null,
            });
        } catch (err) {
            results.push({
                ...baseRow,
                error: err?.message || 'Unavailable for this route',
            });
        }
    }

    return {
        searchRadiusKm,
        vehicles: results,
    };
}

export async function uploadVehicleIcon() {
    throw new ValidationError('Upload vehicle icons in Global Settings → Vehicle Configuration.');
}
