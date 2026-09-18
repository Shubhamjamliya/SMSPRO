import { TaxiPricing } from '../models/taxiPricing.model.js';
import { GlobalSettings } from '../../../modules/common/models/settings.model.js';
import { TaxiZone } from '../models/taxiZone.model.js';
import mongoose from 'mongoose';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import { parseListQuery, buildDateRangeFilter, toTaxiPagination, escapeRegex } from '../utils/pagination.util.js';
import { mapPricing } from '../utils/mappers.util.js';
import {
    validateCreatePricingDto,
    validateUpdatePricingDto,
    validatePricingId,
    validatePricingStatusDto,
    validateZonePricingMatrixDto,
    legacyFieldsFromSlabs,
} from '../validators/pricing.validator.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import { validateVehicleTypeId } from '../validators/vehicleType.validator.js';

const baseFilter = { isDeleted: { $ne: true } };

const buildSort = (sortBy, sortOrder) => {
    const allowed = ['status', 'baseFare', 'perKmRate', 'surgeMultiplier', 'createdAt'];
    const key = allowed.includes(sortBy) ? sortBy : 'createdAt';
    return { [key]: sortOrder };
};

async function getVehicleTypeOrThrow(vehicleTypeId) {
    const settings = await GlobalSettings.findOne().lean();
    const doc = settings?.vehicleConfigurations?.find(
        (v) => String(v._id) === String(vehicleTypeId)
    );
    if (!doc) throw new NotFoundError('Vehicle type not found');
    return doc;
}

async function getZoneOrNull(zoneId) {
    if (!zoneId) return null;
    return TaxiZone.findOne({ _id: zoneId, isDeleted: { $ne: true } }).lean();
}

export async function listPricing(query = {}) {
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const filter = { ...baseFilter };

    if (parsed.status) filter.status = parsed.status;
    if (parsed.vehicleTypeId) filter.vehicleTypeId = parsed.vehicleTypeId;
    if (parsed.zoneId === 'null' || parsed.zoneId === 'global') {
        filter.zoneId = null;
    } else if (parsed.zoneId) {
        filter.zoneId = parsed.zoneId;
    }

    if (parsed.search) {
        const term = parsed.search.toLowerCase();
        const settings = await GlobalSettings.findOne().lean();
        const vehicles = settings?.vehicleConfigurations?.filter(
            (v) => 
                (v.name || '').toLowerCase().includes(term) ||
                (v.category || '').toLowerCase().includes(term) ||
                (v.code || '').toLowerCase().includes(term)
        ) || [];
        filter.vehicleTypeId = { $in: vehicles.map((v) => v._id) };
    }

    const dateRange = buildDateRangeFilter(parsed.createdFrom, parsed.createdTo);
    if (dateRange) filter.createdAt = dateRange;

    const sort = buildSort(parsed.sortBy, parsed.sortOrder);

    const [docs, total] = await Promise.all([
        TaxiPricing.find(filter)
            .sort(sort)
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        TaxiPricing.countDocuments(filter),
    ]);

    const vehicleTypeIds = [...new Set(docs.map((d) => String(d.vehicleTypeId)))];
    const zoneIds = [...new Set(docs.map((d) => (d.zoneId ? String(d.zoneId) : null)).filter(Boolean))];

    const settings = await GlobalSettings.findOne().lean();
    const allVehicles = settings?.vehicleConfigurations || [];
    const vehicles = allVehicles.filter(v => vehicleTypeIds.includes(String(v._id)));

    const [zones] = await Promise.all([
        zoneIds.length
            ? TaxiZone.find({ _id: { $in: zoneIds } }).select('name country status').lean()
            : Promise.resolve([]),
    ]);

    const vehicleMap = new Map(vehicles.map((v) => [String(v._id), v]));
    const zoneMap = new Map(zones.map((z) => [String(z._id), z]));

    const records = docs.map((doc) => mapPricing(
        doc,
        vehicleMap.get(String(doc.vehicleTypeId)),
        doc.zoneId ? zoneMap.get(String(doc.zoneId)) : null,
    ));

    return toTaxiPagination({ docs: records, total, page: parsed.page, limit: parsed.limit });
}

export async function getPricingById(id) {
    const pricingId = validatePricingId(id);
    const doc = await TaxiPricing.findOne({ _id: pricingId, ...baseFilter }).lean();
    if (!doc) throw new NotFoundError('Pricing not found');

    const vehicleType = await getVehicleTypeOrThrow(doc.vehicleTypeId);
    const zone = await getZoneOrNull(doc.zoneId);
    return mapPricing(doc, vehicleType, zone);
}

export async function getPricingByVehicleTypeId(vehicleTypeIdRaw, zoneId = null) {
    const vehicleTypeId = validateVehicleTypeId(vehicleTypeIdRaw);
    const filter = {
        vehicleTypeId,
        zoneId: zoneId || null,
        ...baseFilter,
    };
    let doc = await TaxiPricing.findOne(filter).lean();
    if (!doc && zoneId) {
        doc = await TaxiPricing.findOne({
            vehicleTypeId,
            zoneId: null,
            ...baseFilter,
        }).lean();
    }
    if (!doc) throw new NotFoundError('Pricing not found for vehicle type');
    const vehicleType = await getVehicleTypeOrThrow(vehicleTypeId);
    const zone = await getZoneOrNull(doc.zoneId);
    return mapPricing(doc, vehicleType, zone);
}

export async function createPricing(body, reqUser) {
    const payload = validateCreatePricingDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);
    await getVehicleTypeOrThrow(payload.vehicleTypeId);
    if (payload.zoneId) {
        const zone = await getZoneOrNull(payload.zoneId);
        if (!zone) throw new NotFoundError('Zone not found');
    }

    const existing = await TaxiPricing.findOne({
        vehicleTypeId: payload.vehicleTypeId,
        zoneId: payload.zoneId || null,
        isDeleted: { $ne: true },
    }).select('_id').lean();

    if (existing) {
        throw new ValidationError('Pricing already exists for this vehicle type and zone');
    }

    const doc = await TaxiPricing.create({
        ...payload,
        createdBy: performer,
        updatedBy: performer,
        statusHistory: [{ status: payload.status, changedBy: performer }],
    });

    const vehicleType = await getVehicleTypeOrThrow(payload.vehicleTypeId);
    const zone = await getZoneOrNull(payload.zoneId);
    return mapPricing(doc.toObject(), vehicleType, zone);
}

export async function updatePricing(id, body, reqUser) {
    const pricingId = validatePricingId(id);
    const payload = validateUpdatePricingDto(body);
    const doc = await TaxiPricing.findOne({ _id: pricingId, ...baseFilter });
    if (!doc) throw new NotFoundError('Pricing not found');

    const performer = await resolveActionPerformerSnapshot(reqUser);
    Object.assign(doc, payload);
    doc.updatedBy = performer;
    await doc.save();

    const vehicleType = await getVehicleTypeOrThrow(doc.vehicleTypeId);
    const zone = await getZoneOrNull(doc.zoneId);
    return mapPricing(doc.toObject(), vehicleType, zone);
}

export async function updatePricingStatus(id, body, reqUser) {
    const pricingId = validatePricingId(id);
    const { status } = validatePricingStatusDto(body);
    const doc = await TaxiPricing.findOne({ _id: pricingId, ...baseFilter });
    if (!doc) throw new NotFoundError('Pricing not found');

    const performer = await resolveActionPerformerSnapshot(reqUser);
    doc.status = status;
    doc.updatedBy = performer;
    doc.statusHistory.push({ status, changedBy: performer });
    await doc.save();

    const vehicleType = await getVehicleTypeOrThrow(doc.vehicleTypeId);
    const zone = await getZoneOrNull(doc.zoneId);
    return mapPricing(doc.toObject(), vehicleType, zone);
}

export async function deletePricing(id, reqUser) {
    const pricingId = validatePricingId(id);
    const performer = await resolveActionPerformerSnapshot(reqUser);

    const doc = await TaxiPricing.findOneAndUpdate(
        { _id: pricingId, ...baseFilter },
        {
            $set: {
                isDeleted: true,
                deletedAt: new Date(),
                deletedBy: performer || null,
                updatedBy: performer || null,
            },
        },
        { new: true },
    );

    if (!doc) throw new NotFoundError('Pricing not found');

    return { id: pricingId, deleted: true };
}

/**
 * Save zone-first matrix: one TaxiPricing doc per vehicle for the zone,
 * all sharing the same distance slab ranges with per-vehicle rates.
 */
export async function saveZonePricingMatrix(body, reqUser) {
    const payload = validateZonePricingMatrixDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);

    if (payload.zoneId) {
        const zone = await getZoneOrNull(payload.zoneId);
        if (!zone) throw new NotFoundError('Zone not found');
    }

    for (const vehicleTypeId of payload.vehicleTypeIds) {
        await getVehicleTypeOrThrow(vehicleTypeId);
    }

    const saved = [];
    for (const vehicleTypeId of payload.vehicleTypeIds) {
        const slabs = payload.slabs.map((slab) => {
            const rates = slab.vehicles[vehicleTypeId] || {};
            return {
                fromKm: slab.fromKm,
                toKm: slab.toKm,
                baseFare: Number(rates.baseFare || 0),
                baseDistanceKm: Number(rates.baseDistanceKm || 0),
                perKmRate: Number(rates.perKmRate || 0),
                perMinRate: Number(rates.perMinRate || 0),
                freeWaitMinutes: Number(rates.freeWaitMinutes || 0),
                perMinWaitRate: Number(rates.perMinWaitRate || 0),
                platformFee: Number(rates.platformFee || 0),
                surgeMultiplier: Number(rates.surgeMultiplier ?? 1) || 1,
            };
        });
        const legacy = legacyFieldsFromSlabs(slabs);
        const adminCommissionPercent = Math.min(
            100,
            Math.max(0, Number(payload.vehicleCommissions?.[vehicleTypeId] ?? 0)),
        );

        let doc = await TaxiPricing.findOne({
            vehicleTypeId,
            zoneId: payload.zoneId,
            ...baseFilter,
        });

        if (doc) {
            doc.slabs = slabs;
            Object.assign(doc, legacy);
            doc.adminCommissionPercent = adminCommissionPercent;
            doc.status = payload.status;
            doc.updatedBy = performer;
            await doc.save();
        } else {
            doc = await TaxiPricing.create({
                vehicleTypeId,
                zoneId: payload.zoneId,
                slabs,
                ...legacy,
                adminCommissionPercent,
                status: payload.status,
                createdBy: performer,
                updatedBy: performer,
                statusHistory: [{ status: payload.status, changedBy: performer }],
            });
        }

        const vehicleType = await getVehicleTypeOrThrow(vehicleTypeId);
        const zone = await getZoneOrNull(payload.zoneId);
        saved.push(mapPricing(doc.toObject ? doc.toObject() : doc, vehicleType, zone));
    }

    return {
        zoneId: payload.zoneId,
        status: payload.status,
        vehicleCount: saved.length,
        slabCount: payload.slabs.length,
        pricing: saved,
    };
}

/** Soft-delete all pricing rows for a zone (or global when zoneId is null/empty). */
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

    const filter = {
        ...baseFilter,
        zoneId,
    };

    const docs = await TaxiPricing.find(filter);
    for (const doc of docs) {
        doc.isDeleted = true;
        doc.deletedAt = new Date();
        doc.deletedBy = performer || null;
        doc.updatedBy = performer || null;
        await doc.save();
    }

    return { zoneId, deletedCount: docs.length };
}
