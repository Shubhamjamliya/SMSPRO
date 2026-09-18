import { BikeUnit } from '../models/bikeUnit.model.js';
import { BikeCategory } from '../models/bikeCategory.model.js';
import { BikeRentZone } from '../models/bikeRentZone.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import {
    parseListQuery,
    buildDateRangeFilter,
    toBikeRentPagination,
    escapeRegex,
} from '../utils/pagination.util.js';
import { mapBike } from '../utils/mappers.util.js';
import {
    validateCreateBikeDto,
    validateUpdateBikeDto,
    validateBikeId,
    validateBikeStatusDto,
} from '../validators/bike.validator.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import { applySoftDelete } from '../utils/softDelete.util.js';
import { assertHubInZone, assertHubHasCapacity } from './hub.service.js';
import { getSettings } from './settings.service.js';
import { BIKE_DOCUMENT_TYPE_KEYS } from '../utils/documentTypes.util.js';
import {
    notifyBikeSubmitted,
    notifyBikeResubmitted,
    notifyBikeApproved,
    notifyBikeRejected,
} from './bookingNotifications.service.js';

const baseFilter = { isDeleted: { $ne: true } };
const HUB_POPULATE = 'name address landmark instructions lat lng status zoneId maxBikes ownerType vendorId';

const buildSort = (sortBy, sortOrder) => {
    const allowed = [
        'name', 'brand', 'registrationNumber', 'hourlyPrice', 'dailyPrice',
        'availabilityStatus', 'createdAt',
    ];
    const key = allowed.includes(sortBy) ? sortBy : 'createdAt';
    return { [key]: sortOrder };
};

async function assertCategoryAndZone(categoryId, zoneId) {
    const [category, zone] = await Promise.all([
        BikeCategory.findOne({
            _id: categoryId,
            isDeleted: { $ne: true },
            status: 'active',
            approvalStatus: 'approved',
        }).select('_id').lean(),
        BikeRentZone.findOne({ _id: zoneId, isDeleted: { $ne: true }, status: 'active' }).select('_id').lean(),
    ]);
    if (!category) throw new ValidationError('Active bike category is required');
    if (!zone) throw new ValidationError('Active Bike Rent zone is required');
}

/** doc.vendorId may be a raw ObjectId (unpopulated) or a populated {_id, businessName, ...} sub-doc. */
function resolveVendorId(vendorIdValue) {
    if (
        vendorIdValue
        && typeof vendorIdValue === 'object'
        && typeof vendorIdValue.toHexString !== 'function'
    ) {
        return vendorIdValue._id;
    }
    return vendorIdValue;
}

function assertBikeOwnership(doc, vendorScope) {
    if (!vendorScope) return;
    const vendorId = resolveVendorId(doc.vendorId);
    if (doc.ownerType !== 'vendor' || String(vendorId) !== String(vendorScope)) {
        throw new NotFoundError('Bike not found');
    }
}

/** Plain-object snapshot of a bike's editable fields, used to diff a resubmission against what the admin actually rejected. */
function snapshotBikeFields(doc) {
    return {
        name: doc.name || '',
        brand: doc.brand || '',
        model: doc.model || '',
        categoryId: doc.categoryId ? String(doc.categoryId) : null,
        registrationNumber: doc.registrationNumber || '',
        engineNumber: doc.engineNumber || '',
        chassisNumber: doc.chassisNumber || '',
        fuelType: doc.fuelType || '',
        transmission: doc.transmission || '',
        seatingCapacity: Number(doc.seatingCapacity || 0),
        helmetIncluded: Boolean(doc.helmetIncluded),
        description: doc.description || '',
        requiredDocuments: Array.isArray(doc.requiredDocuments) ? [...doc.requiredDocuments] : [],
        settingsOverride: doc.settingsOverride && typeof doc.settingsOverride === 'object'
            ? { ...doc.settingsOverride }
            : null,
        images: Array.isArray(doc.images)
            ? doc.images.map((img) => ({ url: img?.url || '', isPrimary: Boolean(img?.isPrimary) }))
            : [],
        rcDoc: { url: doc.rcDoc?.url || '' },
        insuranceDoc: { url: doc.insuranceDoc?.url || '' },
        pucDoc: { url: doc.pucDoc?.url || '' },
        hourlyPrice: Number(doc.hourlyPrice || 0),
        dailyPrice: Number(doc.dailyPrice || 0),
        weeklyPrice: Number(doc.weeklyPrice || 0),
        securityDeposit: Number(doc.securityDeposit || 0),
        zoneId: doc.zoneId ? String(doc.zoneId) : null,
        hubId: doc.hubId ? String(doc.hubId) : null,
    };
}

/** Vendors may use their own hubs or any active admin (platform) hub — only a different vendor's hub is off-limits. */
async function assertHubEligibleForVendor(hubId, vendorScope) {
    if (!vendorScope) return;
    const { BikeRentHub } = await import('../models/bikeRentHub.model.js');
    const hub = await BikeRentHub.findOne({ _id: hubId, isDeleted: { $ne: true } })
        .select('_id ownerType vendorId').lean();
    if (!hub) throw new ValidationError('Selected hub was not found');
    const isOwnHub = hub.ownerType === 'vendor' && String(hub.vendorId) === String(vendorScope);
    const isAdminHub = hub.ownerType === 'admin';
    if (!isOwnHub && !isAdminHub) {
        throw new ValidationError('Selected hub is not available to you');
    }
}

/**
 * Vendors pick required pickup documents from the fixed platform catalog (not admin-curated),
 * so that always validates. Admin-owned bikes may additionally reference admin's own
 * custom document types configured in Settings, so those stay valid too.
 */
async function assertRequiredDocumentsValid(keys) {
    if (!Array.isArray(keys) || !keys.length) return;
    const invalid = keys.filter((k) => !BIKE_DOCUMENT_TYPE_KEYS.has(k));
    if (!invalid.length) return;

    const settings = await getSettings();
    const adminActiveKeys = new Set(
        (settings.documentTypes || []).filter((d) => d.active).map((d) => d.key),
    );
    const stillInvalid = invalid.filter((k) => !adminActiveKeys.has(k));
    if (stillInvalid.length) {
        throw new ValidationError(`Unknown required document(s): ${stillInvalid.join(', ')}`);
    }
}

export async function listBikes(query = {}, vendorScope = null) {
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const filter = { ...baseFilter };
    if (vendorScope) {
        filter.ownerType = 'vendor';
        filter.vendorId = vendorScope;
    } else if (query.ownerType === 'admin' || query.ownerType === 'vendor') {
        filter.ownerType = query.ownerType;
    }

    if (parsed.status === 'active') filter.isActive = true;
    if (parsed.status === 'inactive') filter.isActive = false;
    if (query.availabilityStatus && query.availabilityStatus !== 'all') {
        filter.availabilityStatus = String(query.availabilityStatus);
    }
    if (query.maintenanceStatus && query.maintenanceStatus !== 'all') {
        filter.maintenanceStatus = String(query.maintenanceStatus);
    }
    if (query.zoneId && query.zoneId !== 'all') filter.zoneId = query.zoneId;
    if (query.hubId && query.hubId !== 'all') filter.hubId = query.hubId;
    if (query.categoryId && query.categoryId !== 'all') filter.categoryId = query.categoryId;

    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        filter.$or = [
            { name: { $regex: term, $options: 'i' } },
            { brand: { $regex: term, $options: 'i' } },
            { model: { $regex: term, $options: 'i' } },
            { registrationNumber: { $regex: term, $options: 'i' } },
        ];
    }

    const dateRange = buildDateRangeFilter(parsed.createdFrom, parsed.createdTo);
    if (dateRange) filter.createdAt = dateRange;

    const [docs, total] = await Promise.all([
        BikeUnit.find(filter)
            .populate('categoryId', 'name slug status icon')
            .populate('zoneId', 'name country status')
            .populate('hubId', HUB_POPULATE)
            .sort(buildSort(parsed.sortBy, parsed.sortOrder))
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikeUnit.countDocuments(filter),
    ]);

    return toBikeRentPagination({
        docs: docs.map(mapBike),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

export async function getBikeById(id, vendorScope = null) {
    const bikeId = validateBikeId(id);
    const doc = await BikeUnit.findOne({ _id: bikeId, ...baseFilter })
        .populate('categoryId', 'name slug status icon defaultSecurityDeposit')
        .populate('zoneId', 'name country status coordinates pickupHub')
        .populate('hubId', HUB_POPULATE)
        .populate('vendorId', 'businessName ownerName vendorCode')
        .lean();
    if (!doc) throw new NotFoundError('Bike not found');
    assertBikeOwnership(doc, vendorScope);
    return mapBike(doc);
}

export async function createBike(body, reqUser, vendorScope = null) {
    const payload = validateCreateBikeDto(body);
    if (!payload.hubId) throw new ValidationError('Pickup hub is required');
    await assertCategoryAndZone(payload.categoryId, payload.zoneId);
    await assertHubInZone(payload.hubId, payload.zoneId);
    await assertHubHasCapacity(payload.hubId);
    await assertHubEligibleForVendor(payload.hubId, vendorScope);
    await assertRequiredDocumentsValid(payload.requiredDocuments);

    const duplicate = await BikeUnit.findOne({
        ...baseFilter,
        registrationNumber: payload.registrationNumber,
    }).select('_id').lean();
    if (duplicate) throw new ValidationError('Registration number already exists');

    const performer = await resolveActionPerformerSnapshot(reqUser);
    const doc = await BikeUnit.create({
        ...payload,
        ownerType: vendorScope ? 'vendor' : 'admin',
        vendorId: vendorScope || null,
        // Vendor-submitted bikes need admin sign-off before they're bookable/visible.
        approvalStatus: vendorScope ? 'pending' : 'approved',
        createdBy: performer,
        updatedBy: performer,
        approvalHistory: vendorScope ? [{ status: 'submitted', changedBy: performer }] : [],
    });

    if (vendorScope) {
        const { BikeVendor } = await import('../models/bikeVendor.model.js');
        const vendor = await BikeVendor.findById(vendorScope).select('businessName').lean();
        await notifyBikeSubmitted(doc.toObject(), vendor);
    }

    return getBikeById(doc._id, vendorScope);
}

export async function updateBike(id, body, reqUser, vendorScope = null) {
    const bikeId = validateBikeId(id);
    const payload = validateUpdateBikeDto(body);
    const doc = await BikeUnit.findOne({ _id: bikeId, ...baseFilter });
    if (!doc) throw new NotFoundError('Bike not found');
    assertBikeOwnership(doc, vendorScope);
    // Vendors cannot re-assign ownership fields even if a client sends them.
    delete payload.ownerType;
    delete payload.vendorId;

    const nextCategoryId = payload.categoryId || String(doc.categoryId);
    const nextZoneId = payload.zoneId || String(doc.zoneId);
    const nextHubId = payload.hubId || (doc.hubId ? String(doc.hubId) : null);

    if (payload.categoryId || payload.zoneId) {
        await assertCategoryAndZone(nextCategoryId, nextZoneId);
    }
    if (!nextHubId) throw new ValidationError('Pickup hub is required');
    if (payload.hubId || payload.zoneId || payload.categoryId) {
        await assertHubInZone(nextHubId, nextZoneId);
    }
    if (payload.requiredDocuments) {
        await assertRequiredDocumentsValid(payload.requiredDocuments);
    }
    if (payload.hubId) {
        await assertHubEligibleForVendor(nextHubId, vendorScope);
    }

    // Capacity check when moving to a different hub (or first-time hub assign)
    const prevHubId = doc.hubId ? String(doc.hubId) : null;
    if (String(nextHubId) !== String(prevHubId)) {
        await assertHubHasCapacity(nextHubId, { excludeBikeId: bikeId });
    }

    if (payload.registrationNumber) {
        const duplicate = await BikeUnit.findOne({
            ...baseFilter,
            _id: { $ne: bikeId },
            registrationNumber: payload.registrationNumber,
        }).select('_id').lean();
        if (duplicate) throw new ValidationError('Registration number already exists');
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    Object.assign(doc, payload);
    doc.hubId = nextHubId;
    // Keep fleet lock fields consistent when editing from the full form.
    if (doc.maintenanceStatus === 'maintenance') {
        doc.availabilityStatus = 'maintenance';
    } else if (doc.availabilityStatus === 'maintenance') {
        doc.availabilityStatus = doc.isActive === false ? 'disabled' : 'available';
    }
    if (doc.availabilityStatus === 'unavailable') {
        doc.availabilityStatus = 'disabled';
    }
    doc.updatedBy = performer;
    await doc.save();
    return getBikeById(doc._id, vendorScope);
}

export async function updateBikeStatus(id, body, reqUser, vendorScope = null) {
    const bikeId = validateBikeId(id);
    const payload = validateBikeStatusDto(body);
    const doc = await BikeUnit.findOne({ _id: bikeId, ...baseFilter });
    if (!doc) throw new NotFoundError('Bike not found');
    assertBikeOwnership(doc, vendorScope);
    const performer = await resolveActionPerformerSnapshot(reqUser);
    Object.assign(doc, payload);

    // Keep maintenanceStatus + availabilityStatus in sync for Maint. / Ready toggles.
    if (payload.maintenanceStatus === 'maintenance') {
        doc.availabilityStatus = 'maintenance';
    } else if (payload.maintenanceStatus === 'none') {
        // Ready: clear maintenance lock. Prefer explicit availability from client;
        // otherwise restore available/disabled based on isActive.
        if (
            payload.availabilityStatus === undefined
            && (doc.availabilityStatus === 'maintenance' || doc.availabilityStatus === 'unavailable')
        ) {
            doc.availabilityStatus = doc.isActive === false ? 'disabled' : 'available';
        }
    }

    if (payload.isActive === false) {
        if (doc.maintenanceStatus !== 'maintenance') {
            doc.availabilityStatus = 'disabled';
        }
    } else if (payload.isActive === true) {
        if (
            doc.maintenanceStatus !== 'maintenance'
            && (doc.availabilityStatus === 'disabled' || doc.availabilityStatus === 'unavailable')
        ) {
            doc.availabilityStatus = 'available';
        }
    }

    if (payload.availabilityStatus === 'unavailable') {
        doc.availabilityStatus = 'disabled';
    }

    doc.updatedBy = performer;
    await doc.save();
    return getBikeById(doc._id, vendorScope);
}

export async function deleteBike(id, reqUser, vendorScope = null) {
    const bikeId = validateBikeId(id);
    const doc = await BikeUnit.findOne({ _id: bikeId, ...baseFilter });
    if (!doc) throw new NotFoundError('Bike not found');
    assertBikeOwnership(doc, vendorScope);
    const performer = await resolveActionPerformerSnapshot(reqUser);
    applySoftDelete(doc, performer);
    doc.isActive = false;
    doc.availabilityStatus = 'disabled';
    await doc.save();
    return { id: bikeId };
}

export async function listBikeDropdown(query = {}, vendorScope = null) {
    // Only approved bikes are operationally assignable (e.g. reassigning a live booking).
    const filter = { ...baseFilter, isActive: true, approvalStatus: { $nin: ['pending', 'rejected'] } };
    if (vendorScope) {
        filter.ownerType = 'vendor';
        filter.vendorId = vendorScope;
    }
    if (query.zoneId) filter.zoneId = query.zoneId;
    if (query.hubId) filter.hubId = query.hubId;
    const docs = await BikeUnit.find(filter)
        .sort({ name: 1 })
        .select('name brand model registrationNumber zoneId hubId hourlyPrice dailyPrice')
        .lean();
    return docs.map(mapBike);
}

export async function listPendingBikes({ page = 1, limit = 20, search = '', status = 'pending' } = {}) {
    const parsed = parseListQuery({ page, limit, search });
    const filter = { ...baseFilter, ownerType: 'vendor' };
    const statusKey = String(status || '').toLowerCase();
    if (statusKey === 'all') {
        // no approvalStatus filter — every status
    } else if (['pending', 'approved', 'rejected'].includes(statusKey)) {
        filter.approvalStatus = statusKey;
    } else {
        filter.approvalStatus = 'pending';
    }
    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        filter.$or = [
            { name: { $regex: term, $options: 'i' } },
            { brand: { $regex: term, $options: 'i' } },
            { registrationNumber: { $regex: term, $options: 'i' } },
        ];
    }
    const [docs, total] = await Promise.all([
        BikeUnit.find(filter)
            .populate('vendorId', 'businessName ownerName vendorCode')
            .populate('categoryId', 'name slug status icon')
            .sort({ updatedAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikeUnit.countDocuments(filter),
    ]);
    return toBikeRentPagination({
        docs: docs.map(mapBike),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

export async function approveBike(id, reqUser) {
    const bikeId = validateBikeId(id);
    const doc = await BikeUnit.findOne({ _id: bikeId, ...baseFilter });
    if (!doc) throw new NotFoundError('Bike not found');
    if (doc.approvalStatus === 'approved') return getBikeById(doc._id);
    const performer = await resolveActionPerformerSnapshot(reqUser);
    doc.approvalStatus = 'approved';
    doc.rejectionReason = '';
    doc.rejectedSnapshot = null;
    doc.reviewedBy = performer?.userId || null;
    doc.reviewedAt = new Date();
    doc.updatedBy = performer;
    if (doc.ownerType === 'vendor') {
        doc.approvalHistory.push({ status: 'approved', changedBy: performer });
    }
    await doc.save();
    if (doc.ownerType === 'vendor' && doc.vendorId) {
        await notifyBikeApproved(doc.toObject());
    }
    return getBikeById(doc._id);
}

export async function rejectBike(id, reason, reqUser) {
    const bikeId = validateBikeId(id);
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) throw new ValidationError('Rejection reason is required');
    const doc = await BikeUnit.findOne({ _id: bikeId, ...baseFilter });
    if (!doc) throw new NotFoundError('Bike not found');
    const performer = await resolveActionPerformerSnapshot(reqUser);
    doc.rejectedSnapshot = { ...snapshotBikeFields(doc), rejectionReason: trimmedReason };
    doc.approvalStatus = 'rejected';
    doc.rejectionReason = trimmedReason;
    doc.reviewedBy = performer?.userId || null;
    doc.reviewedAt = new Date();
    doc.updatedBy = performer;
    if (doc.ownerType === 'vendor') {
        doc.approvalHistory.push({ status: 'rejected', reason: trimmedReason, changedBy: performer });
    }
    await doc.save();
    if (doc.ownerType === 'vendor' && doc.vendorId) {
        await notifyBikeRejected(doc.toObject(), trimmedReason);
    }
    return getBikeById(doc._id);
}

export async function resubmitBike(id, body, reqUser, vendorScope) {
    const bikeId = validateBikeId(id);
    const doc = await BikeUnit.findOne({ _id: bikeId, ...baseFilter });
    if (!doc) throw new NotFoundError('Bike not found');
    if (doc.ownerType !== 'vendor' || String(doc.vendorId) !== String(vendorScope)) {
        throw new NotFoundError('Bike not found');
    }
    if (doc.approvalStatus !== 'rejected') {
        throw new ValidationError('Only rejected bikes can be resubmitted');
    }

    const payload = validateUpdateBikeDto(body);
    delete payload.ownerType;
    delete payload.vendorId;

    const nextCategoryId = payload.categoryId || String(doc.categoryId);
    const nextZoneId = payload.zoneId || String(doc.zoneId);
    const nextHubId = payload.hubId || (doc.hubId ? String(doc.hubId) : null);

    if (payload.categoryId || payload.zoneId) {
        await assertCategoryAndZone(nextCategoryId, nextZoneId);
    }
    if (!nextHubId) throw new ValidationError('Pickup hub is required');
    if (payload.hubId || payload.zoneId || payload.categoryId) {
        await assertHubInZone(nextHubId, nextZoneId);
    }
    if (payload.requiredDocuments) {
        await assertRequiredDocumentsValid(payload.requiredDocuments);
    }
    if (payload.hubId) {
        await assertHubEligibleForVendor(nextHubId, vendorScope);
    }

    if (payload.registrationNumber) {
        const duplicate = await BikeUnit.findOne({
            ...baseFilter,
            _id: { $ne: bikeId },
            registrationNumber: payload.registrationNumber,
        }).select('_id').lean();
        if (duplicate) throw new ValidationError('Registration number already exists');
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    Object.assign(doc, payload);
    doc.hubId = nextHubId;
    doc.approvalStatus = 'pending';
    doc.rejectionReason = '';
    doc.updatedBy = performer;
    doc.approvalHistory.push({ status: 'resubmitted', changedBy: performer });
    await doc.save();

    const { BikeVendor } = await import('../models/bikeVendor.model.js');
    const vendor = await BikeVendor.findById(vendorScope).select('businessName').lean();
    await notifyBikeResubmitted(doc.toObject(), vendor);

    return getBikeById(doc._id, vendorScope);
}
