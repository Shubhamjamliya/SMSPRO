import { BikeRentZone } from '../models/bikeRentZone.model.js';
import { BikeRentHub } from '../models/bikeRentHub.model.js';
import { BikeUnit } from '../models/bikeUnit.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import {
    parseListQuery,
    buildDateRangeFilter,
    toBikeRentPagination,
    escapeRegex,
} from '../utils/pagination.util.js';
import { mapZone } from '../utils/mappers.util.js';
import { isPointInPolygon, toFiniteNumber, polygonArea } from '../utils/geo.util.js';
import {
    validateCreateZoneDto,
    validateUpdateZoneDto,
    validateZoneId,
    validateZoneStatusDto,
} from '../validators/zone.validator.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import { applySoftDelete } from '../utils/softDelete.util.js';

const baseFilter = { isDeleted: { $ne: true } };

async function loadActiveZonesWithPolygons() {
    return BikeRentZone.find({
        ...baseFilter,
        status: 'active',
        'coordinates.2': { $exists: true },
    })
        .sort({ displayOrder: 1, createdAt: 1 })
        .lean();
}

/** All active zones whose polygon contains the point, smallest first. */
export async function findContainingZones(latInput, lngInput) {
    const lat = toFiniteNumber(latInput);
    const lng = toFiniteNumber(lngInput);
    if (lat === null || lng === null) return [];

    const zones = await loadActiveZonesWithPolygons();
    const hits = [];
    for (const zone of zones) {
        const coords = Array.isArray(zone.coordinates) ? zone.coordinates : [];
        if (coords.length < 3) continue;
        if (isPointInPolygon(lat, lng, coords)) {
            hits.push({ zone, area: polygonArea(coords) });
        }
    }
    hits.sort((a, b) => a.area - b.area || String(a.zone._id).localeCompare(String(b.zone._id)));
    return hits.map((h) => h.zone);
}

const BOOKABLE_BIKE_FILTER = {
    isDeleted: { $ne: true },
    isActive: true,
    maintenanceStatus: 'none',
    availabilityStatus: { $nin: ['maintenance', 'disabled', 'unavailable'] },
    approvalStatus: { $nin: ['pending', 'rejected'] },
};

/**
 * Among zones that geographically contain a point (smallest first), prefer the smallest zone
 * that actually has bookable bikes. Without this, an arbitrarily nested/overlapping zone with
 * no inventory yet (e.g. a newly drawn sub-zone) silently wins purely on polygon area and hides
 * bikes that exist in a sibling zone covering the same point — the rider sees "no bikes" despite
 * being genuinely inside a serviceable area. Falls back to the smallest zone overall (possibly
 * with zero bikes) only when none of the overlapping zones has any bookable inventory.
 */
async function pickPrimaryZone(containingZones) {
    if (containingZones.length <= 1) return containingZones[0] || null;
    const zoneIds = containingZones.map((z) => z._id);
    const withBikes = await BikeUnit.distinct('zoneId', {
        ...BOOKABLE_BIKE_FILTER,
        zoneId: { $in: zoneIds },
    });
    const withBikesSet = new Set(withBikes.map((id) => String(id)));
    return containingZones.find((z) => withBikesSet.has(String(z._id))) || containingZones[0];
}

/**
 * Resolve the single primary zone for a point, plus every overlapping zone id it also falls
 * inside (kept for callers that want the full match set). Single source of truth for both
 * `detectZone` and the catalog's browse-by-location resolution, so the zone shown to the rider
 * always matches the zone their bikes are actually queried from.
 */
export async function resolvePrimaryZoneForPoint(latInput, lngInput) {
    const containing = await findContainingZones(latInput, lngInput);
    if (!containing.length) return null;
    const zone = await pickPrimaryZone(containing);
    return { zone, matchedZoneIds: containing.map((z) => String(z._id)) };
}

/** Public: detect active Bike Rent zone for lat/lng (independent of Food/Porter/QC zones). */
export async function detectZone(latInput, lngInput) {
    const lat = toFiniteNumber(latInput);
    const lng = toFiniteNumber(lngInput);
    if (lat === null || lng === null) {
        throw new ValidationError('lat and lng are required');
    }

    const resolved = await resolvePrimaryZoneForPoint(lat, lng);
    if (!resolved) {
        return {
            status: 'OUT_OF_SERVICE',
            zoneId: null,
            zone: null,
        };
    }

    return {
        status: 'IN_SERVICE',
        zoneId: String(resolved.zone._id),
        zone: mapZone(resolved.zone),
        matchedZoneIds: resolved.matchedZoneIds,
    };
}

async function attachBikeStats(zoneDocs = []) {
    const ids = zoneDocs.map((z) => z._id);
    if (!ids.length) return new Map();

    const [bikeRows, hubRows] = await Promise.all([
        BikeUnit.aggregate([
            { $match: { isDeleted: { $ne: true }, zoneId: { $in: ids } } },
            {
                $group: {
                    _id: '$zoneId',
                    bikes: { $sum: 1 },
                    availableBikes: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$isActive', true] },
                                        { $eq: ['$availabilityStatus', 'available'] },
                                        { $eq: ['$maintenanceStatus', 'none'] },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                },
            },
        ]),
        BikeRentHub.aggregate([
            { $match: { isDeleted: { $ne: true }, zoneId: { $in: ids } } },
            {
                $group: {
                    _id: '$zoneId',
                    hubCount: { $sum: 1 },
                },
            },
        ]),
    ]);

    const map = new Map();
    for (const id of ids) {
        map.set(String(id), { bikes: 0, availableBikes: 0, hubCount: 0 });
    }
    for (const row of bikeRows) {
        const key = String(row._id);
        map.set(key, {
            ...(map.get(key) || {}),
            bikes: Number(row.bikes || 0),
            availableBikes: Number(row.availableBikes || 0),
        });
    }
    for (const row of hubRows) {
        const key = String(row._id);
        map.set(key, {
            ...(map.get(key) || {}),
            hubCount: Number(row.hubCount || 0),
        });
    }
    return map;
}

const buildSort = (sortBy, sortOrder) => {
    const allowed = ['name', 'country', 'status', 'displayOrder', 'createdAt'];
    const key = allowed.includes(sortBy) ? sortBy : 'displayOrder';
    return { [key]: sortOrder };
};

function assertZoneOwnership(doc, vendorScope) {
    if (!vendorScope) return;
    if (doc.ownerType !== 'vendor' || String(doc.vendorId) !== String(vendorScope)) {
        throw new NotFoundError('Bike Rent zone not found');
    }
}

export async function listZones(query = {}, { populateVendor = false } = {}) {
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const filter = { ...baseFilter };

    if (parsed.status) filter.status = parsed.status;
    if (parsed.country) filter.country = parsed.country;

    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        filter.$or = [
            { name: { $regex: term, $options: 'i' } },
            { country: { $regex: term, $options: 'i' } },
        ];
    }

    const dateRange = buildDateRangeFilter(parsed.createdFrom, parsed.createdTo);
    if (dateRange) filter.createdAt = dateRange;

    const sort = buildSort(parsed.sortBy, parsed.sortOrder);

    let cursor = BikeRentZone.find(filter).sort(sort).skip(parsed.skip).limit(parsed.limit);
    if (populateVendor) cursor = cursor.populate('vendorId', 'businessName vendorCode');

    const [docs, total] = await Promise.all([
        cursor.lean(),
        BikeRentZone.countDocuments(filter),
    ]);

    const statsMap = await attachBikeStats(docs);

    return toBikeRentPagination({
        docs: docs.map((doc) => mapZone(doc, statsMap.get(String(doc._id)) || {})),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

/** Viewing a single zone is unrestricted (any vendor may view any zone); only mutations are ownership-scoped. */
export async function getZoneById(id) {
    const zoneId = validateZoneId(id);
    const doc = await BikeRentZone.findOne({ _id: zoneId, ...baseFilter }).lean();
    if (!doc) throw new NotFoundError('Bike Rent zone not found');
    return mapZone(doc);
}

export async function createZone(body, reqUser, vendorScope = null) {
    const payload = validateCreateZoneDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);

    const existing = await BikeRentZone.findOne({
        ...baseFilter,
        name: { $regex: new RegExp(`^${escapeRegex(payload.name)}$`, 'i') },
        country: payload.country,
    }).select('_id').lean();

    if (existing) {
        throw new ValidationError('Zone with this name already exists in the country');
    }

    const doc = await BikeRentZone.create({
        ...payload,
        ownerType: vendorScope ? 'vendor' : 'admin',
        vendorId: vendorScope || null,
        createdBy: performer,
        updatedBy: performer,
        statusHistory: [{ status: payload.status, changedBy: performer }],
    });

    return mapZone(doc.toObject());
}

export async function updateZone(id, body, reqUser, vendorScope = null) {
    const zoneId = validateZoneId(id);
    const payload = validateUpdateZoneDto(body);
    const doc = await BikeRentZone.findOne({ _id: zoneId, ...baseFilter });
    if (!doc) throw new NotFoundError('Bike Rent zone not found');
    assertZoneOwnership(doc, vendorScope);

    if (payload.name || payload.country) {
        const name = payload.name ?? doc.name;
        const country = payload.country ?? doc.country;
        const duplicate = await BikeRentZone.findOne({
            ...baseFilter,
            _id: { $ne: zoneId },
            name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
            country,
        }).select('_id').lean();
        if (duplicate) {
            throw new ValidationError('Zone with this name already exists in the country');
        }
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    Object.assign(doc, payload);
    doc.updatedBy = performer;
    await doc.save();

    return mapZone(doc.toObject());
}

export async function updateZoneStatus(id, body, reqUser, vendorScope = null) {
    const zoneId = validateZoneId(id);
    const { status } = validateZoneStatusDto(body);
    const doc = await BikeRentZone.findOne({ _id: zoneId, ...baseFilter });
    if (!doc) throw new NotFoundError('Bike Rent zone not found');
    assertZoneOwnership(doc, vendorScope);

    const performer = await resolveActionPerformerSnapshot(reqUser);
    doc.status = status;
    doc.updatedBy = performer;
    doc.statusHistory.push({ status, changedBy: performer });
    await doc.save();

    return mapZone(doc.toObject());
}

export async function deleteZone(id, reqUser, vendorScope = null) {
    const zoneId = validateZoneId(id);
    const doc = await BikeRentZone.findOne({ _id: zoneId, ...baseFilter });
    if (!doc) throw new NotFoundError('Bike Rent zone not found');
    assertZoneOwnership(doc, vendorScope);

    const hubsInZone = await BikeRentHub.countDocuments({
        ...baseFilter,
        zoneId,
    });
    if (hubsInZone > 0) {
        throw new ValidationError(
            `Cannot delete zone — ${hubsInZone} pickup hub(s) still belong to it. Remove those hubs first.`,
        );
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    applySoftDelete(doc, performer);
    await doc.save();

    return { id: zoneId };
}

export async function listZoneDropdown() {
    const docs = await BikeRentZone.find({ ...baseFilter, status: 'active' })
        .sort({ displayOrder: 1, name: 1 })
        .select('name country unit status')
        .lean();

    return docs.map((doc) => mapZone(doc));
}

export async function listPublicZones() {
    const docs = await BikeRentZone.find({
        ...baseFilter,
        status: 'active',
    })
        .sort({ displayOrder: 1, name: 1 })
        .select('name country unit status coordinates displayOrder pickupHub createdAt')
        .lean();

    return docs.map((doc) => mapZone(doc));
}
