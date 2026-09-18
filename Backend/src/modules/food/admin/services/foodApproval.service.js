import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodItem } from '../models/food.model.js';
import { FoodAddon } from '../../restaurant/models/foodAddon.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { syncMenuItemApprovalStatus } from '../../restaurant/services/restaurantMenu.service.js';
import { getFoodDisplayPrice, getFoodDisplayOtherPrice, serializeFoodVariants } from './foodVariant.service.js';

const toRestaurantDisplayId = (mongoId) => {
    const s = String(mongoId || '');
    return s.length >= 5 ? s.slice(-5) : s;
};

export async function listPendingFoodApprovals(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 200, 1), 1000);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = { approvalStatus: 'pending' };
    if (query.restaurantId && mongoose.Types.ObjectId.isValid(String(query.restaurantId))) {
        filter.restaurantId = query.restaurantId;
    }
    if (query.search && String(query.search).trim()) {
        const term = String(query.search).trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
            { name: { $regex: term, $options: 'i' } },
            { categoryName: { $regex: term, $options: 'i' } }
        ];
    }

    const foodList = await FoodItem.find(filter)
        .sort({ requestedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const addonList = await FoodAddon.find({ approvalStatus: 'pending' })
        .sort({ requestedAt: -1, createdAt: -1 })
        .limit(limit)
        .select('restaurantId draft isAvailable requestedAt createdAt')
        .lean();

    const restaurantUpdateList = await FoodRestaurant.find({ pendingUpdateStatus: 'pending' })
        .sort({ pendingUpdateRequestedAt: -1, createdAt: -1 })
        .limit(limit)
        .select('restaurantName pendingUpdates pendingUpdateStatus pendingUpdateRequestedAt')
        .lean();

    const restaurantIds = Array.from(new Set([
        ...foodList.map((f) => String(f.restaurantId)),
        ...addonList.map((a) => String(a.restaurantId)),
        ...restaurantUpdateList.map((r) => String(r._id))
    ].filter(Boolean)));

    const restaurants = restaurantIds.length
        ? await FoodRestaurant.find({ _id: { $in: restaurantIds } }).select('restaurantName').lean()
        : [];
    const restaurantMap = new Map(restaurants.map((r) => [String(r._id), r.restaurantName]));

    const foodRequests = foodList.map((f) => ({
        _id: f._id,
        id: f._id,
        entityType: 'food',
        type: 'food',
        restaurantName: restaurantMap.get(String(f.restaurantId)) || 'Unknown Restaurant',
        restaurantId: toRestaurantDisplayId(f.restaurantId),
        category: f.categoryName || '',
        itemName: f.name,
        foodType: f.foodType || 'Non-Veg',
        sectionName: f.categoryName || '',
        subsectionName: '',
        approvalStatus: f.approvalStatus || 'pending',
        price: getFoodDisplayPrice(f),
        otherPrice: getFoodDisplayOtherPrice(f),
        variants: serializeFoodVariants(f.variants),
        image: f.image || '',
        images: Array.isArray(f.images) && f.images.length > 0 ? f.images.filter(Boolean) : (f.image ? [f.image] : []),
        requestedAt: f.requestedAt || f.createdAt,
        isActionable: (f.approvalStatus || 'pending') === 'pending',
        description: f.description || '',
        isAvailable: f.isAvailable !== false,
        preparationTime: f.preparationTime || '',
        previousApproved: f.previousApproved || null
    }));

    const addonRequests = addonList.map((a) => ({
        _id: a._id,
        id: a._id,
        entityType: 'addon',
        type: 'addon',
        restaurantName: restaurantMap.get(String(a.restaurantId)) || 'Unknown Restaurant',
        restaurantId: toRestaurantDisplayId(a.restaurantId),
        category: 'Add-on',
        itemName: a.draft?.name || 'Unnamed Add-on',
        foodType: 'Add-on',
        sectionName: 'Add-on',
        subsectionName: '',
        approvalStatus: 'pending',
        price: a.draft?.price ?? 0,
        image: a.draft?.image || (a.draft?.images && a.draft.images[0]) || '',
        images: a.draft?.images || (a.draft?.image ? [a.draft.image] : []),
        requestedAt: a.requestedAt || a.createdAt,
        isActionable: true,
        description: a.draft?.description || ''
    }));

    const restaurantUpdateRequests = restaurantUpdateList.map((r) => ({
        _id: r._id,
        id: r._id,
        entityType: 'restaurant_update',
        type: 'restaurant_update',
        restaurantName: r.restaurantName || 'Unknown Restaurant',
        restaurantId: toRestaurantDisplayId(r._id),
        category: 'Outlet Info',
        itemName: 'Profile Update',
        foodType: 'Restaurant',
        sectionName: 'Profile',
        subsectionName: '',
        approvalStatus: 'pending',
        price: 0,
        image: '',
        images: [],
        requestedAt: r.pendingUpdateRequestedAt || r.createdAt,
        isActionable: true,
        description: 'Outlet Info Update (Name/Address)',
        pendingUpdates: r.pendingUpdates || {}
    }));

    const allRequests = [...foodRequests, ...addonRequests, ...restaurantUpdateRequests].sort((a, b) => 
        new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
    );

    return { requests: allRequests, page, limit, total: allRequests.length };
}

export async function approveFoodItem(id, performer = null) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid food id');
    }
    const updated = await FoodItem.findOneAndUpdate(
        { _id: id, approvalStatus: 'pending' },
        { $set: { approvalStatus: 'approved', approvedAt: new Date(), rejectedAt: null, rejectionReason: '', approvedBy: performer }, $unset: { previousApproved: "" } },
        { new: true }
    ).lean();
    if (updated?.restaurantId) {
        // Single DB update; makes user-facing menu reflect approval immediately.
        await syncMenuItemApprovalStatus(updated.restaurantId, updated._id, 'approved', '');
        if (updated.isAvailable !== false) {
            await FoodRestaurant.updateOne(
                { _id: updated.restaurantId, hasHadActiveItems: { $ne: true } },
                { $set: { hasHadActiveItems: true } }
            );
        }
        
        try {
            const { notifyOwnersSafely } = await import('../../../../core/notifications/firebase.service.js');
            await notifyOwnersSafely(
                [{ ownerType: 'RESTAURANT', ownerId: updated.restaurantId }],
                {
                    title: 'Dish Approved! 🍲',
                    body: `Your dish "${updated.name}" has been approved and is now visible to customers.`,
                    image: updated.image || 'https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png',
                    data: {
                        type: 'food_approved',
                        foodId: String(updated._id),
                        restaurantId: String(updated.restaurantId)
                    }
                }
            );
        } catch (e) {
            console.error('Failed to send food approval notification:', e);
        }
    }
    return updated;
}

export async function rejectFoodItem(id, reason, performer = null) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid food id');
    }
    const r = typeof reason === 'string' ? reason.trim() : '';
    if (!r) throw new ValidationError('Rejection reason is required');
    if (r.length > 500) throw new ValidationError('Rejection reason is too long');

    const updated = await FoodItem.findOneAndUpdate(
        { _id: id, approvalStatus: 'pending' },
        { $set: { approvalStatus: 'rejected', rejectedAt: new Date(), rejectionReason: r, approvedAt: null, rejectedBy: performer }, $unset: { previousApproved: "" } },
        { new: true }
    ).lean();
    if (updated?.restaurantId) {
        await syncMenuItemApprovalStatus(updated.restaurantId, updated._id, 'rejected', r);
        
        try {
            const { notifyOwnersSafely } = await import('../../../../core/notifications/firebase.service.js');
            await notifyOwnersSafely(
                [{ ownerType: 'RESTAURANT', ownerId: updated.restaurantId }],
                {
                    title: 'Dish Rejected ❌',
                    body: `Your dish "${updated.name}" was rejected. Reason: ${r}`,
                    image: updated.image || 'https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png',
                    data: {
                        type: 'food_rejected',
                        foodId: String(updated._id),
                        restaurantId: String(updated.restaurantId),
                        reason: r
                    }
                }
            );
        } catch (e) {
            console.error('Failed to send food rejection notification:', e);
        }
    }
    return updated;
}

export async function approveRestaurantUpdate(id, performer = null) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid restaurant id');
    }
    
    const restaurant = await FoodRestaurant.findOne({ _id: id, pendingUpdateStatus: 'pending' }).lean();
    if (!restaurant || !restaurant.pendingUpdates) {
        throw new ValidationError('No pending update found for this restaurant');
    }

    const updatesToApply = { ...restaurant.pendingUpdates };
    const previousPureVeg = Boolean(restaurant.pureVegRestaurant);
    const nextPureVeg = Object.prototype.hasOwnProperty.call(updatesToApply, 'pureVegRestaurant')
        ? Boolean(updatesToApply.pureVegRestaurant)
        : previousPureVeg;
    
    const updated = await FoodRestaurant.findOneAndUpdate(
        { _id: id, pendingUpdateStatus: 'pending' },
        { 
            $set: { 
                ...updatesToApply,
                pendingUpdateStatus: 'none', 
                pendingUpdateReason: '',
                status: restaurant.status === 'approved' || !restaurant.status ? 'approved' : restaurant.status,
            }, 
            $unset: { 
                pendingUpdates: 1,
                pendingUpdateRequestedAt: 1
            } 
        },
        { new: true }
    ).lean();

    // Enforce veg visibility after restaurant type becomes Pure Veg (or restore when leaving Pure Veg).
    if (previousPureVeg !== nextPureVeg) {
        try {
            await enforcePureVegMenuVisibility(id, nextPureVeg);
        } catch (e) {
            console.error('Failed to enforce pure-veg menu visibility:', e);
        }
    }

    try {
        const { notifyOwnersSafely } = await import('../../../../core/notifications/firebase.service.js');
        await notifyOwnersSafely(
            [{ ownerType: 'RESTAURANT', ownerId: updated._id }],
            {
                title: 'Profile Update Approved ✅',
                body: `Your restaurant profile updates have been approved.`,
                data: {
                    type: 'restaurant_update_approved',
                    restaurantId: String(updated._id)
                }
            }
        );
    } catch (e) {
        console.error('Failed to send restaurant update approval notification:', e);
    }

    return updated;
}

/**
 * Hide Non-Veg categories/items from customers when restaurant is Pure Veg.
 * Data stays in DB; only customer visibility/availability flags change.
 */
export async function enforcePureVegMenuVisibility(restaurantId, isPureVeg) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) return;

    const { FoodCategory } = await import('../models/category.model.js');
    const { invalidatePublicRestaurantMenuCache } = await import('../../restaurant/services/restaurantMenu.service.js');

    if (isPureVeg) {
        await FoodItem.updateMany(
            {
                restaurantId,
                foodType: 'Non-Veg',
                isAvailable: { $ne: false },
            },
            {
                $set: {
                    isAvailable: false,
                    hiddenByRestaurantType: true,
                },
            }
        );

        await FoodCategory.updateMany(
            {
                $or: [
                    { restaurantId },
                    { createdByRestaurantId: restaurantId },
                ],
                foodTypeScope: 'Non-Veg',
                isActive: { $ne: false },
            },
            {
                $set: {
                    isActive: false,
                    hiddenByRestaurantType: true,
                },
            }
        );
    } else {
        await FoodItem.updateMany(
            {
                restaurantId,
                hiddenByRestaurantType: true,
            },
            {
                $set: {
                    isAvailable: true,
                },
                $unset: {
                    hiddenByRestaurantType: 1,
                },
            }
        );

        await FoodCategory.updateMany(
            {
                $or: [
                    { restaurantId },
                    { createdByRestaurantId: restaurantId },
                ],
                hiddenByRestaurantType: true,
            },
            {
                $set: {
                    isActive: true,
                },
                $unset: {
                    hiddenByRestaurantType: 1,
                },
            }
        );
    }

    await invalidatePublicRestaurantMenuCache();
}

export async function rejectRestaurantUpdate(id, reason, performer = null) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid restaurant id');
    }
    const r = typeof reason === 'string' ? reason.trim() : '';
    if (!r) throw new ValidationError('Rejection reason is required');
    if (r.length > 500) throw new ValidationError('Rejection reason is too long');

    const updated = await FoodRestaurant.findOneAndUpdate(
        { _id: id, pendingUpdateStatus: 'pending' },
        { 
            $set: { 
                pendingUpdateStatus: 'rejected', 
                pendingUpdateReason: r
            } 
        },
        { new: true }
    ).lean();

    if (updated) {
        try {
            const { notifyOwnersSafely } = await import('../../../../core/notifications/firebase.service.js');
            await notifyOwnersSafely(
                [{ ownerType: 'RESTAURANT', ownerId: updated._id }],
                {
                    title: 'Profile Update Rejected ❌',
                    body: `Your restaurant profile updates were rejected. Reason: ${r}`,
                    data: {
                        type: 'restaurant_update_rejected',
                        restaurantId: String(updated._id),
                        reason: r
                    }
                }
            );
        } catch (e) {
            console.error('Failed to send restaurant update rejection notification:', e);
        }
    }
    return updated;
}
