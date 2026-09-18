import express from 'express';
import { getSyncState } from '../services/sync.service.js';
import { realtimeRateLimiter } from '../../../../middleware/rateLimit.js';

const router = express.Router();

// GET /food/sync?since_seq=N — active order + missed events + latest_seq for the caller.
// Auth + role are enforced at the mount point (routes/index.js).
// Polled continuously by every active client, so it uses the per-user realtime
// bucket instead of consuming the shared global quota.
router.get('/', realtimeRateLimiter, async (req, res, next) => {
  try {
    const ownerType = String(req.user?.role || '').toUpperCase();
    const ownerId = req.user?.userId;
    const sinceSeq = Math.max(0, parseInt(req.query.since_seq, 10) || 0);
    const data = await getSyncState({ ownerType, ownerId, sinceSeq, role: ownerType });
    return res.status(200).json({ success: true, message: 'Sync state', data });
  } catch (err) {
    next(err);
  }
});

export default router;
