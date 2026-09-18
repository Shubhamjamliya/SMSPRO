import mongoose from 'mongoose';
import { PorterPricing } from '../models/porterPricing.model.js';
import { PorterZone } from '../models/porterZone.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import { parseListQuery, buildDateRangeFilter, toPorterPagination } from '../utils/pagination.util.js';
import { mapPricing, mapVehicle } from '../utils/mappers.util.js';
import {
    validateCreatePricingDto,
    validateUpdatePricingDto,
    validatePricingId,
    validatePricingStatusDto,
    validateZonePricingMatrixDto,
    legacyFieldsFromSlabs,
} from '../validators/pricing.validator.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import { validateVehicleId } from '../validators/vehicle.validator.js';
import { applySoftDelete } from '../utils/softDelete.util.js';
import { getMappedPorterVehicleOrThrow, listVehicles } from './vehicle.service.js';

const baseFilter = { isDeleted: { $ne: true } };

const buildSort = (sortBy, sortOrder) => {
    const allowed = ['status', 'baseFare', 'perKmRate', 'createdAt'];
    const key = allowed.includes(sortBy) ? sortBy : 'createdAt';
    return { [key]: sortOrder };
};

async function getVehicleOrThrow(vehicleId) {
    const { shaped } = await getMappedPorterVehicleOrThrow(vehicleId);
    return shaped;
}

async function getZoneOrNull(zoneId) {
    if (!zoneId) return null;
    return PorterZone.findOne({ _id: zoneId, isDeleted: { $ne: true } }).lean();
}

export async function listPricing(query = {}) {
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const filter = { ...baseFilter };

    if (parsed.status) filter.status = parsed.status;
    if (parsed.zoneId) filter.zoneId = parsed.zoneId === 'global' ? null : parsed.zoneId;

    if (parsed.search) {
        const vehiclesResult = await listVehicles({
            search: parsed.search,
            limit: 200,
            page: 1,
        });
        const ids = (vehiclesResult.records || []).map((v) => v.id).filter(Boolean);
        filter.vehicleId = { $in: ids };
    }

    const dateRange = buildDateRangeFilter(parsed.createdFrom, parsed.createdTo);
    if (dateRange) filter.createdAt = dateRange;

    const sort = buildSort(parsed.sortBy, parsed.sortOrder);

    const [docs, total] = await Promise.all([
        PorterPricing.find(filter)
            .sort(sort)
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        PorterPricing.countDocuments(filter),
    ]);

    const records = [];
    for (const doc of docs) {
        let vehicle = null;
        let zone = null;
        try {
            vehicle = await getVehicleOrThrow(doc.vehicleId);
        } catch {
            vehicle = { _id: doc.vehicleId, name: 'Unknown vehicle', status: 'inactive' };
        }
        try {
            zone = await getZoneOrNull(doc.zoneId);
        } catch {
            zone = null;
        }
        records.push(mapPricing(doc, vehicle, zone));
    }

    return toPorterPagination({ docs: records, total, page: parsed.page, limit: parsed.limit });
}

export async function getPricingById(id) {
    const pricingId = validatePricingId(id);
    const doc = await PorterPricing.findOne({ _id: pricingId, ...baseFilter }).lean();
    if (!doc) throw new NotFoundError('Pricing not found');

    const vehicle = await getVehicleOrThrow(doc.vehicleId);
    const zone = await getZoneOrNull(doc.zoneId);
    return mapPricing(doc, vehicle, zone);
}

export async function getPricingByVehicleId(vehicleIdRaw) {
    const vehicleId = validateVehicleId(vehicleIdRaw);
    const doc = await PorterPricing.findOne({
        vehicleId,
        zoneId: null,
        ...baseFilter,
    }).lean();

    if (!doc) throw new NotFoundError('Pricing not found for vehicle');
    const vehicle = await getVehicleOrThrow(vehicleId);
    return mapPricing(doc, vehicle, null);
}

export async function createPricing(body, reqUser) {
    const payload = validateCreatePricingDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);
    await getVehicleOrThrow(payload.vehicleId);

    const existing = await PorterPricing.findOne({
        vehicleId: payload.vehicleId,
        zoneId: payload.zoneId || null,
        isDeleted: { $ne: true },
    }).select('_id').lean();

    if (existing) {
        throw new ValidationError('Pricing already exists for this vehicle/zone');
    }

    const doc = await PorterPricing.create({
        ...payload,
        createdBy: performer,
        updatedBy: performer,
        statusHistory: [{ status: payload.status, changedBy: performer }],
    });

    const vehicle = await getVehicleOrThrow(payload.vehicleId);
    const zone = await getZoneOrNull(payload.zoneId);
    return mapPricing(doc.toObject(), vehicle, zone);
}

export async function updatePricing(id, body, reqUser) {
    const pricingId = validatePricingId(id);
    const payload = validateUpdatePricingDto(body);
    const doc = await PorterPricing.findOne({ _id: pricingId, ...baseFilter });
    if (!doc) throw new NotFoundError('Pricing not found');

    const performer = await resolveActionPerformerSnapshot(reqUser);
    Object.assign(doc, payload);
    doc.updatedBy = performer;
    await doc.save();

    const vehicle = await getVehicleOrThrow(doc.vehicleId);
    const zone = await getZoneOrNull(doc.zoneId);
    return mapPricing(doc.toObject(), vehicle, zone);
}

export async function updatePricingStatus(id, body, reqUser) {
    const pricingId = validatePricingId(id);
    const { status } = validatePricingStatusDto(body);
    const doc = await PorterPricing.findOne({ _id: pricingId, ...baseFilter });
    if (!doc) throw new NotFoundError('Pricing not found');

    const performer = await resolveActionPerformerSnapshot(reqUser);
    doc.status = status;
    doc.updatedBy = performer;
    doc.statusHistory.push({ status, changedBy: performer });
    await doc.save();

    const vehicle = await getVehicleOrThrow(doc.vehicleId);
    const zone = await getZoneOrNull(doc.zoneId);
    return mapPricing(doc.toObject(), vehicle, zone);
}

export async function deletePricing(id, reqUser) {
    const pricingId = validatePricingId(id);
    const doc = await PorterPricing.findOne({ _id: pricingId, ...baseFilter });
    if (!doc) throw new NotFoundError('Pricing not found');

    const performer = await resolveActionPerformerSnapshot(reqUser);
    applySoftDelete(doc, performer);
    await doc.save();

    return { id: pricingId };
}

export async function upsertVehiclePricing(vehicleIdRaw, body, reqUser) {
    const vehicleId = validateVehicleId(vehicleIdRaw);
    const existing = await PorterPricing.findOne({
        vehicleId,
        zoneId: null,
        isDeleted: { $ne: true },
    });

    if (existing) {
        return updatePricing(String(existing._id), body, reqUser);
    }
    return createPricing({ ...body, vehicleId }, reqUser);
}

export async function clearVehiclePricing(vehicleIdRaw, reqUser) {
    const vehicleId = validateVehicleId(vehicleIdRaw);
    const doc = await PorterPricing.findOne({
        vehicleId,
        zoneId: null,
        isDeleted: { $ne: true },
    });
    if (!doc) throw new NotFoundError('Pricing not found for vehicle');
    return deletePricing(String(doc._id), reqUser);
}

/**
 * Save zone-first matrix: one PorterPricing doc per vehicle for the zone,
 * all sharing the same distance slab ranges with per-vehicle distance + weight rates.
 */
export async function saveZonePricingMatrix(body, reqUser) {
    const payload = validateZonePricingMatrixDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);

    if (payload.zoneId) {
        const zone = await getZoneOrNull(payload.zoneId);
        if (!zone) throw new NotFoundError('Zone not found');
    }

    for (const vehicleId of payload.vehicleIds) {
        await getVehicleOrThrow(vehicleId);
    }

    const saved = [];
    for (const vehicleId of payload.vehicleIds) {
        const slabs = payload.slabs.map((slab) => {
            const rates = slab.vehicles[vehicleId] || {};
            return {
                fromKm: slab.fromKm,
                toKm: slab.toKm,
                baseFare: Number(rates.baseFare || 0),
                baseDistanceKm: Number(rates.baseDistanceKm || 0),
                perKmRate: Number(rates.perKmRate || 0),
                freeWeightKg: Number(rates.freeWeightKg || 0),
                perKgRate: Number(rates.perKgRate || 0),
                platformFee: Number(rates.platformFee || 0),
                surgeMultiplier: Number(rates.surgeMultiplier ?? 1) || 1,
            };
        });
        const legacy = legacyFieldsFromSlabs(slabs);
        const adminCommissionPercent = Math.min(
            100,
            Math.max(0, Number(payload.vehicleCommissions?.[vehicleId] ?? 0)),
        );
        const loading = payload.vehicleLoadingRules?.[vehicleId] || {};
        const freeLoadingMinutes = Math.max(
            0,
            Number(loading.freeLoadingMinutes ?? 60),
        );
        const extraLoadingPerMinCharge = Math.max(
            0,
            Number(loading.extraLoadingPerMinCharge ?? 3),
        );

        let doc = await PorterPricing.findOne({
            vehicleId,
            zoneId: payload.zoneId,
            ...baseFilter,
        });

        if (doc) {
            doc.slabs = slabs;
            Object.assign(doc, legacy);
            doc.adminCommissionPercent = adminCommissionPercent;
            doc.freeLoadingMinutes = freeLoadingMinutes;
            doc.extraLoadingPerMinCharge = extraLoadingPerMinCharge;
            doc.status = payload.status;
            doc.pricingConfigured = true;
            doc.updatedBy = performer;
            await doc.save();
        } else {
            doc = await PorterPricing.create({
                vehicleId,
                zoneId: payload.zoneId,
                slabs,
                ...legacy,
                adminCommissionPercent,
                freeLoadingMinutes,
                extraLoadingPerMinCharge,
                status: payload.status,
                pricingConfigured: true,
                createdBy: performer,
                updatedBy: performer,
                statusHistory: [{ status: payload.status, changedBy: performer }],
            });
        }

        const vehicle = await getVehicleOrThrow(vehicleId);
        const zone = await getZoneOrNull(payload.zoneId);
        saved.push(mapPricing(doc.toObject ? doc.toObject() : doc, vehicle, zone));
    }

    return {
        zoneId: payload.zoneId,
        status: payload.status,
        vehicleCount: saved.length,
        slabCount: payload.slabs.length,
        pricing: saved,
    };
}

export async function deleteZonePricingMatrix(zoneIdRaw, reqUser) {
    const performer = await resolveActionPerformerSnapshot(reqUser);
    const zoneId =
        !zoneIdRaw || zoneIdRaw === 'null' || zoneIdRaw === 'global'
            ? null
            : String(zoneIdRaw);

    if (zoneId) {
        if (!mongoose.Types.ObjectId.isValid(zoneId)) {
            throw new ValidationError('Invalid zone id');
        }
        const zone = await getZoneOrNull(zoneId);
        if (!zone) throw new NotFoundError('Zone not found');
    }

    const docs = await PorterPricing.find({
        ...baseFilter,
        zoneId,
    });

    for (const doc of docs) {
        doc.isDeleted = true;
        doc.deletedAt = new Date();
        doc.deletedBy = performer || null;
        doc.updatedBy = performer || null;
        await doc.save();
    }

    return { zoneId, deletedCount: docs.length };
}
