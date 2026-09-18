import mongoose from 'mongoose';
import { FoodCart } from '../models/foodCart.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import {
  applyOtherPriceToFood,
  loadActivePricingRules,
} from '../../admin/services/otherPrice.service.js';
import {
  buildAddonSignature,
  loadApprovedAddonMap,
  normalizeAddonSelectionInput,
  priceAddonSelection,
} from '../../shared/addonPricing.js';
import {
  ABSOLUTE_MAX_ORDER_QUANTITY,
  assertOrderQuantity,
  clampOrderQuantity,
  formatOrderQuantityLimits,
  resolveOrderQuantityRules,
} from '../../shared/orderQuantityRules.js';

const MAX_QTY = ABSOLUTE_MAX_ORDER_QUANTITY;

/** Fields every cart read needs off the menu item, including quantity limits. */
const CART_ITEM_FIELDS =
  'restaurantId name price otherPrice image images foodType isAvailable approvalStatus variants categoryId categoryName minOrderQuantity maxOrderQuantity';

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  const str = String(value);
  return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : null;
};

const normalizeVariantId = (value) => String(value || '').trim();

// Same item + same variant + same add-ons = one line. Different add-ons are a
// different line, so "burger with cheese" never merges into "plain burger".
const lineKey = (itemId, variantId = '', addonSignature = '') =>
  `${String(itemId)}::${normalizeVariantId(variantId)}::${addonSignature}`;

async function getOrCreateCart(userId) {
  const uid = toObjectId(userId);
  if (!uid) throw new ValidationError('Invalid user');

  const cart = await FoodCart.findOneAndUpdate(
    { userId: uid },
    { $setOnInsert: { userId: uid, items: [], restaurantId: null, couponCode: '' } },
    { upsert: true, new: true }
  );
  return cart;
}

async function loadItemDoc(itemId) {
  const oid = toObjectId(itemId);
  if (!oid) throw new ValidationError('Invalid item id');
  const item = await FoodItem.findById(oid)
    .select(CART_ITEM_FIELDS)
    .lean();
  if (!item) throw new NotFoundError('Item not found');
  return item;
}

async function assertRestaurantAccepting(restaurantId) {
  const oid = toObjectId(restaurantId);
  if (!oid) throw new ValidationError('Invalid restaurant');
  const restaurant = await FoodRestaurant.findById(oid)
    .select('restaurantName status isAcceptingOrders isVisibleToUsers')
    .lean();
  if (!restaurant) throw new NotFoundError('Restaurant not found');
  if (String(restaurant.status || '') !== 'approved') {
    throw new ValidationError('Restaurant is not available');
  }
  if (restaurant.isAcceptingOrders === false) {
    throw new ValidationError('Restaurant is not accepting orders right now');
  }
  return restaurant;
}

function resolveVariant(itemDoc, variantId) {
  const vid = normalizeVariantId(variantId);
  if (!vid) {
    return {
      variantId: '',
      variantName: '',
      price: Number(itemDoc.price) || 0,
    };
  }
  const variant = (itemDoc.variants || []).find((v) => String(v._id) === vid);
  if (!variant) {
    throw new ValidationError('Selected option is no longer available');
  }
  return {
    variantId: vid,
    variantName: String(variant.name || ''),
    price: Number(variant.price) || 0,
  };
}

function buildPricingSnapshot(priced, variantId = '') {
  const pricedVariant =
    (priced.variants || []).find(
      (v) => String(v.id || v._id || '') === String(variantId || ''),
    ) || null;
  const basePrice = Number(pricedVariant?.price ?? priced.basePrice ?? priced.price) || 0;
  const otherPrice = Number(pricedVariant?.otherPrice ?? priced.otherPrice) || 0;
  return {
    basePrice,
    otherPrice,
    appliedPricingType: pricedVariant?.appliedPricingType || priced.appliedPricingType || null,
    appliedPricingValue:
      pricedVariant?.appliedPricingValue ?? priced.appliedPricingValue ?? null,
    pricingScope: pricedVariant?.pricingScope || priced.pricingScope || null,
    pricingRule: priced.pricingRule || null,
    pricingCapturedAt: new Date(),
  };
}

function lineHasPricingSnapshot(line) {
  return line && line.basePrice != null && Number.isFinite(Number(line.basePrice));
}

function assertItemSellable(itemDoc) {
  if (itemDoc.approvalStatus !== 'approved') {
    throw new ValidationError('Item is not available');
  }
  if (itemDoc.isAvailable === false) {
    throw new ValidationError('Item is currently unavailable');
  }
}

/**
 * Hydrate cart lines from live menu data. Drops unavailable lines and persists cleanup.
 */
export async function hydrateFoodCart(cartDoc) {
  if (!cartDoc) {
    return {
      items: [],
      restaurantId: null,
      restaurantName: '',
      subtotal: 0,
      itemCount: 0,
      couponCode: '',
      removedUnavailable: [],
      adjustedQuantities: [],
    };
  }

  const rawItems = Array.isArray(cartDoc.items) ? cartDoc.items : [];
  if (!rawItems.length) {
    if (cartDoc.restaurantId) {
      await FoodCart.updateOne(
        { _id: cartDoc._id },
        { $set: { restaurantId: null, items: [], couponCode: '' } }
      );
    }
    return {
      items: [],
      restaurantId: null,
      restaurantName: '',
      subtotal: 0,
      itemCount: 0,
      couponCode: '',
      removedUnavailable: [],
      adjustedQuantities: [],
    };
  }

  const itemIds = [...new Set(rawItems.map((i) => String(i.itemId)).filter(Boolean))]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const docs = itemIds.length
    ? await FoodItem.find({ _id: { $in: itemIds } })
      .select(CART_ITEM_FIELDS)
      .lean()
    : [];
  const docMap = new Map(docs.map((d) => [String(d._id), d]));

  let restaurant = null;
  if (cartDoc.restaurantId) {
    restaurant = await FoodRestaurant.findById(cartDoc.restaurantId)
      .select('restaurantName status isAcceptingOrders')
      .lean();
  }

  const keep = [];
  const removedUnavailable = [];
  const adjustedQuantities = [];
  const removedAddons = [];
  const hydrated = [];
  let pricingDirty = false;

  const pricingRules = await loadActivePricingRules({
    restaurantId: cartDoc.restaurantId || docs[0]?.restaurantId,
    menuItemIds: docs.map((f) => f._id),
  });

  // One lookup for every add-on referenced by the cart. Anything no longer
  // approved/available is absent from the map and gets dropped from its line.
  const addonMap = await loadApprovedAddonMap(
    cartDoc.restaurantId || docs[0]?.restaurantId,
    rawItems.flatMap((line) => (line.addons || []).map((a) => a.addonId)),
  );

  for (const line of rawItems) {
    const doc = docMap.get(String(line.itemId));
    const lineId = String(line._id);
    if (!doc || doc.approvalStatus !== 'approved' || doc.isAvailable === false) {
      removedUnavailable.push({
        id: lineId,
        itemId: String(line.itemId),
        reason: 'unavailable',
      });
      continue;
    }
    if (
      cartDoc.restaurantId &&
      String(doc.restaurantId) !== String(cartDoc.restaurantId)
    ) {
      removedUnavailable.push({
        id: lineId,
        itemId: String(line.itemId),
        reason: 'restaurant_mismatch',
      });
      continue;
    }

    let variant;
    try {
      variant = resolveVariant(doc, line.variantId);
    } catch {
      removedUnavailable.push({
        id: lineId,
        itemId: String(line.itemId),
        reason: 'variant_unavailable',
      });
      continue;
    }

    // Re-apply the item's current limits: the restaurant may have raised the
    // minimum (or added a cap) after this line was put in the cart.
    const quantityRules = resolveOrderQuantityRules(doc);
    const requestedQuantity = Math.min(MAX_QTY, Math.max(1, Number(line.quantity) || 1));
    const quantity = clampOrderQuantity(requestedQuantity, quantityRules);
    if (quantity !== requestedQuantity) {
      adjustedQuantities.push({
        id: lineId,
        itemId: String(line.itemId),
        name: doc.name,
        from: requestedQuantity,
        to: quantity,
        reason: quantity > requestedQuantity ? 'min_order_quantity' : 'max_order_quantity',
        minOrderQuantity: quantityRules.min,
        maxOrderQuantity: quantityRules.hasCap ? quantityRules.max : 0,
      });
    }

    // Add-ons are re-priced from the approved add-on every time the cart is read.
    const pricedAddons = priceAddonSelection(line.addons || [], addonMap);
    if (pricedAddons.removed.length) {
      pricingDirty = true;
      removedAddons.push({
        id: lineId,
        itemId: String(line.itemId),
        name: doc.name,
        count: pricedAddons.removed.length,
      });
    }

    const priced = applyOtherPriceToFood(doc, pricingRules);
    const liveSnapshot = buildPricingSnapshot(priced, variant.variantId);
    const liveBase = liveSnapshot.basePrice;

    // Prefer cart snapshot when base price unchanged so admin markup edits
    // don't silently rewrite an open cart until the line is refreshed.
    let snapshot = liveSnapshot;
    if (lineHasPricingSnapshot(line)) {
      const snappedBase = Number(line.basePrice) || 0;
      if (Math.abs(snappedBase - liveBase) < 0.01) {
        snapshot = {
          basePrice: snappedBase,
          otherPrice: Number(line.otherPrice) || 0,
          appliedPricingType: line.appliedPricingType || null,
          appliedPricingValue:
            line.appliedPricingValue != null ? Number(line.appliedPricingValue) : null,
          pricingScope: line.pricingScope || null,
          pricingRule: line.pricingRule || null,
          pricingCapturedAt: line.pricingCapturedAt || null,
        };
      } else {
        pricingDirty = true;
      }
    } else {
      pricingDirty = true;
    }

    keep.push({
      _id: line._id,
      itemId: line.itemId,
      variantId: variant.variantId,
      quantity,
      addons: pricedAddons.addons.map((addon) => ({
        addonId: addon.addonId,
        quantity: addon.quantity,
      })),
      ...snapshot,
    });

    const image =
      (typeof doc.image === 'string' && doc.image) ||
      (Array.isArray(doc.images) && doc.images[0]) ||
      '';

    const unitPrice = snapshot.basePrice;
    const unitOther = snapshot.otherPrice;
    // An add-on is charged per unit of the parent item.
    const addonUnitTotal = pricedAddons.unitTotal;

    hydrated.push({
      id: lineId,
      lineItemId: lineId,
      itemId: String(doc._id),
      productId: String(doc._id),
      variantId: variant.variantId,
      variantName: variant.variantName,
      variantPrice: unitPrice,
      name: doc.name,
      quantity,
      price: unitPrice,
      basePrice: unitPrice,
      otherPrice: unitOther,
      appliedPricingType: snapshot.appliedPricingType,
      appliedPricingValue: snapshot.appliedPricingValue,
      pricingScope: snapshot.pricingScope,
      pricingRule: snapshot.pricingRule,
      image,
      imageUrl: image,
      isVeg: String(doc.foodType || '') === 'Veg',
      foodType: doc.foodType || 'Non-Veg',
      orderType: 'food',
      type: 'food',
      restaurantId: String(doc.restaurantId),
      restaurant: restaurant?.restaurantName || '',
      sourceId: String(doc.restaurantId),
      sourceName: restaurant?.restaurantName || '',
      categoryId: doc.categoryId ? String(doc.categoryId) : '',
      categoryName: doc.categoryName || '',
      ...formatOrderQuantityLimits(doc),
      addons: pricedAddons.addons,
      addonUnitTotal,
      addonTotal: Number((addonUnitTotal * quantity).toFixed(2)),
      notes: typeof line.notes === 'string' ? line.notes : '',
      lineTotal: Number(((unitPrice + addonUnitTotal) * quantity).toFixed(2)),
      available: true,
    });
  }

  const restaurantOk =
    restaurant &&
    String(restaurant.status || '') === 'approved' &&
    restaurant.isAcceptingOrders !== false;

  if (!restaurantOk && hydrated.length) {
    // Keep items but frontend/checkout will block; mark flag.
  }

  if (
    removedUnavailable.length ||
    adjustedQuantities.length ||
    keep.length !== rawItems.length ||
    pricingDirty
  ) {
    await FoodCart.updateOne(
      { _id: cartDoc._id },
      {
        $set: {
          items: keep,
          restaurantId: keep.length ? cartDoc.restaurantId : null,
          couponCode: keep.length ? cartDoc.couponCode || '' : '',
        },
      }
    );
  }

  const subtotal = hydrated.reduce((sum, i) => sum + Number(i.lineTotal || 0), 0);
  const itemCount = hydrated.reduce((sum, i) => sum + Number(i.quantity || 0), 0);

  return {
    items: hydrated,
    restaurantId: keep.length && cartDoc.restaurantId ? String(cartDoc.restaurantId) : null,
    restaurantName: restaurant?.restaurantName || '',
    restaurantAccepting: Boolean(restaurantOk),
    subtotal,
    itemCount,
    couponCode: cartDoc.couponCode || '',
    removedUnavailable,
    adjustedQuantities,
    removedAddons,
  };
}

export async function getFoodCart(userId) {
  const cart = await getOrCreateCart(userId);
  return hydrateFoodCart(cart);
}

export async function addFoodCartItem(userId, body = {}) {
  const itemId = body.itemId || body.productId || body.foodId;
  const variantId = normalizeVariantId(body.variantId);
  const requestedQty = Math.min(MAX_QTY, Math.max(1, Number(body.quantity) || 1));

  const itemDoc = await loadItemDoc(itemId);
  assertItemSellable(itemDoc);
  // A first add always lands on at least the item's minimum (Rasgulla min 4 →
  // tapping "Add" puts 4 in the cart), and never above its cap.
  const quantityRules = resolveOrderQuantityRules(itemDoc);
  const addQty = clampOrderQuantity(requestedQty, quantityRules);

  // Add-ons must belong to this restaurant and be approved + available. The
  // client sends ids only; anything it can't back up is rejected outright
  // rather than silently dropped, so the customer sees an accurate cart.
  const requestedAddons = normalizeAddonSelectionInput(body.addons) || [];
  if (requestedAddons.length) {
    const addonMap = await loadApprovedAddonMap(
      itemDoc.restaurantId,
      requestedAddons.map((a) => a.addonId),
    );
    const missing = requestedAddons.filter((a) => !addonMap.has(String(a.addonId)));
    if (missing.length) {
      throw new ValidationError('One or more add-ons are no longer available');
    }
  }
  const addonSelection = requestedAddons.map((a) => ({
    addonId: a.addonId,
    quantity: a.quantity,
  }));
  const addonSignature = buildAddonSignature(addonSelection);
  const restaurant = await assertRestaurantAccepting(itemDoc.restaurantId);
  const variant = resolveVariant(itemDoc, variantId);

  const pricingRules = await loadActivePricingRules({
    restaurantId: itemDoc.restaurantId,
    menuItemIds: [itemDoc._id],
  });
  const priced = applyOtherPriceToFood(itemDoc, pricingRules);
  const pricingSnapshot = buildPricingSnapshot(priced, variant.variantId);

  const cart = await getOrCreateCart(userId);

  if (cart.restaurantId && String(cart.restaurantId) !== String(itemDoc.restaurantId)) {
    const existingName = cart.restaurantId
      ? (await FoodRestaurant.findById(cart.restaurantId).select('restaurantName').lean())
          ?.restaurantName
      : '';
    throw new ValidationError(
      `Cart already contains items from "${existingName || 'another restaurant'}". Please clear cart or complete order first.`,
      'RESTAURANT_MISMATCH'
    );
  }

  const existingIdx = (cart.items || []).findIndex(
    (line) =>
      String(line.itemId) === String(itemDoc._id) &&
      normalizeVariantId(line.variantId) === variant.variantId &&
      buildAddonSignature(line.addons) === addonSignature
  );

  let saved;
  if (existingIdx >= 0) {
    // Topping up an existing line: add the requested amount (not the padded
    // minimum, which is already covered) and hold it inside the item's cap.
    const topUp = Math.max(1, requestedQty);
    const nextQty = clampOrderQuantity(
      Math.min(MAX_QTY, Number(cart.items[existingIdx].quantity || 0) + topUp),
      quantityRules,
    );
    // Keep existing pricing snapshot when topping up quantity of the same line.
    const existingLine = cart.items[existingIdx];
    const keepSnapshot = lineHasPricingSnapshot(existingLine)
      ? {
          basePrice: existingLine.basePrice,
          otherPrice: existingLine.otherPrice,
          appliedPricingType: existingLine.appliedPricingType,
          appliedPricingValue: existingLine.appliedPricingValue,
          pricingScope: existingLine.pricingScope,
          pricingRule: existingLine.pricingRule,
          pricingCapturedAt: existingLine.pricingCapturedAt,
        }
      : pricingSnapshot;

    // Target by array index: two lines can share item+variant and differ only by
    // add-ons, which $elemMatch cannot distinguish.
    saved = await FoodCart.findOneAndUpdate(
      { _id: cart._id },
      {
        $set: {
          [`items.${existingIdx}.quantity`]: nextQty,
          [`items.${existingIdx}.basePrice`]: keepSnapshot.basePrice,
          [`items.${existingIdx}.otherPrice`]: keepSnapshot.otherPrice,
          [`items.${existingIdx}.appliedPricingType`]: keepSnapshot.appliedPricingType,
          [`items.${existingIdx}.appliedPricingValue`]: keepSnapshot.appliedPricingValue,
          [`items.${existingIdx}.pricingScope`]: keepSnapshot.pricingScope,
          [`items.${existingIdx}.pricingRule`]: keepSnapshot.pricingRule,
          [`items.${existingIdx}.pricingCapturedAt`]: keepSnapshot.pricingCapturedAt,
          restaurantId: itemDoc.restaurantId,
        },
      },
      { new: true }
    );
  }

  if (!saved) {
    saved = await FoodCart.findOneAndUpdate(
      { _id: cart._id },
      {
        $set: { restaurantId: itemDoc.restaurantId },
        $push: {
          items: {
            itemId: itemDoc._id,
            variantId: variant.variantId,
            quantity: addQty,
            addons: addonSelection,
            ...pricingSnapshot,
          },
        },
      },
      { new: true }
    );
  }

  const result = await hydrateFoodCart(saved || cart);
  return {
    ...result,
    restaurantName: restaurant.restaurantName || result.restaurantName,
  };
}

export async function updateFoodCartItem(userId, lineId, body = {}) {
  const uid = toObjectId(userId);
  const cart = await FoodCart.findOne({ userId: uid });
  if (!cart) throw new NotFoundError('Cart not found');

  const idx = (cart.items || []).findIndex((line) => String(line._id) === String(lineId));
  if (idx < 0) throw new NotFoundError('Cart item not found');

  // Add-ons can be edited on their own ("add cheese to this line"), so quantity
  // is only required when no add-on update was sent.
  const addonUpdate = normalizeAddonSelectionInput(body.addons);
  const quantity = body.quantity === undefined && addonUpdate
    ? Number(cart.items[idx].quantity)
    : Number(body.quantity);
  if (!Number.isFinite(quantity)) throw new ValidationError('Quantity is required');

  if (quantity <= 0) {
    cart.items.splice(idx, 1);
    if (!cart.items.length) {
      cart.restaurantId = null;
      cart.couponCode = '';
    }
    await cart.save();
    return hydrateFoodCart(cart);
  }

  const line = cart.items[idx];
  const itemDoc = await loadItemDoc(line.itemId);
  assertItemSellable(itemDoc);
  await assertRestaurantAccepting(itemDoc.restaurantId);
  resolveVariant(itemDoc, line.variantId);

  // Explicit quantity edits are rejected rather than silently clamped, so the
  // customer sees why (e.g. "minimum order quantity of 4"). Dropping below the
  // minimum is done by removing the line (quantity <= 0, handled above).
  const nextQuantity = assertOrderQuantity(
    Math.floor(quantity),
    resolveOrderQuantityRules(itemDoc),
    itemDoc.name || 'This item',
  );

  if (addonUpdate) {
    const addonMap = await loadApprovedAddonMap(
      itemDoc.restaurantId,
      addonUpdate.map((a) => a.addonId),
    );
    if (addonUpdate.some((a) => !addonMap.has(String(a.addonId)))) {
      throw new ValidationError('One or more add-ons are no longer available');
    }

    // Editing add-ons can make this line identical to another one; merge them so
    // the cart never shows two rows with the same item, variant and add-ons.
    const signature = buildAddonSignature(addonUpdate);
    const twinIdx = cart.items.findIndex(
      (other, otherIdx) =>
        otherIdx !== idx &&
        String(other.itemId) === String(cart.items[idx].itemId) &&
        normalizeVariantId(other.variantId) === normalizeVariantId(cart.items[idx].variantId) &&
        buildAddonSignature(other.addons) === signature,
    );

    cart.items[idx].addons = addonUpdate;
    if (twinIdx >= 0) {
      const merged = Math.min(
        MAX_QTY,
        Number(cart.items[twinIdx].quantity || 0) + Math.min(MAX_QTY, nextQuantity),
      );
      cart.items[twinIdx].quantity = clampOrderQuantity(
        merged,
        resolveOrderQuantityRules(itemDoc),
      );
      cart.items.splice(idx, 1);
      await cart.save();
      return hydrateFoodCart(cart);
    }
  }

  cart.items[idx].quantity = Math.min(MAX_QTY, nextQuantity);
  await cart.save();
  return hydrateFoodCart(cart);
}

export async function removeFoodCartItem(userId, lineId) {
  const uid = toObjectId(userId);
  const updated = await FoodCart.findOneAndUpdate(
    { userId: uid },
    { $pull: { items: { _id: toObjectId(lineId) || lineId } } },
    { new: true }
  );
  if (!updated) throw new NotFoundError('Cart not found');

  if (!updated.items?.length) {
    updated.restaurantId = null;
    updated.couponCode = '';
    await updated.save();
  }
  return hydrateFoodCart(updated);
}

export async function clearFoodCart(userId) {
  const uid = toObjectId(userId);
  await FoodCart.findOneAndUpdate(
    { userId: uid },
    { $set: { items: [], restaurantId: null, couponCode: '' } },
    { upsert: true }
  );
  return {
    items: [],
    restaurantId: null,
    restaurantName: '',
    subtotal: 0,
    itemCount: 0,
    couponCode: '',
    removedUnavailable: [],
    adjustedQuantities: [],
  };
}

export async function setFoodCartCoupon(userId, couponCode = '') {
  const uid = toObjectId(userId);
  const code = String(couponCode || '').trim().toUpperCase();
  await FoodCart.findOneAndUpdate(
    { userId: uid },
    { $set: { couponCode: code } },
    { upsert: true }
  );
  return getFoodCart(userId);
}

/**
 * Build order-service item payload from DB cart (server prices only).
 */
export async function buildOrderItemsFromFoodCart(userId) {
  const cart = await getFoodCart(userId);
  if (!cart.items.length) {
    throw new ValidationError('Your cart is empty');
  }
  if (cart.restaurantAccepting === false) {
    throw new ValidationError('Restaurant is not accepting orders right now');
  }

  const items = cart.items.map((line) => ({
    itemId: line.itemId,
    name: line.name,
    type: 'food',
    sourceId: line.sourceId || line.restaurantId,
    sourceName: line.sourceName || line.restaurant || '',
    variantId: line.variantId || undefined,
    variantName: line.variantName || undefined,
    variantPrice: line.price,
    price: line.price,
    basePrice: line.basePrice ?? line.price,
    otherPrice: line.otherPrice || 0,
    appliedPricingType: line.appliedPricingType || null,
    appliedPricingValue: line.appliedPricingValue ?? null,
    pricingScope: line.pricingScope || null,
    pricingRule: line.pricingRule || null,
    markupAmount: Math.max(
      0,
      Math.round(((Number(line.otherPrice) || 0) - (Number(line.basePrice ?? line.price) || 0)) * 100) /
        100,
    ),
    quantity: line.quantity,
    isVeg: Boolean(line.isVeg),
    image: line.image || '',
    categoryId: line.categoryId || '',
    categoryName: line.categoryName || '',
    notes: line.notes || '',
    // Already priced from the approved add-on during hydration; order creation
    // re-resolves them again from the DB before the money is computed.
    addons: Array.isArray(line.addons)
      ? line.addons.map((a) => ({
          addonId: String(a?.addonId || ''),
          name: String(a?.name || '').trim(),
          quantity: Math.max(1, Number(a?.quantity) || 1),
          price: Math.max(0, Number(a?.price) || 0),
        })).filter((a) => a.name)
      : [],
  }));

  return {
    items,
    restaurantId: cart.restaurantId,
    restaurantName: cart.restaurantName,
    couponCode: cart.couponCode || '',
    subtotal: cart.subtotal,
  };
}
