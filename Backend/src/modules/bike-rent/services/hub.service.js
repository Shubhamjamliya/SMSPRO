import { BikeRentHub } from '../models/bikeRentHub.model.js';
import { BikeRentZone } from '../models/bikeRentZone.model.js';
import { BikeUnit } from '../models/bikeUnit.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import { mapHub } from '../utils/mappers.util.js';
import {
    validateCreateHubDto,
    validateUpdateHubDto,
    validateHubId,
    validateHubStatusDto,
} from '../validators/hub.validator.js';
import { validateZoneId } from '../validators/zone.validator.js';
import { applySoftDelete } from '../utils/softDelete.util.js';
import { escapeRegex } from '../utils/pagination.util.js';

const baseFilter = { isDeleted: { $ne: true } };

/** ~80m — treat hubs this close as the same pickup point */
const DUPLICATE_LOCATION_METERS = 80;

function haversineMeters(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

async function assertNoDuplicateLocation({ zoneId, lat, lng, excludeHubId = null }) {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;

    const hubs = await BikeRentHub.find({
        ...baseFilter,
        zoneId,
        ...(excludeHubId ? { _id: { $ne: excludeHubId } } : {}),
        lat: { $ne: null },
        lng: { $ne: null },
    })
        .select('_id name lat lng')
        .lean();

    for (const hub of hubs) {
        const existingLat = Number(hub.lat);
        const existingLng = Number(hub.lng);
        if (!Number.isFinite(existingLat) || !Number.isFinite(existingLng)) continue;
        const distance = haversineMeters(latNum, lngNum, existingLat, existingLng);
        if (distance <= DUPLICATE_LOCATION_METERS) {
            throw new ValidationError(
                `A hub already exists near this location ("${hub.name}"). Pick a different spot or edit the existing hub.`,
            );
        }
    }
}

async function assertActiveZone(zoneId) {
    const zone = await BikeRentZone.findOne({
        _id: zoneId,
        ...baseFilter,
        status: 'active',
    }).select('_id name').lean();
    if (!zone) throw new ValidationError('Active Bike Rent zone is required');
    return zone;
}

export async function listHubsByZone(zoneId, query = {}, vendorScope = null) {
    const id = validateZoneId(zoneId);
    const filter = { ...baseFilter, zoneId: id };
    if (vendorScope) {
        filter.ownerType = 'vendor';
        filter.vendorId = vendorScope;
    }
    if (query.status === 'active' || query.status === 'inactive') {
        filter.status = query.status;
    }
    if (query.search) {
        const term = escapeRegex(String(query.search).trim());
        filter.$or = [
            { name: { $regex: term, $options: 'i' } },
            { address: { $regex: term, $options: 'i' } },
            { landmark: { $regex: term, $options: 'i' } },
        ];
    }
    const docs = await BikeRentHub.find(filter)
        .sort({ displayOrder: 1, name: 1 })
        .lean();

    const hubIds = docs.map((d) => d._id);
    let countMap = new Map();
    if (hubIds.length) {
        const rows = await BikeUnit.aggregate([
            { $match: { isDeleted: { $ne: true }, hubId: { $in: hubIds } } },
            { $group: { _id: '$hubId', bikeCount: { $sum: 1 } } },
        ]);
        countMap = new Map(rows.map((r) => [String(r._id), Number(r.bikeCount || 0)]));
    }

    return docs.map((doc) =>
        mapHub(doc, { bikeCount: countMap.get(String(doc._id)) || 0 }),
    );
}

/** All hubs owned by a vendor, across every zone by default (optionally narrowed to one). */
export async function listHubsForVendor(query = {}, vendorScope) {
    if (!vendorScope) throw new ValidationError('Vendor context is required');
    const filter = { ...baseFilter, ownerType: 'vendor', vendorId: vendorScope };
    if (query.zoneId) {
        filter.zoneId = validateZoneId(query.zoneId);
    }
    if (query.status === 'active' || query.status === 'inactive') {
        filter.status = query.status;
    }
    if (query.search) {
        const term = escapeRegex(String(query.search).trim());
        filter.$or = [
            { name: { $regex: term, $options: 'i' } },
            { address: { $regex: term, $options: 'i' } },
            { landmark: { $regex: term, $options: 'i' } },
        ];
    }
    const docs = await BikeRentHub.find(filter)
        .populate('zoneId', 'name country status')
        .sort({ displayOrder: 1, name: 1 })
        .lean();

    const hubIds = docs.map((d) => d._id);
    let countMap = new Map();
    if (hubIds.length) {
        const rows = await BikeUnit.aggregate([
            { $match: { isDeleted: { $ne: true }, hubId: { $in: hubIds } } },
            { $group: { _id: '$hubId', bikeCount: { $sum: 1 } } },
        ]);
        countMap = new Map(rows.map((r) => [String(r._id), Number(r.bikeCount || 0)]));
    }

    return docs.map((doc) =>
        mapHub(doc, { bikeCount: countMap.get(String(doc._id)) || 0 }),
    );
}

function assertHubOwnership(doc, vendorScope) {
    if (!vendorScope) return;
    if (doc.ownerType !== 'vendor' || String(doc.vendorId) !== String(vendorScope)) {
        throw new NotFoundError('Pickup hub not found');
    }
}

export async function getHubById(id, vendorScope = null) {
    const hubId = validateHubId(id);
    const doc = await BikeRentHub.findOne({ _id: hubId, ...baseFilter })
        .populate('zoneId', 'name country status')
        .lean();
    if (!doc) throw new NotFoundError('Pickup hub not found');
    assertHubOwnership(doc, vendorScope);
    return mapHub(doc);
}

export async function createHub(zoneId, body, reqUser, vendorScope = null) {
    const payload = validateCreateHubDto(body, zoneId);
    await assertActiveZone(payload.zoneId);

    const duplicate = await BikeRentHub.findOne({
        ...baseFilter,
        zoneId: payload.zoneId,
        name: { $regex: new RegExp(`^${escapeRegex(payload.name)}$`, 'i') },
    }).select('_id').lean();
    if (duplicate) {
        throw new ValidationError('A hub with this name already exists in the zone');
    }

    await assertNoDuplicateLocation({
        zoneId: payload.zoneId,
        lat: payload.lat,
        lng: payload.lng,
    });

    const performer = await resolveActionPerformerSnapshot(reqUser);
    const doc = await BikeRentHub.create({
        ...payload,
        ownerType: vendorScope ? 'vendor' : 'admin',
        vendorId: vendorScope || null,
        createdBy: performer,
        updatedBy: performer,
    });

    if (vendorScope) {
        const { BikeVendor } = await import('../models/bikeVendor.model.js');
        await BikeVendor.updateOne(
            { _id: vendorScope, zones: { $ne: payload.zoneId } },
            { $addToSet: { zones: payload.zoneId } },
        );
    }

    return mapHub(doc.toObject());
}

export async function updateHub(id, body, reqUser, vendorScope = null) {
    const hubId = validateHubId(id);
    const payload = validateUpdateHubDto(body);
    const doc = await BikeRentHub.findOne({ _id: hubId, ...baseFilter });
    if (!doc) throw new NotFoundError('Pickup hub not found');
    assertHubOwnership(doc, vendorScope);

    const nextZoneId = payload.zoneId || String(doc.zoneId);
    if (payload.zoneId) await assertActiveZone(payload.zoneId);

    if (payload.name) {
        const duplicate = await BikeRentHub.findOne({
            ...baseFilter,
            _id: { $ne: hubId },
            zoneId: nextZoneId,
            name: { $regex: new RegExp(`^${escapeRegex(payload.name)}$`, 'i') },
        }).select('_id').lean();
        if (duplicate) {
            throw new ValidationError('A hub with this name already exists in the zone');
        }
    }

    const nextLat = payload.lat != null ? payload.lat : doc.lat;
    const nextLng = payload.lng != null ? payload.lng : doc.lng;
    if (payload.lat != null || payload.lng != null) {
        await assertNoDuplicateLocation({
            zoneId: nextZoneId,
            lat: nextLat,
            lng: nextLng,
            excludeHubId: hubId,
        });
    }

    if (payload.maxBikes !== undefined && payload.maxBikes != null) {
        const assigned = await BikeUnit.countDocuments({
            ...baseFilter,
            hubId,
        });
        if (assigned > Number(payload.maxBikes)) {
            throw new ValidationError(
                `Cannot set max bikes to ${payload.maxBikes} — this hub already has ${assigned} bike(s). Reassign bikes first.`,
            );
        }
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    Object.assign(doc, payload);
    doc.updatedBy = performer;
    await doc.save();
    return mapHub(doc.toObject());
}

export async function updateHubStatus(id, body, reqUser, vendorScope = null) {
    const hubId = validateHubId(id);
    const { status } = validateHubStatusDto(body);
    const doc = await BikeRentHub.findOne({ _id: hubId, ...baseFilter });
    if (!doc) throw new NotFoundError('Pickup hub not found');
    assertHubOwnership(doc, vendorScope);
    const performer = await resolveActionPerformerSnapshot(reqUser);
    doc.status = status;
    doc.updatedBy = performer;
    await doc.save();
    return mapHub(doc.toObject());
}

export async function deleteHub(id, reqUser, vendorScope = null) {
    const hubId = validateHubId(id);
    const doc = await BikeRentHub.findOne({ _id: hubId, ...baseFilter });
    if (!doc) throw new NotFoundError('Pickup hub not found');
    assertHubOwnership(doc, vendorScope);

    const bikesUsingHub = await BikeUnit.countDocuments({
        ...baseFilter,
        hubId,
    });
    if (bikesUsingHub > 0) {
        throw new ValidationError(
            `Cannot delete hub — ${bikesUsingHub} bike(s) are assigned to it. Reassign those bikes first.`,
        );
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    applySoftDelete(doc, performer);
    doc.status = 'inactive';
    await doc.save();
    return { id: hubId };
}

export async function listHubDropdown(query = {}, vendorScope = null) {
    const filter = { ...baseFilter, status: 'active' };
    if (vendorScope) {
        // Vendors can pick up from their own hubs OR any active admin (platform) hub.
        filter.$or = [{ ownerType: 'admin' }, { vendorId: vendorScope }];
    }
    if (query.zoneId) {
        filter.zoneId = validateZoneId(query.zoneId);
    }
    const docs = await BikeRentHub.find(filter)
        .sort({ displayOrder: 1, name: 1 })
        .select('name address landmark zoneId lat lng status')
        .lean();
    return docs.map(mapHub);
}

/** Ensure hub exists, is active, and belongs to the given zone. */
export async function assertHubInZone(hubId, zoneId) {
    if (!hubId) throw new ValidationError('Pickup hub is required');
    const hub = await BikeRentHub.findOne({
        _id: hubId,
        ...baseFilter,
        status: 'active',
    }).select('_id zoneId name address landmark instructions lat lng maxBikes').lean();
    if (!hub) throw new ValidationError('Active pickup hub is required');
    if (String(hub.zoneId) !== String(zoneId)) {
        throw new ValidationError('Selected hub does not belong to the selected zone');
    }
    return hub;
}

/**
 * Enforce hub bike capacity (maxBikes).
 * excludeBikeId = bike being updated so it doesn't count against itself.
 */
export async function assertHubHasCapacity(hubId, { excludeBikeId = null } = {}) {
    if (!hubId) return;
    const hub = await BikeRentHub.findOne({
        _id: hubId,
        ...baseFilter,
    })
        .select('_id name maxBikes')
        .lean();
    if (!hub) throw new ValidationError('Pickup hub not found');

    const max = Number(hub.maxBikes);
    if (!Number.isFinite(max) || max < 1) return; // unlimited

    const filter = {
        ...baseFilter,
        hubId,
    };
    if (excludeBikeId) {
        filter._id = { $ne: excludeBikeId };
    }
    const count = await BikeUnit.countDocuments(filter);
    if (count >= max) {
        throw new ValidationError(
            `Hub "${hub.name}" is full (${count}/${max} bikes). Increase hub capacity or choose another hub.`,
        );
    }
}
