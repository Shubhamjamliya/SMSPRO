import mongoose from 'mongoose';
import { PorterGoodsType } from '../models/porterGoodsType.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import { parseListQuery, toPorterPagination, escapeRegex } from '../utils/pagination.util.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import { getOrCreateSettings, updateSettings } from './settings.service.js';

const DEFAULT_GOODS = [
    { name: 'Documents / Files', displayOrder: 1 },
    { name: 'Clothes / Apparel', displayOrder: 2 },
    { name: 'Food / Groceries', displayOrder: 3 },
    { name: 'Electronics', displayOrder: 4 },
    { name: 'Furniture', displayOrder: 5 },
    { name: 'Household Items', displayOrder: 6 },
    { name: 'Machinery / Parts', displayOrder: 7 },
    { name: 'Others', displayOrder: 99 },
];

export const DEFAULT_RESTRICTED_ITEMS = [
    'Pornographic Materials',
    'Human Body Parts',
    'Fire Arms',
    'Livestock',
    'Dangerous Goods',
    'Illegal Goods',
    'Precious Jewelleries',
    'Stones and Gems',
    'Lottery Tickets',
    'Cigarettes & Alcohols',
    'Dry Ice',
    'Explosives',
    'Flammables',
    'Pets & Animals',
    'Hazardous Goods',
    'Radioactive Materials',
    'Currencies & Coins',
    'Gambling Devices',
    'Fire Extinguishers',
    'Narcotics and Illegal Drugs',
];

const mapGoodsType = (doc = {}) => ({
    id: String(doc._id),
    name: doc.name || '',
    description: doc.description || '',
    status: doc.status || 'inactive',
    displayOrder: Number(doc.displayOrder || 0),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});

async function ensureDefaultGoodsTypes() {
    const count = await PorterGoodsType.countDocuments({ isDeleted: { $ne: true } });
    if (count > 0) return;
    await PorterGoodsType.insertMany(
        DEFAULT_GOODS.map((g) => ({
            ...g,
            status: 'active',
            isDeleted: false,
        })),
    );
}

export async function listGoodsTypes(query = {}) {
    validateListQuery(query);
    await ensureDefaultGoodsTypes();
    const parsed = parseListQuery(query);
    const filter = { isDeleted: { $ne: true } };

    if (parsed.status) filter.status = parsed.status;
    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        filter.name = { $regex: term, $options: 'i' };
    }

    const [docs, total] = await Promise.all([
        PorterGoodsType.find(filter)
            .sort({ displayOrder: 1, name: 1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        PorterGoodsType.countDocuments(filter),
    ]);

    return toPorterPagination({
        docs: docs.map(mapGoodsType),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

export async function getGoodsTypeById(id) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid goods type id');
    }
    const doc = await PorterGoodsType.findOne({ _id: id, isDeleted: { $ne: true } }).lean();
    if (!doc) throw new NotFoundError('Goods type not found');
    return mapGoodsType(doc);
}

export async function createGoodsType(body = {}, reqUser) {
    const name = String(body.name || '').trim();
    if (!name) throw new ValidationError('name is required');
    const performer = await resolveActionPerformerSnapshot(reqUser);
    const doc = await PorterGoodsType.create({
        name,
        description: String(body.description || '').trim(),
        status: body.status === 'inactive' ? 'inactive' : 'active',
        displayOrder: Number(body.displayOrder) || 0,
        createdBy: performer,
        updatedBy: performer,
    });
    return mapGoodsType(doc.toObject());
}

export async function updateGoodsType(id, body = {}, reqUser) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid goods type id');
    }
    const doc = await PorterGoodsType.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!doc) throw new NotFoundError('Goods type not found');

    if (body.name !== undefined) {
        const name = String(body.name || '').trim();
        if (!name) throw new ValidationError('name is required');
        doc.name = name;
    }
    if (body.description !== undefined) doc.description = String(body.description || '').trim();
    if (body.status !== undefined) {
        doc.status = body.status === 'inactive' ? 'inactive' : 'active';
    }
    if (body.displayOrder !== undefined) {
        doc.displayOrder = Number(body.displayOrder) || 0;
    }
    doc.updatedBy = await resolveActionPerformerSnapshot(reqUser);
    await doc.save();
    return mapGoodsType(doc.toObject());
}

export async function deleteGoodsType(id, reqUser) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid goods type id');
    }
    const doc = await PorterGoodsType.findOne({ _id: id, isDeleted: { $ne: true } });
    if (!doc) throw new NotFoundError('Goods type not found');
    doc.isDeleted = true;
    doc.status = 'inactive';
    doc.updatedBy = await resolveActionPerformerSnapshot(reqUser);
    await doc.save();
    return { id: String(doc._id), deleted: true };
}

/** Public catalog for booking sheet */
export async function listPublicGoodsCatalog() {
    await ensureDefaultGoodsTypes();
    const settingsDoc = await getOrCreateSettings();
    let restrictedItems = Array.isArray(settingsDoc.restrictedItems)
        ? settingsDoc.restrictedItems.map((x) => String(x || '').trim()).filter(Boolean)
        : [];

    if (!restrictedItems.length) {
        const updated = await updateSettings({ restrictedItems: DEFAULT_RESTRICTED_ITEMS });
        restrictedItems = updated.restrictedItems || DEFAULT_RESTRICTED_ITEMS;
    }

    const docs = await PorterGoodsType.find({
        status: 'active',
        isDeleted: { $ne: true },
    })
        .sort({ displayOrder: 1, name: 1 })
        .lean();

    return {
        goodsTypes: docs.map(mapGoodsType),
        restrictedItems,
    };
}

export async function getRestrictedItems() {
    const catalog = await listPublicGoodsCatalog();
    return catalog.restrictedItems;
}

export async function updateRestrictedItems(items = [], reqUser) {
    void reqUser;
    if (!Array.isArray(items)) throw new ValidationError('restrictedItems must be an array');
    const cleaned = items.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 100);
    return updateSettings({ restrictedItems: cleaned });
}
