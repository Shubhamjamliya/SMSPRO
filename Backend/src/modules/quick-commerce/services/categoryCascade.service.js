import mongoose from 'mongoose';
import { QuickCategory } from '../models/category.model.js';
import { QuickProduct } from '../models/product.model.js';

const toId = (value) => {
  if (!value) return null;
  const str = String(value);
  return mongoose.isValidObjectId(str) ? str : null;
};

const productMatchForCategoryIds = (categoryIds = []) => {
  const ids = [...new Set(categoryIds.map(toId).filter(Boolean))];
  if (!ids.length) return null;
  return {
    $or: [
      { headerId: { $in: ids } },
      { categoryId: { $in: ids } },
      { subcategoryId: { $in: ids } },
    ],
  };
};

export const setProductsActiveByCategoryIds = async (categoryIds = [], active = true) => {
  const match = productMatchForCategoryIds(categoryIds);
  if (!match) return { matched: 0, modified: 0 };

  const result = await QuickProduct.updateMany(match, {
    $set: {
      status: active ? 'active' : 'inactive',
      isActive: Boolean(active),
    },
  });

  return {
    matched: Number(result.matchedCount || 0),
    modified: Number(result.modifiedCount || 0),
  };
};

export const getChildMainCategoryIds = async (headerId) => {
  const id = toId(headerId);
  if (!id) return [];
  const children = await QuickCategory.find({
    parentId: id,
    type: { $ne: 'subcategory' },
  })
    .select('_id')
    .lean();
  return children.map((c) => String(c._id));
};

/**
 * Cascade category status to child mains (for headers) + linked products.
 */
export const cascadeCategoryStatus = async (category, nextActive) => {
  const categoryId = String(category._id);
  const type = String(category.type || 'header');
  const active = Boolean(nextActive);

  const affectedCategoryIds = [categoryId];

  if (type === 'header') {
    const childIds = await getChildMainCategoryIds(categoryId);
    affectedCategoryIds.push(...childIds);
    if (childIds.length) {
      await QuickCategory.updateMany(
        { _id: { $in: childIds } },
        { $set: { status: active ? 'active' : 'inactive', isActive: active } },
      );
    }
  }

  const productStats = await setProductsActiveByCategoryIds(affectedCategoryIds, active);
  return {
    affectedCategoryIds,
    products: productStats,
  };
};

/**
 * Delete header (with mains) or main category; linked products become inactive.
 */
export const cascadeDeleteCategory = async (category) => {
  const categoryId = String(category._id);
  const type = String(category.type || 'header');

  const deleteIds = [categoryId];
  let childMainIds = [];

  if (type === 'header') {
    childMainIds = await getChildMainCategoryIds(categoryId);
    deleteIds.push(...childMainIds);
  }

  const productStats = await setProductsActiveByCategoryIds(deleteIds, false);

  await QuickCategory.deleteMany({ _id: { $in: deleteIds } });

  return {
    deletedCategoryIds: deleteIds,
    deletedMainCount: childMainIds.length,
    products: productStats,
  };
};

/**
 * Validate header + main category exist, are active, and correctly linked.
 * Throws Error with statusCode 400 on failure.
 */
export const assertActiveCategoryPath = async ({ headerId, categoryId } = {}) => {
  const headerObjId = toId(headerId);
  const categoryObjId = toId(categoryId);

  if (!headerObjId || !categoryObjId) {
    const err = new Error('Valid header and main category are required');
    err.statusCode = 400;
    throw err;
  }

  const [header, category] = await Promise.all([
    QuickCategory.findById(headerObjId).select('_id name type parentId status isActive').lean(),
    QuickCategory.findById(categoryObjId).select('_id name type parentId status isActive').lean(),
  ]);

  if (!header || String(header.type || '') !== 'header') {
    const err = new Error('Header category was deleted. Please select another header and main category.');
    err.statusCode = 400;
    throw err;
  }

  if (!category || String(category.type || '') !== 'category') {
    const err = new Error('Main category was deleted. Please select another header and main category.');
    err.statusCode = 400;
    throw err;
  }

  if (String(category.parentId || '') !== String(header._id)) {
    const err = new Error('Selected main category does not belong to the selected header.');
    err.statusCode = 400;
    throw err;
  }

  const headerInactive = header.isActive === false || String(header.status || 'active') !== 'active';
  const categoryInactive = category.isActive === false || String(category.status || 'active') !== 'active';

  if (headerInactive || categoryInactive) {
    const names = [
      headerInactive ? `"${header.name}" (header)` : null,
      categoryInactive ? `"${category.name}" (main)` : null,
    ]
      .filter(Boolean)
      .join(' and ');
    const err = new Error(
      `${names} is inactive. Please use another active category.`,
    );
    err.statusCode = 400;
    throw err;
  }

  return {
    headerId: header._id,
    categoryId: category._id,
    subcategoryId: null,
  };
};
