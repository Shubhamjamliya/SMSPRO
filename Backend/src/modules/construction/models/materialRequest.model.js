import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * MaterialRequest — a customer asking for a quote on a basket of materials.
 *
 * Not an order and not a payment: nothing is charged and no stock is held. The
 * office gets the list, contacts the customer, agrees the final price and
 * delivery, and moves the request along its status.
 *
 * Every line SNAPSHOTS the material's name, brand, unit and price as they were
 * when the request was made. Materials are edited and deleted freely, and a
 * request that silently changed with them would stop being a record of what the
 * customer actually asked for and was shown.
 */
export const MATERIAL_REQUEST_STATUSES = [
  'new',
  'contacted',
  'quoted',
  'fulfilled',
  'cancelled',
];

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
