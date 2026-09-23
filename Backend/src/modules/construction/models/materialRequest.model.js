import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * MaterialRequest — a customer buying materials (cement, sand, steel…) straight
 * from the office, not through a contractor.
 *
 * The life of one request:
 *
 *   1. The customer picks materials and quantities and sends the request with a
 *      delivery address. Nothing is charged yet — this is a basket, not an order.
 *   2. The office reviews it and sends a quotation: the item total (fixed, from
 *      what the customer was shown) plus transport and any other charges, and a
 *      grand total. The request is `quoted`.
 *   3. The customer accepts or rejects the quotation. Accepting moves the request
 *      to `accepted`; the office can now arrange delivery. Rejecting is not a
 *      dead end — the office can send a revised quotation, which puts it back
 *      in `quoted`.
 *   4. Once dispatched and delivered the office marks each step; `delivered` is
 *      the end of the road, `cancelled` can happen from anywhere before that.
 *
 * Every line SNAPSHOTS the material's name, brand, unit and price as they were
 * when the request was made. Materials are edited and deleted freely, and a
 * request that silently changed with them would stop being a record of what the
 * customer actually asked for and was shown.
 */
export const MATERIAL_REQUEST_STATUSES = [
  'new',
  'quoted',
  'accepted',
  'rejected',
  'dispatched',
  'delivered',
  'cancelled',
];

export const MATERIAL_QUOTATION_STATUSES = ['none', 'sent', 'accepted', 'rejected'];

const lineSchema = new mongoose.Schema(
  {
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'ConstructionMaterial', required: true },
    name: { type: String, required: true, trim: true },
    brand: { type: String, default: '', trim: true },
    category: { type: String, default: '', trim: true },
    unit: { type: String, default: '', trim: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

/**
 * The office's offer once the request has been reviewed: the fixed item total
 * plus transport and any other charges, and what the customer answered.
 * Mirrors `PackageRequest.contract` (`packageRequest.model.js`) — same shape of
 * problem, same pattern: a price the office proposes and the customer accepts
 * or rejects, snapshotted rather than recomputed after the fact.
 */
const quotationSchema = new mongoose.Schema(
  {
    status: { type: String, enum: MATERIAL_QUOTATION_STATUSES, default: 'none' },
    /** Snapshot of `estimatedTotal` at the moment the quotation was sent. */
    itemsTotal: { type: Number, default: 0, min: 0 },
    transportCharge: { type: Number, default: 0, min: 0 },
    otherCharges: { type: Number, default: 0, min: 0 },
    otherChargesNote: { type: String, default: '', trim: true, maxlength: 200 },
    grandTotal: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
    validUntil: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
    responseNote: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { _id: false },
);

const materialRequestSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodUser',
      required: true,
      index: true,
    },
    contact: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      phone: { type: String, required: true, trim: true, maxlength: 20 },
    },
    delivery: {
      city: { type: String, required: true, trim: true, maxlength: 120 },
      address: { type: String, default: '', trim: true, maxlength: 400 },
      landmark: { type: String, default: '', trim: true, maxlength: 200 },
      state: { type: String, default: '', trim: true, maxlength: 80 },
      pincode: { type: String, default: '', trim: true, maxlength: 12 },
      /** Set once the office marks the delivery under way / complete. */
      dispatchedAt: { type: Date, default: null },
      deliveredAt: { type: Date, default: null },
      /** Vehicle, driver contact, tracking link… whatever helps the customer, office-entered. */
      trackingNote: { type: String, default: '', trim: true, maxlength: 300 },
    },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },

    items: { type: [lineSchema], validate: [(v) => v.length > 0, 'A request needs at least one material'] },
    /** Sum of the snapshotted lines — an estimate at list price, not a quoted total. */
    estimatedTotal: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: MATERIAL_REQUEST_STATUSES,
      default: 'new',
      index: true,
    },
    quotation: { type: quotationSchema, default: () => ({}) },

    /** Internal only — never returned to the customer. */
    adminNote: { type: String, default: '', trim: true, maxlength: 1000 },
    updatedBy: { type: actionPerformerSchema, default: null },
  },
  {
    collection: 'construction_material_requests',
    timestamps: true,
  },
);

materialRequestSchema.index({ status: 1, createdAt: -1 });

export const MaterialRequest = mongoose.models.MaterialRequest
  || mongoose.model('MaterialRequest', materialRequestSchema, 'construction_material_requests');
