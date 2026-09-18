import crypto from 'crypto';
import { IdempotencyKey } from '../core/idempotency/idempotencyKey.model.js';
import { logger } from '../utils/logger.js';

const HEADER_NAMES = ['idempotency-key', 'x-idempotency-key'];

const readKey = (req) => {
  for (const name of HEADER_NAMES) {
    const value = req.headers?.[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const ownerIdOf = (req) =>
  String(req.user?.userId || req.user?.sub || req.user?.id || req.auth?.sub || 'anon');

/**
 * Idempotency middleware for state-changing endpoints.
 *
 * Behaviour (Phase 1, intentionally non-breaking):
 *  - No `Idempotency-Key` header  -> pass through unchanged (existing clients keep working).
 *  - First request with a key     -> execute; a successful (2xx) response is stored and
 *                                     replayed on any later retry with the same key.
 *  - Retry, original completed     -> replay the stored 2xx response, no re-execution.
 *  - Retry, original in progress   -> 409 (still processing).
 *  - Same key, different body      -> 422 (key reused for a different request).
 *  - Non-2xx first response        -> record dropped so a genuine retry can re-execute.
 *
 * Fails open: any ledger error lets the request proceed rather than blocking it.
 */
export function idempotency() {
  return async function idempotencyMiddleware(req, res, next) {
    const key = readKey(req);
    if (!key) return next();

    const scope = `${req.method}:${req.baseUrl || ''}${req.path}:${ownerIdOf(req)}`;
    const fingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex');

    let record;
    try {
      record = await IdempotencyKey.create({ key, scope, fingerprint, status: 'in_progress' });
    } catch (err) {
      if (err?.code === 11000) {
        // A request with this (key, scope) already exists.
        const existing = await IdempotencyKey.findOne({ key, scope }).lean().catch(() => null);
        if (existing) {
          if (existing.fingerprint && fingerprint && existing.fingerprint !== fingerprint) {
            return res.status(422).json({
              success: false,
              message: 'Idempotency-Key was reused with a different request body.',
              code: 'IDEMPOTENCY_KEY_MISMATCH',
            });
          }
          if (existing.status === 'completed') {
            res.setHeader('Idempotent-Replay', 'true');
            return res.status(existing.responseStatus || 200).json(existing.responseBody);
          }
          return res.status(409).json({
            success: false,
            message: 'A request with this Idempotency-Key is already being processed.',
            code: 'IDEMPOTENCY_IN_PROGRESS',
          });
        }
      }
      logger.warn(`Idempotency middleware error (failing open): ${err?.message || err}`);
      return next();
    }

    // Capture the response so a later retry can replay it.
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const statusCode = res.statusCode || 200;
      if (statusCode >= 200 && statusCode < 300) {
        IdempotencyKey.updateOne(
          { _id: record._id },
          { $set: { status: 'completed', responseStatus: statusCode, responseBody: body } },
        ).catch((e) => logger.warn(`Idempotency persist failed: ${e?.message || e}`));
      } else {
        // Non-success: drop the record so the client can retry cleanly.
        IdempotencyKey.deleteOne({ _id: record._id }).catch(() => {});
      }
      return originalJson(body);
    };

    return next();
  };
}
