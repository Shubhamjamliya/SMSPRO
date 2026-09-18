/**
 * Quick Commerce order-line identity + return-policy snapshot helpers.
 *
 * These helpers are QC-only. Food order items never carry `lineKey`,
 * `headerId` or `returnPolicySnapshot`, so every reader must tolerate their absence.
 */

/** Marks a snapshot that was derived from the global fee-settings fallback, not a header category. */
export const RETURN_POLICY_SOURCES = {
  HEADER: 'header',
  CATEGORY: 'category',
  GLOBAL_FALLBACK: 'global_fallback',
  BACKFILL: 'backfill',
};

const clean = (value) => String(value ?? '').trim();

/**
 * Variant-safe order line identity.
 * Two lines of the same product with different variants must not collapse into one key.
 */
export const buildQuickOrderLineKey = (source = {}) => {
  const base = clean(source.itemId || source.productId);
  if (!base) return '';
  const variant = clean(source.variantId || source.variantKey || source.variantSku || source.variantName);
  return variant ? `${base}::${variant}` : base;
};

/** Legacy (pre-lineKey) identity — still used by historical SellerReturn documents. */
export const buildLegacyQuickItemKey = (item = {}) =>
  clean(item.itemId || item.productId || item.name);

/** Primary key for an order line: persisted `lineKey` when present, otherwise derived. */
export const resolveOrderItemLineKey = (item = {}) =>
  clean(item.lineKey) || buildQuickOrderLineKey(item) || buildLegacyQuickItemKey(item);

/**
 * Every identifier a client or a historical return document may legitimately use
 * to refer to this order line, most specific first.
 */
export const buildOrderItemKeyAliases = (item = {}) => {
  const aliases = [];
  const push = (value) => {
    const normalized = clean(value);
    if (normalized && !aliases.includes(normalized)) aliases.push(normalized);
  };
  push(item.lineKey);
  push(buildQuickOrderLineKey(item));
  push(buildLegacyQuickItemKey(item));
  return aliases;
};

/**
 * Build the QC-specific fields persisted on an order item at creation time.
 * `meta` comes from resolveQuickOrderItemCategoryPolicyMap().
 */
export const buildQuickOrderItemReturnFields = (lineSource = {}, meta = null) => {
  const lineKey = buildQuickOrderLineKey(lineSource);
  const variantId = clean(lineSource.variantId || lineSource.variantKey || lineSource.variantSku);

  const fields = {
    variantId,
    lineKey,
    returnedQuantity: 0,
    itemReturnStatus: 'none',
  };

  if (!meta) return fields;

  return {
    ...fields,
    categoryId: clean(meta.categoryId),
    categoryName: clean(meta.categoryName),
    headerId: clean(meta.headerId),
    headerName: clean(meta.headerName),
    returnPolicySnapshot: meta.returnPolicySnapshot || undefined,
  };
};
