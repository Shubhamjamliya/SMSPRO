import { BikePricingRule } from '../models/bikePricingRule.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import {
    parseListQuery,
    toBikeRentPagination,
    escapeRegex,
} from '../utils/pagination.util.js';
import { mapPricing } from '../utils/mappers.util.js';
import {
    validateCreatePricingDto,
    validateUpdatePricingDto,
    validatePricingId,
    validatePricingStatusDto,
} from '../validators/pricing.validator.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import { applySoftDelete } from '../utils/softDelete.util.js';

const baseFilter = { isDeleted: { $ne: true } };

export async function listPricing(query = {}) {
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const filter = { ...baseFilter };
    if (parsed.status) filter.status = parsed.status;
    if (query.scope && query.scope !== 'all') filter.scope = String(query.scope);
    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        filter.name = { $regex: term, $options: 'i' };
    }

    const [docs, total] = await Promise.all([
        BikePricingRule.find(filter)
            .sort({ createdAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikePricingRule.countDocuments(filter),
    ]);

    return toBikeRentPagination({
        docs: docs.map(mapPricing),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

export async function getPricingById(id) {
    const pricingId = validatePricingId(id);
    const doc = await BikePricingRule.findOne({ _id: pricingId, ...baseFilter }).lean();
    if (!doc) throw new NotFoundError('Pricing rule not found');
    return mapPricing(doc);
}

export async function createPricing(body, reqUser) {
    const payload = validateCreatePricingDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);
    const doc = await BikePricingRule.create({
        ...payload,
        createdBy: performer,
        updatedBy: performer,
    });
    return mapPricing(doc.toObject());
}

export async function updatePricing(id, body, reqUser) {
    const pricingId = validatePricingId(id);
    const payload = validateUpdatePricingDto(body);
    const doc = await BikePricingRule.findOne({ _id: pricingId, ...baseFilter });
    if (!doc) throw new NotFoundError('Pricing rule not found');
    const performer = await resolveActionPerformerSnapshot(reqUser);
    Object.assign(doc, payload);
    doc.updatedBy = performer;
    await doc.save();
    return mapPricing(doc.toObject());
}

export async function updatePricingStatus(id, body, reqUser) {
    const pricingId = validatePricingId(id);
    const { status } = validatePricingStatusDto(body);
    const doc = await BikePricingRule.findOne({ _id: pricingId, ...baseFilter });
    if (!doc) throw new NotFoundError('Pricing rule not found');
    const performer = await resolveActionPerformerSnapshot(reqUser);
    doc.status = status;
    doc.updatedBy = performer;
    await doc.save();
    return mapPricing(doc.toObject());
}

export async function deletePricing(id, reqUser) {
    const pricingId = validatePricingId(id);
    const doc = await BikePricingRule.findOne({ _id: pricingId, ...baseFilter });
    if (!doc) throw new NotFoundError('Pricing rule not found');
    const performer = await resolveActionPerformerSnapshot(reqUser);
    applySoftDelete(doc, performer);
    await doc.save();
    return { id: pricingId };
}
