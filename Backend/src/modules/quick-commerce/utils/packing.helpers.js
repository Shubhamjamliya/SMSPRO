/**
 * Packing is a flat fee per product (productId), not per unit and not per variant line.
 * Multiple variants of the same product still contribute packing only once.
 */

export const stripProductId = (value) =>
  String(value ?? '')
    .trim()
    .split('::')[0];

export const resolveItemPackingAmount = (item = {}) =>
  Math.max(
    0,
    Number(
      item?.packingAmount ??
        item?.product?.packingAmount ??
        item?.packing ??
        0,
    ),
  );

/** Sum packing once per unique productId across cart/order lines. */
export const sumUniqueProductPackingFee = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const byProduct = new Map();
  items.forEach((item) => {
    const productId = stripProductId(
      item?.productId || item?.itemId || item?._id || item?.id || '',
    );
    if (!productId) return;

    const packing = resolveItemPackingAmount(item);
    if (!byProduct.has(productId)) {
      byProduct.set(productId, packing);
      return;
    }
    byProduct.set(productId, Math.max(byProduct.get(productId) || 0, packing));
  });

  return [...byProduct.values()].reduce((sum, value) => sum + Number(value || 0), 0);
};

/**
 * Assign packingLineTotal so only the first line of each product carries packing.
 * Quantity never multiplies packing.
 */
export const assignFlatPackingLineTotals = (items = []) => {
  if (!Array.isArray(items)) return [];
  const seen = new Set();

  return items.map((item) => {
    const productId = stripProductId(
      item?.productId || item?.itemId || item?._id || item?.id || '',
    );
    const packingAmount = resolveItemPackingAmount(item);
    const shouldCharge = Boolean(productId) && !seen.has(productId) && packingAmount > 0;
    if (productId && packingAmount > 0) seen.add(productId);

    return {
      ...item,
      packingAmount,
      packingLineTotal: shouldCharge ? packingAmount : 0,
    };
  });
};
