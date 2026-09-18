/**
 * Platform audit trail — write side.
 *
 * Use `recordAudit` for anything a dispute might later turn on: a quote sent or
 * accepted, a stage approved, money released or blocked, a contractor suspended,
 * an admin stepping into a project. The rule of thumb is that if someone could
 * one day ask "who did this, and when?", it belongs here.
 *
 * Auditing is deliberately NON-BLOCKING: a failed audit write logs loudly but
 * never fails the business operation that triggered it. Losing an audit row is
 * bad; refusing a customer's stage approval because the audit collection had a
 * hiccup is worse. Money movement has its own immutable ledger
 * (`wallet_hold_ledger`) which is *not* best-effort — that one is transactional.
 */
import mongoose from 'mongoose';
import { PlatformAuditLog } from './auditLog.model.js';
import { extractPerformer } from '../utils/performer.js';
import { logger } from '../../utils/logger.js';

const toOptionalObjectId = (value) => {
    const id = String(value || '').trim();
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    return new mongoose.Types.ObjectId(id);
};

/**
 * Record one audit entry.
 *
 * @param {object} params
 * @param {string} params.module      'construction' | 'core' | …
 * @param {string} params.entityType  'project' | 'stage' | 'contractor' | …
 * @param {string} [params.entityId]
 * @param {string} params.action      'stage.approved' | 'payment.released' | …
 * @param {object} [params.before]    small snapshot / diff, not a whole document
 * @param {object} [params.after]
 * @param {object} [params.performedBy] actionPerformer snapshot
 * @param {object} [params.reqUser]   alternative to performedBy — req.user
 * @param {object} [params.meta]
 * @param {import('mongoose').ClientSession} [params.session]
 *        Pass a session ONLY when the audit row must live or die with the
 *        surrounding transaction. Doing so makes the write blocking.
 */
export async function recordAudit({
    module, entityType, entityId = null, action,
    before = null, after = null,
    performedBy = null, reqUser = null,
    meta = null, session = null,
} = {}) {
    const payload = {
        module: String(module || 'core').trim(),
        entityType: String(entityType || '').trim(),
        entityId: toOptionalObjectId(entityId),
        action: String(action || '').trim(),
        before,
        after,
        performedBy: performedBy || (reqUser ? extractPerformer(reqUser) : null),
        meta,
    };

    if (!payload.entityType || !payload.action) {
        logger.warn('recordAudit called without entityType/action — skipped');
        return null;
    }

    try {
        if (session) {
            const [doc] = await PlatformAuditLog.create([payload], { session });
            return doc;
        }
        return await PlatformAuditLog.create(payload);
    } catch (err) {
        if (session) throw err; // transactional callers asked for all-or-nothing
        logger.error(
            `Audit write failed (${payload.module}/${payload.entityType}/${payload.action}): ${err.message}`,
        );
        return null;
    }
}

/**
 * Read the trail for one entity, newest first.
 * This is the query behind "show me everything that happened to this project".
 */
export async function listAuditTrail({
    module, entityType, entityId, action = null,
    page = 1, limit = 50,
} = {}) {
    const filter = {};
    if (module) filter.module = String(module).trim();
    if (entityType) filter.entityType = String(entityType).trim();
    const oid = toOptionalObjectId(entityId);
    if (oid) filter.entityId = oid;
    if (action) filter.action = String(action).trim();

    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200);
    const safePage = Math.max(1, Number(page) || 1);
    const skip = (safePage - 1) * safeLimit;

    const [docs, total] = await Promise.all([
        PlatformAuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
        PlatformAuditLog.countDocuments(filter),
    ]);

    return {
        entries: docs.map((d) => ({
            id: String(d._id),
            module: d.module,
            entityType: d.entityType,
            entityId: d.entityId ? String(d.entityId) : null,
            action: d.action,
            before: d.before ?? null,
            after: d.after ?? null,
            performedBy: d.performedBy || null,
            meta: d.meta ?? null,
            createdAt: d.createdAt,
        })),
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || 1,
    };
}

export { PlatformAuditLog };
