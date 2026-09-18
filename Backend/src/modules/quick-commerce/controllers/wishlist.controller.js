import mongoose from 'mongoose';
import { QuickProduct } from '../models/product.model.js';
import { QuickWishlist } from '../models/wishlist.model.js';

const approvedProductFilter = {
  $or: [
    { isActive: true },
    { isActive: { $exists: false } },
    { status: 'active' },
  ],
  $and: [
    {
      $or: [
        { approvalStatus: { $exists: false } },
        { approvalStatus: 'approved' },
      ],
    },
  ],
};

const resolveId = (req) => {
  if (req.user?.userId) return { userId: req.user.userId };
  const sessionId = String(req.headers['x-quick-session'] || req.query.sessionId || req.body.sessionId || '').trim();
  return sessionId ? { sessionId } : null;
};

const parseIdsOnly = (value) => String(value).trim().toLowerCase() === 'true';

const toProductId = (value) => {
  const raw = value && typeof value === 'object' && !(value instanceof mongoose.Types.ObjectId)
    ? (value.productId || value._id || value.id)
    : value;
  const id = String(raw || '').trim();
  return mongoose.isValidObjectId(id) ? id : '';
};

const toVariantId = (value, fallback = '') => {
  if (value && typeof value === 'object' && !(value instanceof mongoose.Types.ObjectId)) {
    return String(value.variantId || value.variantKey || '').trim();
  }
  return String(fallback || '').trim();
};

const normalizeWishlistEntry = (item) => {
  const productId = toProductId(item);
  if (!productId) return null;
  return {
    productId,
    variantId: toVariantId(item),
  };
};

const readWishlistEntries = (wishlistDoc) =>
  (Array.isArray(wishlistDoc?.products) ? wishlistDoc.products : [])
    .map((item) => normalizeWishlistEntry(item))
    .filter(Boolean);

const entryKey = (entry) => `${entry.productId}::${entry.variantId || ''}`;

const sameEntry = (left, right) => {
  if (!left || !right) return false;
  if (String(left.productId) !== String(right.productId)) return false;
  return String(left.variantId || "") === String(right.variantId || "");
};

const pickVariant = (product, variantId) => {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return null;
  const wanted = String(variantId || '').trim();
  if (!wanted) return variants[0];
  return (
    variants.find((variant) => {
      const keys = [
        variant?._id,
        variant?.id,
        variant?.sku,
        variant?.name,
      ].map((value) => String(value || '').trim()).filter(Boolean);
      return keys.includes(wanted);
    }) || variants[0]
  );
};

const applyVariantToWishlistProduct = (product, variantId) => {
  const variant = pickVariant(product, variantId);
  const variantImages = Array.isArray(variant?.images) ? variant.images.filter(Boolean) : [];
  const image = variantImages[0] || product.mainImage || product.image || '';
  const salePrice = Number(variant?.salePrice || 0);
  const basePrice = Number(variant?.price || product.price || 0);
  const price = salePrice > 0 ? salePrice : basePrice;
  return {
    ...product,
    image,
    mainImage: image,
    galleryImages: variantImages.length ? variantImages : (product.galleryImages || []),
    price: variant ? basePrice : Number(product.price || 0),
    salePrice: variant ? salePrice : Number(product.salePrice || 0),
    stock: variant ? Number(variant.stock || 0) : Number(product.stock || 0),
    selectedVariant: variant,
    variantId: variant ? String(variant._id || variantId || '') : String(variantId || ''),
    variantKey: variant
      ? String(variant._id || variant.id || variant.sku || variant.name || '')
      : String(variantId || ''),
  };
};

const getWishlistDocument = async (idQuery) =>
  QuickWishlist.findOneAndUpdate(
    idQuery,
    { $setOnInsert: { ...idQuery, products: [] } },
    { upsert: true, new: true }
  );

const buildWishlistResponse = async (wishlistDoc, { idsOnly = false } = {}) => {
  const entries = readWishlistEntries(wishlistDoc);
  const productIds = [...new Set(entries.map((entry) => entry.productId))];

  if (idsOnly || productIds.length === 0) {
    return {
      id: wishlistDoc?._id || null,
      products: idsOnly
        ? entries.map((entry) => ({
            productId: entry.productId,
            variantId: entry.variantId || '',
            id: entry.productId,
          }))
        : [],
    };
  }

  const products = await QuickProduct.find({
    _id: { $in: productIds },
    ...approvedProductFilter,
  }).lean();

  const productMap = products.reduce((acc, product) => {
    acc[String(product._id)] = product;
    return acc;
  }, {});

  return {
    id: wishlistDoc?._id || null,
    products: entries
      .map((entry) => {
        const product = productMap[entry.productId];
        if (!product) return null;
        return applyVariantToWishlistProduct(product, entry.variantId);
      })
      .filter(Boolean),
  };
};

const resolveRequestedEntry = (req) => {
  const productId = toProductId(req.body?.productId || req.params?.productId);
  const variantId = toVariantId(
    req.body,
    req.body?.variantId || req.query?.variantId || req.params?.variantId,
  );
  return productId ? { productId, variantId } : null;
};

const writeEntries = async (wishlist, entries) => {
  const unique = [];
  const seen = new Set();
  for (const entry of entries) {
    const key = entryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      productId: entry.productId,
      variantId: entry.variantId || '',
    });
  }
  wishlist.products = unique;
  wishlist.markModified('products');
  await wishlist.save();
};

export const getWishlist = async (req, res) => {
  const idQuery = resolveId(req);
  if (!idQuery) {
    return res.status(400).json({ success: false, message: 'sessionId or userId is required' });
  }

  const wishlist = await getWishlistDocument(idQuery);
  const result = await buildWishlistResponse(wishlist, { idsOnly: parseIdsOnly(req.query.idsOnly) });
  return res.json({ success: true, result });
};

export const addToWishlist = async (req, res) => {
  const idQuery = resolveId(req);
  const requested = resolveRequestedEntry(req);

  if (!idQuery || !requested) {
    return res.status(400).json({ success: false, message: 'sessionId/userId and productId are required' });
  }

  const product = await QuickProduct.findOne({ _id: requested.productId, ...approvedProductFilter }).lean();
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const wishlist = await getWishlistDocument(idQuery);
  const entries = readWishlistEntries(wishlist);
  if (!entries.some((entry) => sameEntry(entry, requested))) {
    entries.push(requested);
  }
  await writeEntries(wishlist, entries);

  const result = await buildWishlistResponse(wishlist, { idsOnly: false });
  return res.json({ success: true, result });
};

export const removeFromWishlist = async (req, res) => {
  const idQuery = resolveId(req);
  const requested = resolveRequestedEntry(req);

  if (!idQuery || !requested) {
    return res.status(400).json({ success: false, message: 'sessionId/userId and productId are required' });
  }

  const wishlist = await getWishlistDocument(idQuery);
  const next = readWishlistEntries(wishlist).filter((entry) => !sameEntry(entry, requested));
  await writeEntries(wishlist, next);

  const result = await buildWishlistResponse(wishlist, { idsOnly: false });
  return res.json({ success: true, result });
};

export const toggleWishlist = async (req, res) => {
  const idQuery = resolveId(req);
  const requested = resolveRequestedEntry(req);

  if (!idQuery || !requested) {
    return res.status(400).json({ success: false, message: 'sessionId/userId and productId are required' });
  }

  const product = await QuickProduct.findOne({ _id: requested.productId, ...approvedProductFilter }).lean();
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const wishlist = await getWishlistDocument(idQuery);
  const entries = readWishlistEntries(wishlist);
  const exists = entries.some((entry) => sameEntry(entry, requested));
  const next = exists
    ? entries.filter((entry) => !sameEntry(entry, requested))
    : [...entries, requested];
  await writeEntries(wishlist, next);

  const result = await buildWishlistResponse(wishlist, { idsOnly: false });
  return res.json({ success: true, result });
};
