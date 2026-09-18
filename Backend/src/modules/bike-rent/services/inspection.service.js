import mongoose from 'mongoose';
import {
    BikeInspection,
    BIKE_INSPECTION_ANGLES,
    BIKE_INSPECTION_TYPES,
    BIKE_RETURN_CONDITION,
} from '../models/bikeInspection.model.js';
import { BikeBooking } from '../models/bikeBooking.model.js';
import { BikeUnit } from '../models/bikeUnit.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import {
    parseListQuery,
    toBikeRentPagination,
    escapeRegex,
} from '../utils/pagination.util.js';
import { validateListQuery } from '../validators/listQuery.validator.js';

const baseFilter = { isDeleted: { $ne: true } };

const toId = (value) => {
    if (!value) return null;
    if (typeof value === 'object' && value._id) return String(value._id);
    return String(value);
};

const normalizeMediaList = (items = [], { asVideo = false } = {}) => {
    if (!Array.isArray(items)) return [];
    return items
        .map((item) => {
            if (!item) return null;
            if (typeof item === 'string') {
                const url = item.trim();
                if (!url) return null;
                return {
                    url,
                    publicId: '',
                    angle: 'other',
                    caption: '',
                    resourceType: asVideo ? 'video' : 'image',
                };
            }
            const url = String(item.url || '').trim();
            if (!url) return null;
            const angle = String(item.angle || 'other').toLowerCase();
            return {
                url,
                publicId: String(item.publicId || '').trim(),
                angle: BIKE_INSPECTION_ANGLES.includes(angle) ? angle : 'other',
                caption: String(item.caption || '').trim().slice(0, 300),
                resourceType: String(
                    item.resourceType
                        || (asVideo ? 'video' : 'image'),
                ).toLowerCase(),
            };
        })
        .filter(Boolean)
        .slice(0, 30);
};

const normalizeDamages = (items = []) => {
    if (!Array.isArray(items)) return [];
    return items
        .map((item) => {
            if (!item) return null;
            const description = String(item.description || '').trim().slice(0, 1000);
            if (!description && !Number(item.estimatedCost)) return null;
            return {
                description,
                severity: ['low', 'medium', 'high'].includes(String(item.severity || ''))
                    ? String(item.severity)
                    : '',
                estimatedCost: Math.max(0, Number(item.estimatedCost) || 0),
                images: normalizeMediaList(item.images || []),
                videos: normalizeMediaList(item.videos || [], { asVideo: true }),
            };
        })
        .filter(Boolean)
        .slice(0, 20);
};

export function mapInspection(doc = {}) {
    return {
        id: toId(doc),
        bookingId: toId(doc.bookingId),
        bikeId: toId(doc.bikeId),
        userId: toId(doc.userId),
        inspectionType: doc.inspectionType || '',
        images: Array.isArray(doc.images) ? doc.images : [],
        videos: Array.isArray(doc.videos) ? doc.videos : [],
        conditionNotes: doc.conditionNotes || '',
        fuelLevel: doc.fuelLevel || '',
        meterReading: doc.meterReading == null ? null : Number(doc.meterReading),
        damages: Array.isArray(doc.damages) ? doc.damages : [],
        returnCondition: doc.returnCondition || '',
        repairCharges: Number(doc.repairCharges || 0),
        comparedWithInspectionId: toId(doc.comparedWithInspectionId),
        pickupCodeVerified: Boolean(doc.pickupCodeVerified),
        inspectedBy: doc.inspectedBy || null,
        inspectedAt: doc.inspectedAt || doc.createdAt || null,
        createdAt: doc.createdAt || null,
        updatedAt: doc.updatedAt || null,
    };
}

export function validateInspectionPayload(body = {}, { type }) {
    if (!BIKE_INSPECTION_TYPES.includes(type)) {
        throw new ValidationError('Invalid inspection type');
    }

    const images = normalizeMediaList(body.images || []);
    const videos = normalizeMediaList(body.videos || [], { asVideo: true });
    // Photos are required; video is always optional.
    if (images.length < 1) {
        throw new ValidationError('Upload at least one inspection photo');
    }

    const meterRaw = body.meterReading;
    let meterReading = null;
    if (meterRaw !== undefined && meterRaw !== null && String(meterRaw).trim() !== '') {
        meterReading = Number(meterRaw);
        if (!Number.isFinite(meterReading) || meterReading < 0) {
            throw new ValidationError('Meter reading must be a non-negative number');
        }
    }

    const payload = {
        images,
        videos,
        conditionNotes: String(body.conditionNotes || '').trim().slice(0, 4000),
        fuelLevel: String(body.fuelLevel || '').trim().slice(0, 80),
        meterReading,
        damages: normalizeDamages(body.damages || []),
    };

    if (type === 'RETURN') {
        const condition = String(body.returnCondition || '').toLowerCase();
        if (!BIKE_RETURN_CONDITION.includes(condition)) {
            throw new ValidationError(
                'Return condition must be same_condition or damage_found',
            );
        }
        payload.returnCondition = condition;
        payload.repairCharges = Math.max(0, Number(body.repairCharges || body.damageFee) || 0);
        if (condition === 'damage_found' && payload.damages.length === 0 && !payload.conditionNotes) {
            throw new ValidationError('Add damage details or notes when damage is found');
        }
    }

    return payload;
}

export async function createInspectionRecord({
    booking,
    inspectionType,
    payload,
    inspectedBy,
    comparedWithInspectionId = null,
    pickupCodeVerified = false,
}) {
    const [doc] = await BikeInspection.create([{
        bookingId: booking._id,
        bikeId: booking.bikeId,
        userId: booking.userId,
        inspectionType,
        images: payload.images,
        videos: payload.videos,
        conditionNotes: payload.conditionNotes,
        fuelLevel: payload.fuelLevel,
        meterReading: payload.meterReading,
        damages: payload.damages || [],
        returnCondition: payload.returnCondition || '',
        repairCharges: Number(payload.repairCharges || 0),
        comparedWithInspectionId,
        pickupCodeVerified,
        inspectedBy,
        inspectedAt: new Date(),
    }]);
    return doc;
}

export async function getInspectionById(id) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid inspection id');
    }
    const doc = await BikeInspection.findOne({ _id: id, ...baseFilter }).lean();
    if (!doc) throw new NotFoundError('Inspection not found');
    return mapInspection(doc);
}

export async function listInspections(query = {}) {
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const filter = { ...baseFilter };

    if (query.inspectionType && ['PICKUP', 'RETURN'].includes(String(query.inspectionType))) {
        filter.inspectionType = String(query.inspectionType);
    }
    if (query.bookingId && mongoose.Types.ObjectId.isValid(String(query.bookingId))) {
        filter.bookingId = query.bookingId;
    }
    if (query.bikeId && mongoose.Types.ObjectId.isValid(String(query.bikeId))) {
        filter.bikeId = query.bikeId;
    }
    // Vendor-scoped listing: restrict to inspections on the vendor's own bikes only.
    if (query.vendorId && mongoose.Types.ObjectId.isValid(String(query.vendorId))) {
        const ownBikes = await BikeUnit.find({
            ownerType: 'vendor',
            vendorId: query.vendorId,
            isDeleted: { $ne: true },
        }).select('_id').lean();
        const ownBikeIds = ownBikes.map((b) => b._id);
        filter.bikeId = filter.bikeId
            ? { $in: ownBikeIds.filter((id) => String(id) === String(filter.bikeId)) }
            : { $in: ownBikeIds };
    }
    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        const bookings = await BikeBooking.find({
            isDeleted: { $ne: true },
            bookingNumber: { $regex: term, $options: 'i' },
        }).select('_id').limit(50).lean();
        filter.bookingId = { $in: bookings.map((row) => row._id) };
    }

    const [docs, total] = await Promise.all([
        BikeInspection.find(filter)
            .sort({ inspectedAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikeInspection.countDocuments(filter),
    ]);

    const bookingIds = [...new Set(docs.map((d) => String(d.bookingId)))];
    const bookings = await BikeBooking.find({ _id: { $in: bookingIds } })
        .select('bookingNumber bikeSnapshot riderSnapshot status')
        .lean();
    const byId = Object.fromEntries(bookings.map((b) => [String(b._id), b]));

    return toBikeRentPagination({
        docs: docs.map((doc) => ({
            ...mapInspection(doc),
            bookingNumber: byId[String(doc.bookingId)]?.bookingNumber || '',
            bikeName: byId[String(doc.bookingId)]?.bikeSnapshot?.name || '',
            customerName: byId[String(doc.bookingId)]?.riderSnapshot?.name || '',
            bookingStatus: byId[String(doc.bookingId)]?.status || '',
        })),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

export async function listInspectionsForBooking(bookingId) {
    if (!mongoose.Types.ObjectId.isValid(String(bookingId))) {
        throw new ValidationError('Invalid booking id');
    }
    const docs = await BikeInspection.find({
        bookingId,
        ...baseFilter,
    })
        .sort({ inspectedAt: 1 })
        .lean();
    return docs.map(mapInspection);
}

export async function getPickupInspectionForBooking(bookingId) {
    const doc = await BikeInspection.findOne({
        bookingId,
        inspectionType: 'PICKUP',
        ...baseFilter,
    })
        .sort({ inspectedAt: -1 })
        .lean();
    return doc ? mapInspection(doc) : null;
}

export async function getReturnInspectionForBooking(bookingId) {
    const doc = await BikeInspection.findOne({
        bookingId,
        inspectionType: 'RETURN',
        ...baseFilter,
    })
        .sort({ inspectedAt: -1 })
        .lean();
    return doc ? mapInspection(doc) : null;
}

export async function getInspectionCompare(bookingId) {
    const [pickup, ret] = await Promise.all([
        getPickupInspectionForBooking(bookingId),
        getReturnInspectionForBooking(bookingId),
    ]);
    return { pickup, return: ret };
}
