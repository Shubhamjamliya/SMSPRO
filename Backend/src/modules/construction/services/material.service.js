import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { buildPaginationOptions, buildPaginatedResult } from '../../../utils/helpers.js';
import { ConstructionMaterial } from '../models/constructionMaterial.model.js';
import { MaterialRequest, MATERIAL_REQUEST_STATUSES } from '../models/materialRequest.model.js';
import { notify, notifyAdmins } from './notify.service.js';

const CONSTRUCTION_MODULE = 'construction';
const alive = { isDeleted: { $ne: true } };

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactRegex = (value) => new RegExp(`^${escapeRegex(value)}$`, 'i');
const round2 = (n) => Math.round(n * 100) / 100;
const shortRef = (id) => `#${String(id).slice(-6).toUpperCase()}`;
const customerLink = (id) => `/construction/material-requests/${id}`;
const adminLink = '/admin/construction/material-requests';

/** adminNote is internal — never part of what the customer sees. Adds `quotation.expired` so the app never has to guess a server clock. */
const toCustomerView = (doc) => {
  const { adminNote, ...rest } = doc;
  const quotation = rest.quotation;
  if (quotation) {
    rest.quotation = {
      ...quotation,
      expired: Boolean(quotation.status === 'sent' && quotation.validUntil && new Date(quotation.validUntil) < new Date()),
    };
  }
  return rest;
};

const audit = (entityType, action, extra) => recordAudit({
  module: CONSTRUCTION_MODULE,
  entityType,
  ...extra,
  action,
});

// ---------- Materials (admin) ----------

const assertNoDuplicate = async ({ name, brand, category }, { excludeId } = {}) => {
  const filter = {
    name: exactRegex(name),
    brand: exactRegex(brand || ''),
    category: exactRegex(category),
    ...alive,
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const existing = await ConstructionMaterial.findOne(filter).select('name').lean();
  if (existing) {
    throw new ValidationError(`"${existing.name}" already exists in ${category}${brand ? ` for ${brand}` : ''}`);
  }
};

export const listMaterials = async ({ category, status, search } = {}) => {
  const filter = { ...alive };
  // Query-string values can be objects — only plain strings ever reach the filter.
  if (typeof category === 'string' && category.trim()) filter.category = exactRegex(category.trim());
  if (status === 'active' || status === 'inactive') filter.status = status;
  if (typeof search === 'string' && search.trim()) {
    const term = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [{ name: term }, { brand: term }, { category: term }];
  }
  return ConstructionMaterial
    .find(filter)
    .sort({ category: 1, displayOrder: 1, name: 1 })
    .lean();
};

/** Categories already in use, so the admin form can suggest them instead of spawning "Cement" and "cement". */
export const listMaterialCategories = async () => {
  const categories = await ConstructionMaterial.distinct('category', alive);
  return categories.filter(Boolean).sort((a, b) => a.localeCompare(b));
};

export const createMaterial = async (data, reqUser = null) => {
  await assertNoDuplicate(data);
  const performer = extractPerformer(reqUser);
  const material = await ConstructionMaterial.create({
    ...data,
    createdBy: performer,
    updatedBy: performer,
  });
  await audit('material', 'material.created', {
    entityId: material._id,
    after: { name: material.name, category: material.category, price: material.price },
    performedBy: performer,
  });
  return material.toObject();
};

export const updateMaterial = async (id, data, reqUser = null) => {
  const material = await ConstructionMaterial.findOne({ _id: id, ...alive });
  if (!material) throw new ValidationError('Material not found');

  const next = {
    name: data.name ?? material.name,
    brand: data.brand ?? material.brand,
    category: data.category ?? material.category,
  };
  const identityChanged = ['name', 'brand', 'category']
    .some((key) => next[key].toLowerCase() !== (material[key] || '').toLowerCase());
  if (identityChanged) await assertNoDuplicate(next, { excludeId: id });

  const before = { name: material.name, price: material.price, inStock: material.inStock, status: material.status };
  const performer = extractPerformer(reqUser);
  Object.assign(material, data, { updatedBy: performer });
  await material.save();
  await audit('material', 'material.updated', {
    entityId: material._id,
    before,
    after: { name: material.name, price: material.price, inStock: material.inStock, status: material.status },
    performedBy: performer,
  });
  return material.toObject();
};

export const deleteMaterial = async (id, reqUser = null) => {
  const material = await ConstructionMaterial.findOne({ _id: id, ...alive });
  if (!material) throw new ValidationError('Material not found');
  const performer = extractPerformer(reqUser);
  material.isDeleted = true;
  material.deletedAt = new Date();
  material.deletedBy = performer;
  await material.save();
  await audit('material', 'material.deleted', {
    entityId: material._id,
    before: { name: material.name, category: material.category },
    performedBy: performer,
  });
  return { id: String(id) };
};

// ---------- Materials (customer) ----------

/** What the app browses: active materials only, grouped by category then display order. */
export const listCustomerMaterials = async () => ConstructionMaterial
  .find({ ...alive, status: 'active' })
  .select('name brand category description image price unit minOrderQty inStock specifications displayOrder')
  .sort({ category: 1, displayOrder: 1, name: 1 })
  .lean();

// ---------- Requests ----------

/**
 * A customer asks for a quote on a basket of materials.
 *
 * Prices and names come from the database, never from the request body: the
 * client only says WHICH materials and HOW MANY. Otherwise a tampered request
 * could put a ₹1 price on a lorry-load of steel and have it look genuine in the
 * office's queue.
 */
export const createMaterialRequest = async (customerId, data) => {
  const ids = data.items.map((item) => item.materialId);
  const materials = await ConstructionMaterial
    .find({ _id: { $in: ids }, ...alive, status: 'active' })
    .lean();
  const byId = new Map(materials.map((m) => [String(m._id), m]));

  const items = data.items.map(({ materialId, quantity }) => {
    const material = byId.get(String(materialId));
    if (!material) {
      throw new ValidationError('One of the materials you chose is no longer available. Please refresh and try again.');
    }
    if (!material.inStock) {
      throw new ValidationError(`"${material.name}" is out of stock right now`);
    }
    if (quantity < (material.minOrderQty || 0)) {
      throw new ValidationError(`"${material.name}" needs a minimum quantity of ${material.minOrderQty}`);
    }
    return {
      materialId: material._id,
      name: material.name,
      brand: material.brand || '',
      category: material.category || '',
      unit: material.unit || '',
      price: material.price,
      quantity,
      lineTotal: round2(material.price * quantity),
    };
  });

  const request = await MaterialRequest.create({
    customerId,
    contact: data.contact,
    delivery: data.delivery,
    notes: data.notes,
    items,
    estimatedTotal: round2(items.reduce((sum, line) => sum + line.lineTotal, 0)),
    status: 'new',
  });

  await audit('material_request', 'material_request.created', {
    entityId: request._id,
    after: { items: items.length, estimatedTotal: request.estimatedTotal, city: data.delivery.city },
  });

  notifyAdmins({
    source: 'NEW_LEAD',
    title: 'New material request',
    message: `${data.contact.name} asked for a quote on ${items.length} material${items.length === 1 ? '' : 's'} — ${shortRef(request._id)}, ${data.delivery.city}.`,
    link: adminLink,
    metadata: { materialRequestId: String(request._id) },
  }).catch(() => {});

  return toCustomerView(request.toObject());
};

// ---------- Requests (customer: following a request) ----------

export const listCustomerMaterialRequests = async (customerId) => {
  const docs = await MaterialRequest.find({ customerId }).sort({ createdAt: -1 }).lean();
  return docs.map(toCustomerView);
};

export const getCustomerMaterialRequest = async (customerId, id) => {
  const doc = await MaterialRequest.findOne({ _id: id, customerId }).lean();
  if (!doc) throw new ValidationError('Request not found');
  return toCustomerView(doc);
};

// ---------- Requests (admin) ----------

export const listMaterialRequests = async (query = {}) => {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = {};
  if (MATERIAL_REQUEST_STATUSES.includes(query.status)) filter.status = query.status;

  const [docs, total] = await Promise.all([
    MaterialRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    MaterialRequest.countDocuments(filter),
  ]);
  return buildPaginatedResult({ docs, total, page, limit });
};

/** Counts per status, for the filter tabs on the requests screen. */
export const materialRequestCounts = async () => {
  const rows = await MaterialRequest.aggregate([{ $group: { _id: '$status', total: { $sum: 1 } } }]);
  const counts = Object.fromEntries(MATERIAL_REQUEST_STATUSES.map((s) => [s, 0]));
  rows.forEach((row) => { if (row._id in counts) counts[row._id] = row.total; });
  return counts;
};

/** Edit the office's private note without touching the request's status. */
export const updateMaterialRequestNote = async (id, { adminNote }, reqUser = null) => {
  const request = await MaterialRequest.findById(id);
  if (!request) throw new ValidationError('Request not found');
  const performer = extractPerformer(reqUser);
  request.adminNote = adminNote;
  request.updatedBy = performer;
  await request.save();
  await audit('material_request', 'material_request.note_updated', { entityId: id, performedBy: performer });
  return request.toObject();
};

/**
 * The office reviews a request and sends a price: the item total is always the
 * request's own `estimatedTotal` — never taken from the body — plus transport and
 * any other charges the office sets. Re-sendable from `new`, `quoted` (a revision
 * before the customer has answered) or `rejected` (try again with a new price);
 * refused once the customer has accepted, since that is ready for delivery.
 */
export const sendMaterialQuotation = async (id, data, reqUser = null) => {
  const request = await MaterialRequest.findById(id).lean();
  if (!request) throw new ValidationError('Request not found');
  if (!['new', 'quoted', 'rejected'].includes(request.status)) {
    throw new ValidationError(`A quotation cannot be sent while the request is ${request.status}`);
  }

  const now = new Date();
  const grandTotal = round2(request.estimatedTotal + data.transportCharge + data.otherCharges);
  const performer = extractPerformer(reqUser);

  const updated = await MaterialRequest.findOneAndUpdate(
    { _id: id, status: { $in: ['new', 'quoted', 'rejected'] } },
    {
      $set: {
        quotation: {
          status: 'sent',
          itemsTotal: request.estimatedTotal,
          transportCharge: data.transportCharge,
          otherCharges: data.otherCharges,
          otherChargesNote: data.otherChargesNote,
          grandTotal,
          notes: data.notes,
          validUntil: data.validUntil,
          sentAt: now,
          respondedAt: null,
          responseNote: '',
        },
        status: 'quoted',
        updatedBy: performer,
      },
    },
    { new: true },
  ).lean();
  if (!updated) throw new ValidationError('This request has moved on — refresh and try again');

  notify({
    ownerType: 'USER',
    ownerId: String(updated.customerId),
    source: 'QUOTATION_RECEIVED',
    title: 'Your material quote is ready',
    message: `${shortRef(id)} — ${grandTotal.toLocaleString('en-IN')} including delivery. Review and accept to go ahead.`,
    link: customerLink(id),
    metadata: { materialRequestId: String(id) },
  }).catch(() => {});

  await audit('material_request', 'material_request.quotation_sent', {
    entityId: id,
    after: { grandTotal, transportCharge: data.transportCharge, otherCharges: data.otherCharges },
    performedBy: performer,
  });
  return updated;
};

// ---------- Requests (customer: responding to the quotation) ----------

const respondToQuotation = async (customerId, id, accept, { note = '' } = {}) => {
  const now = new Date();
  const updated = await MaterialRequest.findOneAndUpdate(
    {
      _id: id,
      customerId,
      'quotation.status': 'sent',
      // An offer that lapsed can no longer be accepted; the office has to send it again.
      ...(accept ? { $or: [{ 'quotation.validUntil': null }, { 'quotation.validUntil': { $gt: now } }] } : {}),
    },
    {
      $set: {
        'quotation.status': accept ? 'accepted' : 'rejected',
        'quotation.respondedAt': now,
        'quotation.responseNote': note,
        status: accept ? 'accepted' : 'rejected',
      },
    },
    { new: true },
  ).lean();

  if (!updated) {
    const existing = await MaterialRequest.findOne({ _id: id, customerId }).select('quotation').lean();
    if (!existing) throw new ValidationError('Request not found');
    if (existing.quotation?.status === 'sent') {
      throw new ValidationError('This quotation has expired. Ask our team to send it again.');
    }
    throw new ValidationError(
      existing.quotation?.status === 'accepted' || existing.quotation?.status === 'rejected'
        ? `You have already ${existing.quotation.status === 'accepted' ? 'accepted' : 'declined'} this quotation`
        : 'There is no quotation waiting for your answer',
    );
  }

  notifyAdmins({
    source: 'NEW_LEAD',
    title: accept ? 'Material quotation accepted' : 'Material quotation declined',
    message: accept
      ? `${updated.contact?.name} accepted the quote for ${shortRef(id)} — ${Number(updated.quotation.grandTotal).toLocaleString('en-IN')}. Arrange delivery.`
      : `${updated.contact?.name} declined the quote for ${shortRef(id)}${note ? `: ${note}` : '.'}`,
    link: adminLink,
    metadata: { materialRequestId: String(id) },
  }).catch(() => {});

  await audit('material_request', accept ? 'material_request.quotation_accepted' : 'material_request.quotation_rejected', {
    entityId: id,
    after: { note },
    performedBy: { userId: customerId, role: 'USER', actionAt: now },
  });
  return toCustomerView(updated);
};

export const acceptMaterialQuotation = (customerId, id, body) => respondToQuotation(customerId, id, true, body);
export const rejectMaterialQuotation = (customerId, id, body) => respondToQuotation(customerId, id, false, body);

// ---------- Requests (admin: delivery) ----------

export const dispatchMaterialRequest = async (id, data, reqUser = null) => {
  const performer = extractPerformer(reqUser);
  const now = new Date();
  const updated = await MaterialRequest.findOneAndUpdate(
    { _id: id, status: 'accepted' },
    {
      $set: {
        status: 'dispatched',
        'delivery.dispatchedAt': now,
        'delivery.trackingNote': data.trackingNote,
        updatedBy: performer,
      },
    },
    { new: true },
  ).lean();
  if (!updated) throw new ValidationError('Only an accepted request can be dispatched');

  notify({
    ownerType: 'USER',
    ownerId: String(updated.customerId),
    source: 'MATERIAL_DELIVERY',
    title: 'Your materials are on the way',
    message: `${shortRef(id)} has been dispatched${data.trackingNote ? ` — ${data.trackingNote}` : ''}.`,
    link: customerLink(id),
    metadata: { materialRequestId: String(id) },
  }).catch(() => {});

  await audit('material_request', 'material_request.dispatched', { entityId: id, performedBy: performer });
  return updated;
};

export const deliverMaterialRequest = async (id, data, reqUser = null) => {
  const performer = extractPerformer(reqUser);
  const now = new Date();
  const updated = await MaterialRequest.findOneAndUpdate(
    { _id: id, status: 'dispatched' },
    {
      $set: {
        status: 'delivered',
        'delivery.deliveredAt': now,
        ...(data.trackingNote ? { 'delivery.trackingNote': data.trackingNote } : {}),
        updatedBy: performer,
      },
    },
    { new: true },
  ).lean();
  if (!updated) throw new ValidationError('Only a dispatched request can be marked delivered');

  notify({
    ownerType: 'USER',
    ownerId: String(updated.customerId),
    source: 'MATERIAL_DELIVERY',
    title: 'Your materials have been delivered',
    message: `${shortRef(id)} has been delivered. Thank you for your order.`,
    link: customerLink(id),
    metadata: { materialRequestId: String(id) },
  }).catch(() => {});

  await audit('material_request', 'material_request.delivered', { entityId: id, performedBy: performer });
  return updated;
};

export const cancelMaterialRequest = async (id, { reason }, reqUser = null) => {
  const request = await MaterialRequest.findById(id);
  if (!request) throw new ValidationError('Request not found');
  if (['delivered', 'cancelled'].includes(request.status)) {
    throw new ValidationError(`This request is already ${request.status}`);
  }

  const before = { status: request.status };
  const performer = extractPerformer(reqUser);
  request.status = 'cancelled';
  request.adminNote = [request.adminNote, `Cancelled: ${reason}`].filter(Boolean).join('\n');
  request.updatedBy = performer;
  await request.save();

  notify({
    ownerType: 'USER',
    ownerId: String(request.customerId),
    source: 'MATERIAL_DELIVERY',
    title: 'Your material request was cancelled',
    message: `${shortRef(id)} — ${reason}`,
    link: customerLink(id),
    metadata: { materialRequestId: String(id) },
  }).catch(() => {});

  await audit('material_request', 'material_request.cancelled', {
    entityId: id,
    before,
    after: { status: 'cancelled', reason },
    performedBy: performer,
  });
  return request.toObject();
};
