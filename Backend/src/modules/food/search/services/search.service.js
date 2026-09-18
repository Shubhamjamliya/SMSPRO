import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodCategory } from '../../admin/models/category.model.js';
import { FoodZone } from '../../admin/models/zone.model.js';
import mongoose from 'mongoose';

const zoneToPolygon = (zoneDoc) => {
    const coords = Array.isArray(zoneDoc?.coordinates) ? zoneDoc.coordinates : [];
    if (coords.length < 3) return null;

    const ring = coords
        .map((coord) => [Number(coord.longitude), Number(coord.latitude)])
        .filter((pair) => pair.every((value) => Number.isFinite(value)));

    if (ring.length < 3) return null;

    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push(first);
    }

    return { type: 'Polygon', coordinates: [ring] };
};

const buildZoneRestaurantConstraint = async (zoneIdRaw) => {
    const trimmedZoneId = String(zoneIdRaw || '').trim();
    if (!trimmedZoneId || !mongoose.Types.ObjectId.isValid(trimmedZoneId)) {
        return null;
    }

    const zoneClauses = [{ zoneId: new mongoose.Types.ObjectId(trimmedZoneId) }];
    const zoneDoc = await FoodZone.findOne({ _id: trimmedZoneId, isActive: true }).lean();
    const polygon = zoneToPolygon(zoneDoc);
    if (polygon) {
        zoneClauses.push({ location: { $geoWithin: { $geometry: polygon } } });
    }

    return { $or: zoneClauses };
};

const sanitizeTerm = (q) => String(q || '').trim().replace(/\s+/g, ' ');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Unified Search Service
 * Searches restaurants (name, cuisine, tags, categories) and menu items
 * (name, category, description). Partial, case-insensitive matches.
 */
export const searchUnified = async (query = {}) => {
    const {
        q,
        lat,
        lng,
        categoryId,
        minRating,
        maxDeliveryTime,
        isVeg,
        page = 1,
        limit = 20,
        zoneId
    } = query;

    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * (parseInt(limit, 10) || 20);
    const pageLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const term = sanitizeTerm(q);
    const regex = term ? new RegExp(escapeRegex(term), 'i') : null;

    const restaurantFilter = { isDeleted: { $ne: true }, accountStatus: { $ne: 'deleted' } };

    const zoneConstraint = await buildZoneRestaurantConstraint(zoneId);
    if (zoneConstraint) {
        restaurantFilter.$and = [...(restaurantFilter.$and || []), zoneConstraint];
    }

    if (isVeg === 'true') {
        restaurantFilter.pureVegRestaurant = true;
    }

    if (minRating) {
        restaurantFilter.rating = { $gte: parseFloat(minRating) };
    }

    if (maxDeliveryTime) {
        restaurantFilter.estimatedDeliveryTimeMinutes = { $lte: parseInt(maxDeliveryTime, 10) };
    }

    // Category filter via food items that belong to the category
    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
        const catFoodItems = await FoodItem.find({
            categoryId: new mongoose.Types.ObjectId(categoryId),
            approvalStatus: 'approved',
            isAvailable: { $ne: false },
            hiddenByRestaurantType: { $ne: true }
        }).select('restaurantId').lean();

        const catRestaurantIds = [...new Set(catFoodItems.map((f) => String(f.restaurantId)))];
        if (catRestaurantIds.length === 0) {
            return {
                success: true,
                data: { restaurants: [], total: 0, page: parseInt(page, 10) || 1, limit: pageLimit }
            };
        }
        restaurantFilter._id = { $in: catRestaurantIds.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    /** @type {Map<string, object>} */
    const resultMap = new Map();

    const upsertRestaurant = (doc, extras = {}) => {
        if (!doc?._id) return;
        const key = String(doc._id);
        const existing = resultMap.get(key);
        // Prefer keeping an explicit food match highlight when present.
        if (existing?.matchType === 'food' && extras.matchType !== 'food') {
            resultMap.set(key, { ...doc, ...existing, ...extras, matchType: 'food' });
            return;
        }
        resultMap.set(key, { ...(existing || {}), ...doc, ...extras });
    };

    if (regex) {
        // A. Restaurant name / cuisine / tags / city
        const matchedRestaurants = await FoodRestaurant.find({
            ...restaurantFilter,
            $or: [
                { restaurantName: regex },
                { cuisines: regex },
                { city: regex },
                { area: regex }
            ]
        })
            .limit(pageLimit * 3)
            .lean();

        matchedRestaurants.forEach((r) => {
            upsertRestaurant(r, { matchType: 'restaurant' });
        });

        // B. Menu items — name, category, description (dish / category search)
        const foodFilters = {
            approvalStatus: 'approved',
            isAvailable: { $ne: false },
            hiddenByRestaurantType: { $ne: true },
            $or: [
                { name: regex },
                { categoryName: regex },
                { description: regex }
            ]
        };
        if (isVeg === 'true') foodFilters.foodType = 'Veg';

        const matchedFoods = await FoodItem.find(foodFilters)
            .limit(pageLimit * 4)
            .lean();

        if (matchedFoods.length > 0) {
            const foodByRestaurant = new Map();
            matchedFoods.forEach((food) => {
                const rid = String(food.restaurantId);
                if (!foodByRestaurant.has(rid)) foodByRestaurant.set(rid, food);
            });

            const restaurantIds = [...foodByRestaurant.keys()].filter(
                (id) => mongoose.Types.ObjectId.isValid(id)
            );

            if (restaurantIds.length > 0) {
                const restaurantsForFood = await FoodRestaurant.find({
                    ...restaurantFilter,
                    _id: { $in: restaurantIds.map((id) => new mongoose.Types.ObjectId(id)) }
                }).lean();

                restaurantsForFood.forEach((r) => {
                    const food = foodByRestaurant.get(String(r._id));
                    upsertRestaurant(r, {
                        matchType: 'food',
                        matchedDish: food?.name || '',
                        matchedDishImage: food?.image || (Array.isArray(food?.images) ? food.images[0] : '') || '',
                        matchedDishId: food?._id || null,
                        matchedCategory: food?.categoryName || ''
                    });
                });
            }
        }
    } else {
        const allMatching = await FoodRestaurant.find(restaurantFilter)
            .sort({ rating: -1, createdAt: -1 })
            .limit(pageLimit * 2)
            .lean();

        allMatching.forEach((r) => upsertRestaurant(r, { matchType: 'restaurant' }));
    }

    let results = Array.from(resultMap.values());

    if (lat && lng && results.length > 0) {
        const userLat = Number(lat);
        const userLng = Number(lng);
        results.forEach((res) => {
            if (res.location && res.location.latitude && res.location.longitude) {
                const dLat = ((res.location.latitude - userLat) * Math.PI) / 180;
                const dLon = ((res.location.longitude - userLng) * Math.PI) / 180;
                const a =
                    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos((userLat * Math.PI) / 180) *
                        Math.cos((res.location.latitude * Math.PI) / 180) *
                        Math.sin(dLon / 2) *
                        Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                res.distanceScore = 6371 * c;
            } else {
                res.distanceScore = 999;
            }
        });
        results.sort((a, b) => (a.distanceScore || 999) - (b.distanceScore || 999));
    } else {
        // Prefer dish matches, then higher rated restaurants
        results.sort((a, b) => {
            if (a.matchType === 'food' && b.matchType !== 'food') return -1;
            if (b.matchType === 'food' && a.matchType !== 'food') return 1;
            return (b.rating || 0) - (a.rating || 0);
        });
    }

    return {
        success: true,
        data: {
            restaurants: results.slice(skip, skip + pageLimit),
            total: results.length,
            page: parseInt(page, 10) || 1,
            limit: pageLimit,
            zoneFiltered: !!(zoneId && mongoose.Types.ObjectId.isValid(zoneId))
        }
    };
};

/**
 * Fetch Admin-only categories
 */
export const getAdminCategories = async (query = {}) => {
    const filter = {
        isActive: true,
        isApproved: true,
        $or: [
            { restaurantId: { $exists: false } },
            { restaurantId: null },
            { restaurantId: { $eq: undefined } }
        ]
    };

    if (query.zoneId && mongoose.Types.ObjectId.isValid(query.zoneId)) {
        filter.$or = [
            { zoneId: new mongoose.Types.ObjectId(query.zoneId) },
            { zoneId: { $exists: false } },
            { zoneId: null }
        ];
    }

    const categories = await FoodCategory.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
    return categories;
};
