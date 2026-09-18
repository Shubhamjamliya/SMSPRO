import { TaxiSurgeSlot } from '../models/taxiSurgeSlot.model.js';
import { NotFoundError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import { parseListQuery, toTaxiPagination, escapeRegex } from '../utils/pagination.util.js';
import { mapSurgeSlot } from '../utils/mappers.util.js';
import {
    validateCreateSurgeSlotDto,
    validateUpdateSurgeSlotDto,
    validateSurgeSlotId,
    validateSurgeSlotStatusDto,
} from '../validators/surgeSlot.validator.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import { applySoftDelete } from '../utils/softDelete.util.js';

const baseFilter = { isDeleted: { $ne: true } };

const buildSort = (sortBy, sortOrder) => {
    const allowed = ['name', 'priority', 'amount', 'isActive', 'createdAt', 'updatedAt'];
    const key = allowed.includes(sortBy) ? sortBy : 'priority';
    return { [key]: sortOrder === 1 ? 1 : -1 };
};

export async function listSurgeSlots(query = {}) {
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const filter = { ...baseFilter };

    if (parsed.status === 'active') filter.isActive = true;
    if (parsed.status === 'inactive') filter.isActive = false;
    if (query.isActive === 'true' || query.isActive === true) filter.isActive = true;
    if (query.isActive === 'false' || query.isActive === false) filter.isActive = false;

    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        filter.name = { $regex: term, $options: 'i' };
    }

    const sort = buildSort(parsed.sortBy, parsed.sortOrder);

    const [docs, total] = await Promise.all([
        TaxiSurgeSlot.find(filter)
            .sort(sort)
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        TaxiSurgeSlot.countDocuments(filter),
    ]);

    return toTaxiPagination({
        docs: docs.map(mapSurgeSlot),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

export async function getSurgeSlotById(id) {
    const slotId = validateSurgeSlotId(id);
    const doc = await TaxiSurgeSlot.findOne({ _id: slotId, ...baseFilter }).lean();
    if (!doc) throw new NotFoundError('Surge slot not found');
    return mapSurgeSlot(doc);
}

export async function createSurgeSlot(body, reqUser) {
    const payload = validateCreateSurgeSlotDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);

    const doc = await TaxiSurgeSlot.create({
        ...payload,
        createdBy: performer,
        updatedBy: performer,
    });

    return mapSurgeSlot(doc.toObject());
}

export async function updateSurgeSlot(id, body, reqUser) {
    const slotId = validateSurgeSlotId(id);
    const payload = validateUpdateSurgeSlotDto(body);
    const doc = await TaxiSurgeSlot.findOne({ _id: slotId, ...baseFilter });
    if (!doc) throw new NotFoundError('Surge slot not found');

    const performer = await resolveActionPerformerSnapshot(reqUser);
    Object.assign(doc, payload);
    doc.updatedBy = performer;
    await doc.save();

    return mapSurgeSlot(doc.toObject());
}

export async function updateSurgeSlotStatus(id, body, reqUser) {
    const slotId = validateSurgeSlotId(id);
    const { isActive } = validateSurgeSlotStatusDto(body);
    const doc = await TaxiSurgeSlot.findOne({ _id: slotId, ...baseFilter });
    if (!doc) throw new NotFoundError('Surge slot not found');

    const performer = await resolveActionPerformerSnapshot(reqUser);
    doc.isActive = isActive;
    doc.updatedBy = performer;
    await doc.save();

    return mapSurgeSlot(doc.toObject());
}

export async function deleteSurgeSlot(id, reqUser) {
    const slotId = validateSurgeSlotId(id);
    const doc = await TaxiSurgeSlot.findOne({ _id: slotId, ...baseFilter });
    if (!doc) throw new NotFoundError('Surge slot not found');

    const performer = await resolveActionPerformerSnapshot(reqUser);
    applySoftDelete(doc, performer);
    await doc.save();

    return { id: slotId };
}
