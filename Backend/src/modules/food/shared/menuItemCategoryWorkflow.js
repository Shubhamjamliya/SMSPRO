/**
 * When a menu category is deleted, linked items are deactivated and unlinked.
 * When a category is later assigned again, those orphaned inactive items should
 * become available automatically when reassigned to a valid category.
 */
export function shouldAutoReactivateFoodOnCategoryAssignment(existing = {}, options = {}) {
    const { nextCategoryId } = options;

    if (!nextCategoryId) return false;
    if (existing.categoryId) return false;
    return existing.isAvailable === false;
}

export function applyAutoReactivateToFoodUpdate(existing = {}, update = {}, body = {}) {
    const nextCategoryId = update.categoryId !== undefined ? update.categoryId : existing.categoryId;
    const shouldReactivate = shouldAutoReactivateFoodOnCategoryAssignment(existing, {
        nextCategoryId,
    });

    if (!shouldReactivate) return false;

    update.isAvailable = true;
    return true;
}
