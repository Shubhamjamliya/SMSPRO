import mongoose from 'mongoose';
import { QuickCart } from '../models/cart.model.js';
import { QuickProduct } from '../models/product.model.js';
import { calculateQuickPricing } from '../admin/services/billing.service.js';
import {
  buildCartLineKey,
  matchProductVariant,
  resolveVariantLabel,
  resolveVariantStock,
  resolveVariantUnitPrice,
  stripCompositeProductId,
} from '../utils/variant.helpers.js';
import {
  assertNoSellerMismatch,
  collectSellerIdsFromProducts,
  resolveProductSellerId,
  SELLER_MISMATCH_CODE,
} from '../utils/singleSeller.helpers.js';
import { Seller } from '../seller/models/seller.model.js';
import { assertSellerShopOpen } from '../utils/timeFormat.helpers.js';
import { getSellerLocation } from '../services/quickOrder.service.js';
import { haversineKm } from '../../food/orders/services/order.helpers.js';
import {
  assignFlatPackingLineTotals,
  sumUniqueProductPackingFee,
} from '../utils/packing.helpers.js';
import { getQuickCoupons } from '../services/content.service.js';
import {
  assertQuickCouponApplicable,
  findActiveSellerCoupon,
  resolveCartSellerId,
  getSellerEligibleCartTotal,
} from '../utils/coupon.helpers.js';

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

/** Identity fields only — never include `items` here (conflicts with `$set: { items }`). */
const buildCartInsertDoc = (idQuery) => {
  if (!idQuery) return {};
  if (idQuery.userId) {
    return {
      userId: idQuery.userId,
      sessionId: `user:${String(idQuery.userId)}`,
    };
  }
  return {
    sessionId: String(idQuery.sessionId || '').trim(),
  };
};

const parseRequestCoords = (req) => {
  const src = { ...(req.query || {}), ...(req.body || {}) };
  const lat = Number(src.lat ?? src.latitude);
  const lng = Number(src.lng ?? src.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const findCartItemIndex = (items = [], productId, variantKey = '', variantName = '') =>
  items.findIndex((item) => {
    if (String(item.productId) !== String(productId)) return false;
    const itemKey = String(item.variantKey || '').trim();
    const itemName = String(item.variantName || '').trim();
    const key = String(variantKey || '').trim();
    const name = String(variantName || '').trim();
    if (key && itemKey) return itemKey === key;
    if (name && itemName) return itemName === name;
    if (key) return itemKey === key || itemName === key;
    if (name) return itemName === name || itemKey === name;
    return !itemKey && !itemName;
  });

const resolveCartDistanceKm = async (products = [], userCoords = null) => {
  if (!userCoords || !products.length) return 0;
  const sellerId = products.find((p) => p?.sellerId)?.sellerId;
  if (!sellerId) return 0;
  const seller = await Seller.findById(sellerId).select('location').lean();
  const sellerCoords = getSellerLocation(seller);
  if (!sellerCoords) return 0;
  return haversineKm(sellerCoords.lat, sellerCoords.lng, userCoords.lat, userCoords.lng);
};

const mapCart = async (
  idQuery,
  { distanceKm = 0, userCoords = null, couponCode = '', userId = null } = {},
) => {
  const cart = await QuickCart.findOne(idQuery).lean();
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    return {
      items: [],
      subtotal: 0,
      packagingFee: 0,
      deliveryFee: 0,
      platformFee: 0,
      handlingFee: 0,
      tax: 0,
      gst: 0,
      discount: 0,
      couponCode: '',
      total: 0,
      distanceKm: 0,
    };
  }

  const productIds = cart.items
    .map((item) => item.productId)
    .filter((id) => mongoose.isValidObjectId(id));

  // Projection: only fields needed for pricing, GST, packing, and cart UI.
  const products = await QuickProduct.find({ _id: { $in: productIds }, ...approvedProductFilter })
    .select(
      '_id name mainImage image price salePrice mrp unit weight stock packingAmount variants sellerId categoryId headerId',
    )
    .lean();
  const productMap = products.reduce((acc, product) => {
    acc[String(product._id)] = product;
    return acc;
  }, {});

  const items = assignFlatPackingLineTotals(
    cart.items
      .map((item) => {
        const product = productMap[String(item.productId)];
        if (!product) return null;

        const variantMeta = {
          variantName: item.variantName || '',
          variantKey: item.variantKey || '',
          variantSku: item.variantSku || '',
          price: Number(item.unitPrice || 0),
        };
        const matchedVariant = matchProductVariant(product, variantMeta);
        const unitPrice = resolveVariantUnitPrice(product, variantMeta);
        const variantStock = resolveVariantStock(product, variantMeta);
        const mrp = Math.max(
          0,
          Number(
            matchedVariant?.mrp ||
              matchedVariant?.originalPrice ||
              product.mrp ||
              product.price ||
              unitPrice ||
              0,
          ),
        );
        const variantLabel = resolveVariantLabel(product, variantMeta);
        const lineKey = buildCartLineKey(
          product._id,
          variantMeta.variantKey,
          variantMeta.variantName,
        );
        const packingAmount = Math.max(0, Number(product.packingAmount || 0));
        const sellerId = product.sellerId ? String(product.sellerId) : '';

        return {
          id: lineKey,
          productId: String(product._id),
          headerId: product.headerId ? String(product.headerId) : null,
          name: product.name,
          image: product.mainImage || product.image || '',
          price: unitPrice,
          salePrice: unitPrice,
          mrp,
          originalPrice: mrp > 0 ? mrp : unitPrice,
          unit: product.unit || '',
          weight: product.weight || '',
          stock: variantStock,
          quantity: item.quantity,
          lineTotal: item.quantity * unitPrice,
          packingAmount,
          variantName: variantLabel,
          variantKey: variantMeta.variantKey,
          variantSku: variantMeta.variantSku,
          sellerId,
          quickStoreId: sellerId,
          selectedVariant: variantLabel
            ? {
                name: variantLabel,
                sku: variantMeta.variantSku,
                _id: variantMeta.variantKey,
              }
            : null,
        };
      })
      .filter(Boolean),
  );

  const subtotal = items.reduce((acc, item) => acc + item.lineTotal, 0);
  const packagingFee = sumUniqueProductPackingFee(items);

  let resolvedDistance = Number(distanceKm) || 0;
  if ((!Number.isFinite(resolvedDistance) || resolvedDistance <= 0) && userCoords) {
    resolvedDistance = await resolveCartDistanceKm(products, userCoords);
  }

  let discount = 0;
  let appliedCouponCode = '';
  let couponError = '';
  const requestedCoupon = String(couponCode || '').trim().toUpperCase();
  if (requestedCoupon && items.length > 0) {
    try {
      const adminCoupons = await getQuickCoupons();
      let coupon = adminCoupons.find(
        (c) => String(c.code || '').toUpperCase() === requestedCoupon,
      );
      const cartSellerId = resolveCartSellerId(items);
      if (!coupon) {
        coupon = await findActiveSellerCoupon({
          code: requestedCoupon,
          sellerId: cartSellerId,
        });
      }
      if (!coupon) {
        couponError = 'Coupon not found or not valid for this store';
      } else {
        const isSellerCoupon = coupon.isSellerCoupon === true;
        const couponSellerId = String(coupon.sellerId || cartSellerId || '').trim();
        const eligibleTotal = isSellerCoupon
          ? getSellerEligibleCartTotal(items, couponSellerId)
          : subtotal;
        const applied = await assertQuickCouponApplicable(coupon, {
          cartTotal: eligibleTotal,
          userId: userId || null,
          items,
          sellerId: couponSellerId,
        });
        discount = Number(applied.discountAmount || 0);
        appliedCouponCode = String(applied.code || requestedCoupon).toUpperCase();
      }
    } catch (error) {
      couponError = error?.message || 'Unable to apply coupon to cart';
      discount = 0;
      appliedCouponCode = '';
    }
  }

  const { pricing } = await calculateQuickPricing({
    subtotal,
    discount,
    products,
    lineItems: items,
    distanceKm: resolvedDistance,
  });

  // Public cart items: omit internal-only / FE-recomputable fields (GST is top-level).
  const publicItems = items.map((item) => {
    const {
      lineTotal,
      headerId,
      packingLineTotal,
      ...rest
    } = item;
    return rest;
  });

  const result = {
    items: publicItems,
    subtotal,
    packagingFee: Number(pricing?.packagingFee ?? packagingFee) || 0,
    deliveryFee: Number(pricing?.deliveryFee || 0),
    platformFee: Number(pricing?.platformFee || 0),
    handlingFee: Number(pricing?.handlingFee || 0),
    tax: Number(pricing?.gst || pricing?.tax || 0),
    gst: Number(pricing?.gst || pricing?.tax || 0),
    discount: Number(pricing?.discount || discount) || 0,
    couponCode: appliedCouponCode,
    total: Number(pricing?.total || subtotal),
    distanceKm: Number(resolvedDistance) || 0,
  };
  if (couponError) result.couponError = couponError;
  return result;
};

const resolveCouponCodeFromRequest = (req) =>
  String(
    req.query?.couponCode ||
      req.body?.couponCode ||
      req.body?.coupon ||
      '',
  ).trim();

const mapCartFromRequest = (req, idQuery) =>
  mapCart(idQuery, {
    userCoords: parseRequestCoords(req),
    couponCode: resolveCouponCodeFromRequest(req),
    userId: req.user?.userId || null,
  });

export const getCart = async (req, res) => {
  const idQuery = resolveId(req);

  if (!idQuery) {
    return res.status(400).json({ success: false, message: 'sessionId or userId is required' });
  }

  const cart = await mapCartFromRequest(req, idQuery);
  return res.json({ success: true, result: cart });
};

export const addToCart = async (req, res) => {

  const idQuery = resolveId(req);
  const productId = stripCompositeProductId(req.body.productId);
  const quantity = Number(req.body.quantity || 1);
  const variantName = String(req.body.variantName || req.body.selectedVariant?.name || '').trim();
  const variantKey = String(
    req.body.variantKey ||
      req.body.selectedVariant?._id ||
      req.body.selectedVariant?.id ||
      '',
  ).trim();
  const variantSku = String(req.body.variantSku || req.body.selectedVariant?.sku || '').trim();
  const unitPrice = Number(req.body.price || req.body.unitPrice || 0);

  if (!idQuery || !productId) {
    return res.status(400).json({ success: false, message: 'sessionId/userId and productId are required' });
  }

  const product = await QuickProduct.findOne({ _id: productId, ...approvedProductFilter }).lean();
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const sellerId = resolveProductSellerId(product);
  if (sellerId) {
    try {
      const seller = await Seller.findById(sellerId)
        .select('_id shopInfo.openingHours')
        .lean();
      assertSellerShopOpen(seller);
    } catch (error) {
      if (error?.code === 'SHOP_CLOSED') {
        return res.status(400).json({
          success: false,
          code: 'SHOP_CLOSED',
          message: error.message,
          openingHours: error.openingHours || '',
        });
      }
      throw error;
    }
  }

  const variantMeta = { variantName, variantKey, variantSku, price: unitPrice };
  const availableStock = resolveVariantStock(product, variantMeta);
  const resolvedUnitPrice = resolveVariantUnitPrice(product, variantMeta);

  const cart = await QuickCart.findOneAndUpdate(
    idQuery,
    { $setOnInsert: buildCartInsertDoc(idQuery) },
    { upsert: true, new: true }
  );

  const itemIndex = findCartItemIndex(cart.items, productId, variantKey, variantName);
  const currentQty = itemIndex >= 0 ? cart.items[itemIndex].quantity : 0;
  const targetQty = currentQty + Math.max(1, quantity);

  if (targetQty > availableStock) {
    return res.status(400).json({
      success: false,
      message: `Only ${availableStock} items are available in stock.`,
    });
  }

  if (itemIndex < 0 && cart.items.length > 0) {
    const existingProductIds = cart.items
      .map((item) => item.productId)
      .filter((id) => mongoose.isValidObjectId(id));
    const existingProducts = existingProductIds.length
      ? await QuickProduct.find({ _id: { $in: existingProductIds } })
          .select('sellerId')
          .lean()
      : [];
    const existingSellerIds = collectSellerIdsFromProducts(existingProducts);
    try {
      assertNoSellerMismatch(existingSellerIds, resolveProductSellerId(product));
    } catch (error) {
      return res.status(400).json({
        success: false,
        code: error.code || SELLER_MISMATCH_CODE,
        message: error.message,
      });
    }
  }

  if (itemIndex >= 0) {
    cart.items[itemIndex].quantity = targetQty;
    cart.items[itemIndex].unitPrice = resolvedUnitPrice;
  } else {
    cart.items.push({
      productId,
      quantity: Math.max(1, quantity),
      variantName,
      variantKey,
      variantSku,
      unitPrice: resolvedUnitPrice,
    });
  }

  await cart.save();

  const result = await mapCartFromRequest(req, idQuery);
  return res.json({ success: true, result });
};

export const updateCartItem = async (req, res) => {

  const idQuery = resolveId(req);
  const productId = stripCompositeProductId(req.body.productId);
  const variantName = String(req.body.variantName || '').trim();
  const variantKey = String(req.body.variantKey || '').trim();
  const { quantity } = req.body;

  if (!idQuery || !productId) {
    return res.status(400).json({ success: false, message: 'sessionId/userId and productId are required' });
  }

  const qty = Number(quantity);
  const cart = await QuickCart.findOne(idQuery);

  if (!cart) {
    return res.status(404).json({ success: false, message: 'Cart not found' });
  }

  const itemIndex = findCartItemIndex(cart.items, productId, variantKey, variantName);
  if (itemIndex < 0) {
    return res.status(404).json({ success: false, message: 'Cart item not found' });
  }

  if (!Number.isFinite(qty) || qty <= 0) {
    cart.items.splice(itemIndex, 1);
  } else {
    const product = await QuickProduct.findOne({ _id: productId, ...approvedProductFilter }).lean();
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    const cartItem = cart.items[itemIndex];
    const variantMeta = {
      variantName: cartItem.variantName || variantName,
      variantKey: cartItem.variantKey || variantKey,
      variantSku: cartItem.variantSku || '',
      price: Number(cartItem.unitPrice || 0),
    };
    const availableStock = resolveVariantStock(product, variantMeta);
    const targetQty = Math.floor(qty);
    if (targetQty > availableStock) {
      return res.status(400).json({
        success: false,
        message: `Only ${availableStock} items are available in stock.`,
      });
    }
    cart.items[itemIndex].quantity = targetQty;
  }

  await cart.save();
  const result = await mapCartFromRequest(req, idQuery);
  return res.json({ success: true, result });
};

export const removeCartItem = async (req, res) => {

  const idQuery = resolveId(req);
  const productId = stripCompositeProductId(req.params.productId);
  const variantKey = String(req.query.variantKey || '').trim();
  const variantName = String(req.query.variantName || '').trim();

  if (!idQuery || !productId) {
    return res.status(400).json({ success: false, message: 'sessionId/userId and productId are required' });
  }

  const cart = await QuickCart.findOne(idQuery);
  if (!cart) {
    return res.status(404).json({ success: false, message: 'Cart not found' });
  }

  cart.items = cart.items.filter((item) => {
    if (String(item.productId) !== String(productId)) return true;
    const matchedIndex = findCartItemIndex([item], productId, variantKey, variantName);
    return matchedIndex < 0;
  });
  await cart.save();

  const result = await mapCartFromRequest(req, idQuery);
  return res.json({ success: true, result });
};

export const clearCart = async (req, res) => {
  try {
    const idQuery = resolveId(req);
    if (!idQuery) {
      return res.status(400).json({ success: false, message: 'sessionId or userId is required' });
    }

    // Upsert without putting `items` in both $set and $setOnInsert (Mongo path conflict).
    const insertDoc = buildCartInsertDoc(idQuery);
    await QuickCart.findOneAndUpdate(
      idQuery,
      {
        $set: { items: [] },
        ...(Object.keys(insertDoc).length ? { $setOnInsert: insertDoc } : {}),
      },
      { upsert: true, new: true },
    );

    return res.json({
      success: true,
      result: {
        items: [],
        subtotal: 0,
        packagingFee: 0,
        deliveryFee: 0,
        platformFee: 0,
        handlingFee: 0,
        tax: 0,
        gst: 0,
        total: 0,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to clear cart',
    });
  }
};

