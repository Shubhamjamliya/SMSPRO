import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodCategory } from '../../admin/models/category.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import {
    extractRawFoodVariants,
    getFoodDisplayPrice,
    getFoodDisplayOtherPrice,
    hasFoodVariants,
    normalizeFoodVariantsInput
} from '../../admin/services/foodVariant.service.js';
import {
    backfillLegacyCategoryWorkflow,
    categoryAllowsFoodType,
    GLOBAL_CATEGORY_FILTER
} from '../../shared/categoryWorkflow.js';
import { applyAutoReactivateToFoodUpdate } from '../../shared/menuItemCategoryWorkflow.js';
import { normalizeItemPackagingChargeInput } from '../../shared/packagingCharge.js';
import {
    assertOrderQuantityRange,
    normalizeOrderQuantityInput
} from '../../shared/orderQuantityRules.js';

const toStr = (v) => (v != null ? String(v).trim() : '');
const APPROVED_CATEGORY_FILTER = [
    { approvalStatus: 'approved' },
    { approvalStatus: { $exists: false }, isApproved: { $ne: false } }
];

const normalizeFoodType = (v) => {
    const t = String(v || '').trim();
    if (!t) return 'Non-Veg';
    if (t === 'Veg') return 'Veg';
    if (t === 'Non-Veg') return 'Non-Veg';
    if (t === 'Egg') return 'Non-Veg';
    return 'Non-Veg';
};

const getCreateFoodPricing = (body = {}) => {
    const variants = normalizeFoodVariantsInput(extractRawFoodVariants(body));
    
    // Prefer explicitly provided price/otherPrice from body, fallback to variant calculation
    const bodyPrice = Number(body.price);
    const bodyOtherPrice = Number(body.otherPrice);
    
    const price = (Number.isFinite(bodyPrice) && bodyPrice > 0) 
        ? bodyPrice 
        : getFoodDisplayPrice({ variants });
        
    const otherPrice = (Number.isFinite(bodyOtherPrice) && bodyOtherPrice > 0)
        ? bodyOtherPrice
        : getFoodDisplayOtherPrice({ variants });

    if (otherPrice > 0 && otherPrice < price) {
        throw new ValidationError(`Original price cannot be less than selling price (${price})`);
    }

    return {
        price,
        otherPrice,
        variants
    };
};

const getUpdatedFoodPricing = (existing = {}, body = {}) => {
    const variantsTouched = body.variants !== undefined || body.variations !== undefined;
    const update = {};

    if (variantsTouched) {
        const variants = normalizeFoodVariantsInput(extractRawFoodVariants(body));
        update.variants = variants;
    }

    // Check if price/otherPrice are provided in body
    const bodyPrice = Number(body.price);
    const bodyOtherPrice = Number(body.otherPrice);

    if (Number.isFinite(bodyPrice) && bodyPrice > 0) {
        update.price = bodyPrice;
    } else if (variantsTouched) {
        // Recalculate if variants changed and no explicit price provided
        const variants = update.variants || [];
        if (variants.length > 0) {
            update.price = getFoodDisplayPrice({ variants });
        }
    }

    if (Number.isFinite(bodyOtherPrice) && bodyOtherPrice > 0) {
        update.otherPrice = bodyOtherPrice;
    } else if (variantsTouched) {
        // Recalculate if variants changed and no explicit otherPrice provided
        const variants = update.variants || [];
        if (variants.length > 0) {
            update.otherPrice = getFoodDisplayOtherPrice({ variants });
        }
    }

    const finalPrice = update.price !== undefined ? update.price : existing.price;
    const finalOtherPrice = update.otherPrice !== undefined ? update.otherPrice : existing.otherPrice;

    if (finalOtherPrice > 0 && finalOtherPrice < finalPrice) {
        throw new ValidationError(`Original price cannot be less than selling price (${finalPrice})`);
    }

    return update;
};

const getRestaurantContext = async (restaurantId) => {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
        throw new ValidationError('Invalid restaurant id');
    }

    const restaurant = await FoodRestaurant.findById(restaurantId)
        .select('pureVegRestaurant')
        .lean();
    if (!restaurant?._id) {
        throw new ValidationError('Restaurant not found');
    }

    return {
        restaurantId: new mongoose.Types.ObjectId(String(restaurantId)),
        pureVegRestaurant: restaurant.pureVegRestaurant === true
    };
};

const getAccessibleCategoryFilter = (context) => ({
    $or: [
        { restaurantId: context.restaurantId, $or: APPROVED_CATEGORY_FILTER },
        {
            $and: [
                { $or: GLOBAL_CATEGORY_FILTER },
                { $or: APPROVED_CATEGORY_FILTER }
            ]
        }
    ]
});

const resolveCategoryForRestaurant = async (context, body = {}) => {
    const categoryIdRaw = toStr(body.categoryId);
    const categoryNameRaw = toStr(body.categoryName);
    const foodType = normalizeFoodType(body.foodType);

    if (!categoryIdRaw && !categoryNameRaw) {
        return { categoryObjectId: undefined, categoryName: '' };
    }

    const baseFilter = {
        ...getAccessibleCategoryFilter(context),
        isActive: { $ne: false }
    };
    if (context.pureVegRestaurant) {
        baseFilter.foodTypeScope = 'Veg';
    }

    let category = null;
    if (categoryIdRaw) {
        if (!mongoose.Types.ObjectId.isValid(categoryIdRaw)) {
            throw new ValidationError('Invalid category id');
        }

        category = await FoodCategory.findOne({
            _id: new mongoose.Types.ObjectId(categoryIdRaw),
            ...baseFilter
        }).lean();
    } else {
        const exact = `^${String(categoryNameRaw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
        const matches = await FoodCategory.find({
            ...baseFilter,
            name: { $regex: exact, $options: 'i' }
        })
            .sort({ createdAt: -1 })
            .limit(2)
            .lean();
        if (matches.length > 1) {
            throw new ValidationError('Multiple categories share this name. Please choose a specific category.');
        }
        category = matches[0] || null;
    }

    if (!category?._id) {
        throw new ValidationError('Category not found for this restaurant');
    }

    await backfillLegacyCategoryWorkflow([category]);

    if (String(category.approvalStatus || '') !== 'approved') {
        throw new ValidationError('This category is awaiting admin approval');
    }
    if (context.pureVegRestaurant && String(category.foodTypeScope || '') !== 'Veg') {
        throw new ValidationError('Pure veg restaurants can only use veg categories');
    }
    if (!categoryAllowsFoodType(category.foodTypeScope, foodType)) {
        throw new ValidationError(`This ${category.foodTypeScope} category cannot accept ${foodType} food`);
    }

    return {
        categoryObjectId: category._id,
        categoryName: category.name || '',
        category
    };
};

export async function createRestaurantFood(restaurantId, body = {}) {
    const context = await getRestaurantContext(restaurantId);

    const name = toStr(body.name);
    if (!name) throw new ValidationError('Item name is required');
    if (name.length > 200) throw new ValidationError('Item name is too long');

    const { price, otherPrice, variants } = getCreateFoodPricing(body);

    const description = toStr(body.description);
    const images = Array.isArray(body.images) ? body.images.map(toStr) : (body.image ? [toStr(body.image)] : []);
    const image = images.length > 0 ? images[0] : toStr(body.image);
    const isAvailable = body.isAvailable !== false;
    const foodType = normalizeFoodType(body.foodType);
    const preparationTime = toStr(body.preparationTime);
    const packagingCharge = normalizeItemPackagingChargeInput(body.packagingCharge, { label: name });
    const orderQuantity = normalizeOrderQuantityInput(body, { label: name });
    if (orderQuantity) assertOrderQuantityRange(orderQuantity, { label: name });
    const { categoryObjectId, categoryName } = await resolveCategoryForRestaurant(context, { ...body, foodType });

    const doc = await FoodItem.create({
        restaurantId,
        categoryId: categoryObjectId,
        categoryName: categoryName || '',
        name,
        description,
        price,
        otherPrice,
        variants,
        image,
        images,
        foodType,
        isAvailable,
        preparationTime,
        ...(packagingCharge ? { packagingCharge } : {}),
        ...(orderQuantity || {}),
        approvalStatus: 'pending',
        requestedAt: new Date()
    });

    if (doc.image) {
        // Fire-and-forget background save without awaiting. Catches and logs errors safely.
        import('../../../media/services/media.service.js')
            .then(({ saveToSharedMedia }) => {
                saveToSharedMedia({
                    url: doc.image,
                    name: doc.name,
                    category: doc.categoryName || "",
                    restaurantId: doc.restaurantId
                }).catch(err => {
                    console.error('Failed to auto-save to shared media library in background:', err);
                });
            })
            .catch(err => {
                console.error('Failed to import media service for background auto-save:', err);
            });
    }

    try {
        const { notifyAdminsSafely } = await import('../../../../core/notifications/firebase.service.js');
        await notifyAdminsSafely({
            title: 'New Product Approval Request 🍔',
            body: `Restaurant has submitted a new item "${doc.name}" for approval.`,
            data: {
                type: 'approval_request',
                subType: 'food',
                id: String(doc._id)
            }
        });
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to notify admins of new food approval request:', e);
    }

    return doc.toObject();
}

export async function updateRestaurantFood(restaurantId, foodId, body = {}) {
    const context = await getRestaurantContext(restaurantId);
    if (!foodId || !mongoose.Types.ObjectId.isValid(String(foodId))) {
        throw new ValidationError('Invalid food id');
    }

    const existing = await FoodItem.findOne({ _id: foodId, restaurantId }).lean();
    if (!existing) return null;

    const update = {};
    let didAutoReactivate = false;

    if (body.name !== undefined) {
        const name = toStr(body.name);
        if (!name) throw new ValidationError('Item name is required');
        if (name.length > 200) throw new ValidationError('Item name is too long');
        update.name = name;
    }
    if (body.description !== undefined) update.description = toStr(body.description);
    if (body.images !== undefined) {
        const images = Array.isArray(body.images) ? body.images.map(toStr) : [];
        update.images = images;
        update.image = images.length > 0 ? images[0] : '';
    } else if (body.image !== undefined) {
        const img = toStr(body.image);
        update.image = img;
        update.images = img ? [img] : [];
    }
    Object.assign(update, getUpdatedFoodPricing(existing, body));
    if (body.preparationTime !== undefined) update.preparationTime = toStr(body.preparationTime);

    // Packaging is a fee, not a menu attribute — changing it never sends the item
    // back through admin approval (see criticalFields below).
    const packagingCharge = normalizeItemPackagingChargeInput(body.packagingCharge, {
        label: update.name || existing.name || 'This item'
    });
    if (packagingCharge) update.packagingCharge = packagingCharge;

    // Quantity limits are a selling rule, not a menu attribute — like packaging,
    // changing them never re-triggers admin approval.
    const orderQuantity = normalizeOrderQuantityInput(body, {
        label: update.name || existing.name || 'This item'
    });
    if (orderQuantity) {
        Object.assign(update, orderQuantity);
        assertOrderQuantityRange(
            {
                minOrderQuantity: orderQuantity.minOrderQuantity ?? existing.minOrderQuantity,
                maxOrderQuantity: orderQuantity.maxOrderQuantity ?? existing.maxOrderQuantity
            },
            { label: update.name || existing.name || 'This item' }
        );
    }

    const targetFoodType = body.foodType !== undefined ? normalizeFoodType(body.foodType) : normalizeFoodType(existing.foodType);
    if (body.foodType !== undefined) update.foodType = targetFoodType;

    if (
        body.categoryId !== undefined ||
        body.categoryName !== undefined ||
        body.foodType !== undefined
    ) {
        const { categoryObjectId, categoryName } = await resolveCategoryForRestaurant(context, {
            categoryId: body.categoryId !== undefined ? body.categoryId : existing.categoryId,
            categoryName: body.categoryName !== undefined ? body.categoryName : existing.categoryName,
            foodType: targetFoodType
        });
        update.categoryId = categoryObjectId;
        update.categoryName = categoryName || '';
        didAutoReactivate = applyAutoReactivateToFoodUpdate(existing, update, body);
    }

    let finalIsAvailable;
    if (didAutoReactivate) {
        finalIsAvailable = true;
    } else if (body.isAvailable !== undefined) {
        finalIsAvailable = body.isAvailable !== false;
    } else if (update.isAvailable !== undefined) {
        finalIsAvailable = update.isAvailable !== false;
    } else {
        finalIsAvailable = existing.isAvailable !== false;
    }

    const finalCategoryId = update.categoryId !== undefined ? update.categoryId : existing.categoryId;
    if (!didAutoReactivate && body.isAvailable !== undefined && finalIsAvailable === true) {
        if (!finalCategoryId) {
            throw new ValidationError('This menu item cannot be enabled because it is not assigned to a category. Please assign it to a category first.');
        }
    }
    if (body.isAvailable !== undefined || didAutoReactivate) {
        update.isAvailable = finalIsAvailable;
    }

    // Changes to non-critical details (preparation time, description, availability, etc.)
    // should not force the item back into review.
    let shouldResubmitForApproval = false;
    const criticalFields = ['name', 'image', 'images', 'price', 'otherPrice', 'variants', 'categoryId', 'categoryName', 'foodType'];
    for (const key of criticalFields) {
        if (update[key] !== undefined) {
            if (key === 'categoryId') {
                if (String(existing.categoryId || '') !== String(update.categoryId || '')) {
                    shouldResubmitForApproval = true; break;
                }
            } else if (key === 'variants' || key === 'images') {
                if (JSON.stringify(existing[key] || []) !== JSON.stringify(update[key] || [])) {
                    shouldResubmitForApproval = true; break;
                }
            } else {
                if (existing[key] !== update[key]) {
                    shouldResubmitForApproval = true; break;
                }
            }
        }
    }
    if (shouldResubmitForApproval) {
        // Snapshot the pre-edit values whenever the item is resubmitted, whether it was
        // previously approved or rejected, so the admin can always see what the
        // restaurant changed since the last time they reviewed it.
        if (existing.approvalStatus === 'approved' || existing.approvalStatus === 'rejected') {
            update.previousApproved = {
                name: existing.name,
                description: existing.description,
                price: existing.price,
                otherPrice: existing.otherPrice,
                image: existing.image,
                images: existing.images,
                foodType: existing.foodType,
                preparationTime: existing.preparationTime,
                variants: existing.variants
            };
        }
        update.approvalStatus = 'pending';
        update.requestedAt = new Date();
        update.rejectionReason = '';
        update.approvedAt = null;
        update.rejectedAt = null;
    }

    const updated = await FoodItem.findOneAndUpdate(
        { _id: foodId, restaurantId },
        { $set: update },
        { new: true }
    ).lean();

    if (updated && shouldResubmitForApproval) {
        try {
            const { notifyAdminsSafely } = await import('../../../../core/notifications/firebase.service.js');
            await notifyAdminsSafely({
                title: 'Updated Product Approval Request 🍔',
                body: `Restaurant has updated and resubmitted "${updated.name}" for approval.`,
                data: {
                    type: 'approval_request',
                    subType: 'food',
                    id: String(updated._id)
                }
            });
        } catch (e) {
            console.error('Failed to notify admins of resubmitted food approval request:', e);
        }
    }

    if (updated && didAutoReactivate) {
        try {
            const { invalidatePublicRestaurantMenuCache } = await import('./restaurantMenu.service.js');
            await invalidatePublicRestaurantMenuCache();
        } catch (e) {
            console.error('Failed to invalidate menu cache after food category reassignment:', e);
        }
    }

    return updated;
}
