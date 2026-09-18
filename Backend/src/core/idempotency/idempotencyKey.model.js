import mongoose from 'mongoose';

/**
 * Idempotency ledger for state-changing HTTP requests.
 *
 * A client sends an `Idempotency-Key` header; the first request executes and its response
 * is stored here, keyed by (key, scope). A retry with the same key replays the stored
 * response instead of re-executing — preventing duplicate orders / duplicate accepts on
 * double-tap or network retry. Records auto-expire after ~24h via a TTL index.
 */
const idempotencyKeySchema = new mongoose.Schema(
  {
    // Client-supplied Idempotency-Key header value.
    key: { type: String, required: true, trim: true },
    // Disambiguates the same key across endpoints/users: "METHOD:path:ownerId".
    scope: { type: String, required: true },
    // sha256 of the request body — detects a key reused with a different payload.
    fingerprint: { type: String, default: '' },
    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress' },
    responseStatus: { type: Number, default: null },
    responseBody: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { minimize: false },
);

// One record per (key, scope); the unique index makes concurrent inserts race to a single winner.
idempotencyKeySchema.index({ key: 1, scope: 1 }, { unique: true });
// TTL: expire ~24h after creation so the ledger self-cleans.
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const IdempotencyKey = mongoose.model(
  'IdempotencyKey',
  idempotencyKeySchema,
  'idempotency_keys',
);
