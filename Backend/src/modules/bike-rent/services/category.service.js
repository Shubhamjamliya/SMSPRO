import { BikeCategory } from '../models/bikeCategory.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import {
    parseListQuery,
    buildDateRangeFilter,
    toBikeRentPagination,
    escapeRegex,
} from '../utils/pagination.util.js';
import { mapCategory } from '../utils/mappers.util.js';
import {
    validateCreateCategoryDto,
    validateUpdateCategoryDto,
    validateCategoryId,
    validateCategoryStatusDto,
} from '../validators/category.validator.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import { applySoftDelete } from '../utils/softDelete.util.js';
import {
    notifyCategorySubmitted,
    notifyCategoryResubmitted,
    notifyCategoryApproved,
    notifyCategoryRejected,
} from './bookingNotifications.service.js';

const baseFilter = { isDeleted: { $ne: true } };

async function assertUniqueDisplayOrder(displayOrder, excludeId = null) {
    const order = Number(displayOrder);
    if (!Number.isFinite(order) || order < 0) return;
    const filter = { ...baseFilter, displayOrder: order };
    if (excludeId) filter._id = { $ne: excludeId };
    const clash = await BikeCategory.findOne(filter).select('_id name').lean();
    if (clash) {
        throw new ValidationError(
            `Display order ${order} is already used by "${clash.name}". Choose a different order.`,
        );
    }
}

async function nextDisplayOrder() {
    const last = await BikeCategory.findOne(baseFilter)
        .sort({ displayOrder: -1 })
        .select('displayOrder')
        .lean();
    return Number(last?.displayOrder ?? -1) + 1;
}

const buildSort = (sortBy, sortOrder) => {
    const allowed = ['name', 'status', 'displayOrder', 'createdAt'];
    // Default: display order ascending (admin "Order" field)
    const key = allowed.includes(sortBy) && sortBy
        ? sortBy
        : 'displayOrder';
    const dir = sortOrder === -1 || sortOrder === 'desc' ? -1 : 1;
    if (key === 'displayOrder') {
        return { displayOrder: dir, name: 1 };
    }
    return { [key]: dir, displayOrder: 1, name: 1 };
};

export async function listCategories(query = {}, vendorScope = null) {
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const filter = { ...baseFilter };
    const andClauses = [];
    if (vendorScope) {
        // Vendor sees the shared approved catalog plus their own categories (any approval state).
        andClauses.push({
            $or: [
                { ownerType: 'admin', approvalStatus: 'approved' },
                { vendorId: vendorScope },
            ],
        });
    }
    if (parsed.status) filter.status = parsed.status;
    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        andClauses.push({
            $or: [
                { name: { $regex: term, $options: 'i' } },
                { slug: { $regex: term, $options: 'i' } },
                { description: { $regex: term, $options: 'i' } },
            ],
        });
    }
    if (andClauses.length) filter.$and = andClauses;
    const dateRange = buildDateRangeFilter(parsed.createdFrom, parsed.createdTo);
    if (dateRange) filter.createdAt = dateRange;

    // Prefer explicit query; otherwise always order by displayOrder asc
    const sortBy = query.sortBy ? parsed.sortBy : 'displayOrder';
    const sortOrder = query.sortOrder
        ? parsed.sortOrder
        : 1;

    const [docs, total] = await Promise.all([
        BikeCategory.find(filter)
            .sort(buildSort(sortBy, sortOrder))
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikeCategory.countDocuments(filter),
    ]);

    return toBikeRentPagination({
        docs: docs.map(mapCategory),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

function assertCategoryVisibleToVendor(doc, vendorScope) {
    if (!vendorScope) return;
    const isOwn = String(doc.vendorId || '') === String(vendorScope);
    const isApprovedGlobal = doc.ownerType === 'admin' && doc.approvalStatus === 'approved';
    if (!isOwn && !isApprovedGlobal) {
        throw new NotFoundError('Category not found');
    }
}

export async function getCategoryById(id, vendorScope = null) {
    const categoryId = validateCategoryId(id);
    const doc = await BikeCategory.findOne({ _id: categoryId, ...baseFilter }).lean();
    if (!doc) throw new NotFoundError('Category not found');
    assertCategoryVisibleToVendor(doc, vendorScope);
    return mapCategory(doc);
}

export async function createCategory(body, reqUser, vendorScope = null) {
    const payload = validateCreateCategoryDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);

    const existing = await BikeCategory.findOne({
        ...baseFilter,
        $or: [
            { slug: payload.slug },
            { name: { $regex: new RegExp(`^${escapeRegex(payload.name)}$`, 'i') } },
        ],
    }).select('_id').lean();
    if (existing) throw new ValidationError('Category with this name or slug already exists');

    // Auto-assign unique order when client does not manage this field
    const hasExplicitOrder = body?.displayOrder !== undefined && body?.displayOrder !== null && body?.displayOrder !== '';
    payload.displayOrder = hasExplicitOrder
        ? payload.displayOrder
        : await nextDisplayOrder();
    await assertUniqueDisplayOrder(payload.displayOrder);

    const doc = await BikeCategory.create({
        ...payload,
        ownerType: vendorScope ? 'vendor' : 'admin',
        vendorId: vendorScope || null,
        // Vendor-submitted categories need admin sign-off before they're usable/visible.
        approvalStatus: vendorScope ? 'pending' : 'approved',
        createdBy: performer,
        updatedBy: performer,
        approvalHistory: vendorScope ? [{ status: 'submitted', changedBy: performer }] : [],
    });

    if (vendorScope) {
        const { BikeVendor } = await import('../models/bikeVendor.model.js');
        const vendor = await BikeVendor.findById(vendorScope).select('businessName').lean();
        await notifyCategorySubmitted(doc.toObject(), vendor);
    }

    return mapCategory(doc.toObject());
}

export async function listPendingCategories({ page = 1, limit = 20, search = '' } = {}) {
    const parsed = parseListQuery({ page, limit, search });
    const filter = { ...baseFilter, ownerType: 'vendor', approvalStatus: 'pending' };
    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        filter.name = { $regex: term, $options: 'i' };
    }
    const [docs, total] = await Promise.all([
        BikeCategory.find(filter)
            .populate('vendorId', 'businessName ownerName vendorCode')
            .sort({ createdAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikeCategory.countDocuments(filter),
    ]);
    return toBikeRentPagination({
        docs: docs.map((doc) => ({
            ...mapCategory(doc),
            vendor: doc.vendorId && typeof doc.vendorId === 'object'
                ? {
                    id: String(doc.vendorId._id),
                    businessName: doc.vendorId.businessName || '',
                    ownerName: doc.vendorId.ownerName || '',
                    vendorCode: doc.vendorId.vendorCode || '',
                }
                : null,
        })),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

export async function approveCategory(id, reqUser) {
    const categoryId = validateCategoryId(id);
    const doc = await BikeCategory.findOne({ _id: categoryId, ...baseFilter });
    if (!doc) throw new NotFoundError('Category not found');
    if (doc.approvalStatus === 'approved') return mapCategory(doc.toObject());
    const performer = await resolveActionPerformerSnapshot(reqUser);
    doc.approvalStatus = 'approved';
    doc.rejectionReason = '';
    doc.reviewedBy = performer?.userId || null;
    doc.reviewedAt = new Date();
    doc.updatedBy = performer;
    if (doc.ownerType === 'vendor') {
        doc.approvalHistory.push({ status: 'approved', changedBy: performer });
    }
    await doc.save();
    if (doc.ownerType === 'vendor' && doc.vendorId) {
        await notifyCategoryApproved(doc.toObject());
    }
    return mapCategory(doc.toObject());
}

export async function rejectCategory(id, reason, reqUser) {
    const categoryId = validateCategoryId(id);
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) throw new ValidationError('Rejection reason is required');
    const doc = await BikeCategory.findOne({ _id: categoryId, ...baseFilter });
    if (!doc) throw new NotFoundError('Category not found');
    const performer = await resolveActionPerformerSnapshot(reqUser);
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
        await notifyCategoryRejected(doc.toObject(), trimmedReason);
    }
    return mapCategory(doc.toObject());
}

export async function resubmitCategory(id, body, reqUser, vendorScope) {
    const categoryId = validateCategoryId(id);
    const doc = await BikeCategory.findOne({ _id: categoryId, ...baseFilter });
    if (!doc) throw new NotFoundError('Category not found');
    if (doc.ownerType !== 'vendor' || String(doc.vendorId) !== String(vendorScope)) {
        throw new NotFoundError('Category not found');
    }
    if (doc.approvalStatus !== 'rejected') {
        throw new ValidationError('Only rejected categories can be resubmitted');
    }

    const payload = validateUpdateCategoryDto(body);
    delete payload.displayOrder;
    delete payload.status;

    if (payload.name || payload.slug) {
        const name = payload.name ?? doc.name;
        const slug = payload.slug ?? doc.slug;
        const duplicate = await BikeCategory.findOne({
            ...baseFilter,
            _id: { $ne: categoryId },
            $or: [
                { slug },
                { name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } },
            ],
        }).select('_id').lean();
        if (duplicate) throw new ValidationError('Category with this name or slug already exists');
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    Object.assign(doc, payload);
    doc.approvalStatus = 'pending';
    doc.rejectionReason = '';
    doc.updatedBy = performer;
    doc.approvalHistory.push({ status: 'resubmitted', changedBy: performer });
    await doc.save();

    const { BikeVendor } = await import('../models/bikeVendor.model.js');
    const vendor = await BikeVendor.findById(vendorScope).select('businessName').lean();
    await notifyCategoryResubmitted(doc.toObject(), vendor);

    return mapCategory(doc.toObject());
}

export async function updateCategory(id, body, reqUser) {
    const categoryId = validateCategoryId(id);
    const payload = validateUpdateCategoryDto(body);
    const doc = await BikeCategory.findOne({ _id: categoryId, ...baseFilter });
    if (!doc) throw new NotFoundError('Category not found');

    if (payload.name || payload.slug) {
        const name = payload.name ?? doc.name;
        const slug = payload.slug ?? doc.slug;
        const duplicate = await BikeCategory.findOne({
            ...baseFilter,
            _id: { $ne: categoryId },
            $or: [
                { slug },
                { name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } },
            ],
        }).select('_id').lean();
        if (duplicate) throw new ValidationError('Category with this name or slug already exists');
    }

    if (payload.displayOrder !== undefined && Number(payload.displayOrder) !== Number(doc.displayOrder)) {
        await assertUniqueDisplayOrder(payload.displayOrder, categoryId);
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    Object.assign(doc, payload);
    doc.updatedBy = performer;
    await doc.save();
    return mapCategory(doc.toObject());
}

export async function updateCategoryStatus(id, body, reqUser) {
    const categoryId = validateCategoryId(id);
    const { status } = validateCategoryStatusDto(body);
    const doc = await BikeCategory.findOne({ _id: categoryId, ...baseFilter });
    if (!doc) throw new NotFoundError('Category not found');
    const performer = await resolveActionPerformerSnapshot(reqUser);
    doc.status = status;
    doc.updatedBy = performer;
    await doc.save();
    return mapCategory(doc.toObject());
}

export async function deleteCategory(id, reqUser) {
    const categoryId = validateCategoryId(id);
    const doc = await BikeCategory.findOne({ _id: categoryId, ...baseFilter });
    if (!doc) throw new NotFoundError('Category not found');
    const performer = await resolveActionPerformerSnapshot(reqUser);
    applySoftDelete(doc, performer);
    await doc.save();
    return { id: categoryId };
}

export async function listCategoryDropdown(vendorScope = null) {
    const filter = { ...baseFilter, status: 'active' };
    if (vendorScope) {
        filter.$or = [
            { ownerType: 'admin', approvalStatus: 'approved' },
            { vendorId: vendorScope, approvalStatus: 'approved' },
        ];
    } else {
        filter.approvalStatus = 'approved';
    }
    const docs = await BikeCategory.find(filter)
        .sort({ displayOrder: 1, name: 1 })
        .lean();
    return docs.map(mapCategory);
}
