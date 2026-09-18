import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import { FoodAddon } from '../restaurant/models/foodAddon.model.js';

/**
 * Restaurant add-ons attached to a cart/order line.
 *
 * The client only ever sends `{ addonId, quantity }`. Names and prices are
 * resolved from the approved `published` payload on every read and every write,
 * so a customer can neither invent an add-on nor pin an old price.
 *
 * Money rule: an add-on price is per unit of the parent item.
 *   line total = (item price + Σ addon.price × addon.quantity) × item quantity
 */

export const MAX_ADDONS_PER_LINE = 10;
export const MAX_ADDON_QUANTITY = 10;

const toObjectId = (value) => {
    const str = String(value || '');
    return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : null;
};

const roundCurrency = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Number(num.toFixed(2));
};

/**
 * Client input -> storable selection. Duplicate add-ons collapse into one entry
 * with summed quantity so the same add-on can't appear twice on a line.
 */
export function normalizeAddonSelectionInput(raw) {
    if (raw === undefined || raw === null) return undefined;
    if (!Array.isArray(raw)) return [];

    const byId = new Map();
    for (const entry of raw) {
        const addonId = toObjectId(entry?.addonId ?? entry?.id ?? entry?._id);
        if (!addonId) continue;

        const requested = Number(entry?.quantity);
        const quantity = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 1;
        const key = String(addonId);
        const previous = byId.get(key)?.quantity || 0;
        byId.set(key, {
            addonId,
            quantity: Math.min(MAX_ADDON_QUANTITY, previous + quantity),
        });
    }

    const selection = [...byId.values()];
    if (selection.length > MAX_ADDONS_PER_LINE) {
        throw new ValidationError(`You can add at most ${MAX_ADDONS_PER_LINE} add-ons to one item`);
    }
    return selection;
}

/**
 * Approved, available add-ons for a restaurant, keyed by id.
 * Anything pending, rejected, deleted, unavailable or belonging to another
 * restaurant simply isn't in the map — callers treat a miss as "gone".
 */
export async function loadApprovedAddonMap(restaurantId, addonIds = []) {
    const restaurantOid = toObjectId(restaurantId);
    const ids = (addonIds || []).map(toObjectId).filter(Boolean);
    if (!restaurantOid || ids.length === 0) return new Map();

    const docs = await FoodAddon.find({
        _id: { $in: ids },
        restaurantId: restaurantOid,
        isDeleted: { $ne: true },
        approvalStatus: 'approved',
        isAvailable: true,
        published: { $ne: null },
    })
        .select('_id published')
        .lean();

    return new Map(
        (docs || [])
            .filter((doc) => doc?.published)
            .map((doc) => [
                String(doc._id),
                {
                    addonId: String(doc._id),
                    name: String(doc.published.name || ''),
                    price: Math.max(0, Number(doc.published.price) || 0),
                    foodType: doc.published.foodType || 'Veg',
                    image: doc.published.image || '',
                },
            ]),
    );
}

/**
 * Price a stored selection against live add-on data.
 * Returns the priced list, the per-unit total, and anything that disappeared so
 * the caller can tell the customer instead of quietly dropping it.
 */
export function priceAddonSelection(selection = [], addonMap = new Map()) {
    const addons = [];
    const removed = [];

    for (const entry of selection || []) {
        const key = String(entry?.addonId || '');
        const live = addonMap.get(key);
        if (!live) {
            removed.push(key);
            continue;
        }
        const quantity = Math.min(
            MAX_ADDON_QUANTITY,
            Math.max(1, Number(entry?.quantity) || 1),
        );
        addons.push({
            addonId: live.addonId,
            name: live.name,
            price: live.price,
            quantity,
            foodType: live.foodType,
            image: live.image,
            total: roundCurrency(live.price * quantity),
        });
    }

    const unitTotal = roundCurrency(
        addons.reduce((sum, addon) => sum + addon.price * addon.quantity, 0),
    );

    return { addons, unitTotal, removed };
}

/** Per-unit add-on cost of an already-priced line. */
export function computeAddonUnitTotal(addons = []) {
    return roundCurrency(
        (Array.isArray(addons) ? addons : []).reduce(
            (sum, addon) => sum + (Number(addon?.price) || 0) * (Number(addon?.quantity) || 1),
            0,
        ),
    );
}

/**
 * Stable signature for a line's add-on selection. Two lines of the same item and
 * variant are the same cart line only when their add-ons match exactly.
 */
export function buildAddonSignature(selection = []) {
    return (Array.isArray(selection) ? selection : [])
        .map((entry) => `${String(entry?.addonId || '')}x${Number(entry?.quantity) || 1}`)
        .sort()
        .join(',');
}
