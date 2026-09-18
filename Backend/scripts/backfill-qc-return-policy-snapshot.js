/**
 * Backfill Quick Commerce order-item return policy snapshots + variant-safe line keys.
 *
 * Only touches QC orders (`orderType: 'quick' | 'mixed'`) and only QC line items.
 * Food orders are never read or written.
 *
 * The historical policy of an old order was never recorded, so this script marks
 * everything it writes with `source: 'backfill'` — it is an approximation based on
 * the CURRENT header category configuration, not historical truth. Lines that already
 * carry a snapshot are left untouched, which makes the script idempotent and restartable.
 *
 * Usage:
 *   node scripts/backfill-qc-return-policy-snapshot.js --dry-run
 *   node scripts/backfill-qc-return-policy-snapshot.js --apply
 *   node scripts/backfill-qc-return-policy-snapshot.js --apply --batch=200 --limit=5000
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';
import mongoose from 'mongoose';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  /* ignore */
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { QuickOrder } from '../src/modules/quick-commerce/models/order.model.js';
import { QuickProduct } from '../src/modules/quick-commerce/models/product.model.js';
import {
  getActiveFeeSettings,
  resolveQuickOrderItemCategoryPolicyMap,
} from '../src/modules/quick-commerce/admin/services/billing.service.js';
import { buildQuickOrderLineKey } from '../src/modules/quick-commerce/utils/quickOrderItem.helpers.js';

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const flagValue = (name, fallback) => {
  const match = args.find((arg) => arg.startsWith(`--${name}=`));
  if (!match) return fallback;
  const parsed = Number(match.split('=')[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const APPLY = hasFlag('apply');
const BATCH_SIZE = flagValue('batch', 200);
const LIMIT = flagValue('limit', Infinity);

const isQuickItem = (item) => String(item?.type || '').toLowerCase() === 'quick';
const needsSnapshot = (item) => !(Number(item?.returnPolicySnapshot?.returnWindowDays) > 0);

const log = (message) => console.log(`[backfill-return-policy] ${message}`);

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  log(`connected — mode=${APPLY ? 'APPLY' : 'DRY-RUN'} batch=${BATCH_SIZE}`);

  const feeSettings = await getActiveFeeSettings();

  const filter = {
    orderType: { $in: ['quick', 'mixed'] },
    items: {
      $elemMatch: {
        type: 'quick',
        $or: [
          { returnPolicySnapshot: { $exists: false } },
          { 'returnPolicySnapshot.returnWindowDays': { $lte: 0 } },
          { lineKey: { $in: ['', null] } },
          { lineKey: { $exists: false } },
        ],
      },
    },
  };

  const totalCandidates = await QuickOrder.countDocuments(filter);
  log(`candidate orders: ${totalCandidates}`);

  const cursor = QuickOrder.find(filter)
    .select('_id orderId items')
    .sort({ _id: 1 })
    .lean()
    .cursor();

  const stats = {
    ordersScanned: 0,
    ordersUpdated: 0,
    itemsSnapshotted: 0,
    itemsLineKeyed: 0,
    itemsSkippedNoProduct: 0,
    errors: 0,
  };

  let batch = [];

  const flush = async () => {
    if (!batch.length) return;

    const productIds = new Set();
    batch.forEach((order) => {
      (order.items || []).forEach((item) => {
        if (isQuickItem(item) && item.itemId && mongoose.Types.ObjectId.isValid(item.itemId)) {
          productIds.add(String(item.itemId));
        }
      });
    });

    const products = productIds.size
      ? await QuickProduct.find({ _id: { $in: Array.from(productIds) } })
          .select('_id headerId categoryId')
          .lean()
      : [];
    const policyMap = await resolveQuickOrderItemCategoryPolicyMap(products, feeSettings);

    const operations = [];

    batch.forEach((order) => {
      let orderChanged = false;
      const nextItems = (order.items || []).map((item) => {
        if (!isQuickItem(item)) return item;

        const next = { ...item };

        const lineKey = buildQuickOrderLineKey(item);
        if (lineKey && !String(item.lineKey || '').trim()) {
          next.lineKey = lineKey;
          stats.itemsLineKeyed += 1;
          orderChanged = true;
        }

        if (needsSnapshot(item)) {
          const meta = policyMap.get(String(item.itemId || ''));
          if (!meta) {
            stats.itemsSkippedNoProduct += 1;
          } else {
            next.categoryId = item.categoryId || meta.categoryId;
            next.categoryName = item.categoryName || meta.categoryName;
            next.headerId = item.headerId || meta.headerId;
            next.headerName = item.headerName || meta.headerName;
            next.returnPolicySnapshot = {
              ...meta.returnPolicySnapshot,
              // Never claim this reflects the policy in force when the order was placed.
              source: 'backfill',
              snapshotAt: new Date(),
            };
            stats.itemsSnapshotted += 1;
            orderChanged = true;
          }
        }

        if (next.returnedQuantity === undefined) next.returnedQuantity = 0;
        if (!next.itemReturnStatus) next.itemReturnStatus = 'none';

        return next;
      });

      if (!orderChanged) return;
      stats.ordersUpdated += 1;
      operations.push({
        updateOne: { filter: { _id: order._id }, update: { $set: { items: nextItems } } },
      });
    });

    if (APPLY && operations.length) {
      try {
        await QuickOrder.bulkWrite(operations, { ordered: false });
      } catch (error) {
        stats.errors += 1;
        console.error(`[backfill-return-policy] bulkWrite failed: ${error?.message || error}`);
      }
    }

    log(
      `progress: scanned=${stats.ordersScanned} updated=${stats.ordersUpdated} ` +
        `snapshots=${stats.itemsSnapshotted} lineKeys=${stats.itemsLineKeyed}`,
    );
    batch = [];
  };

  for await (const order of cursor) {
    if (stats.ordersScanned >= LIMIT) break;
    stats.ordersScanned += 1;
    batch.push(order);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  log('---- summary ----');
  log(JSON.stringify({ mode: APPLY ? 'APPLY' : 'DRY-RUN', ...stats }, null, 2));
  if (!APPLY) log('No writes were performed. Re-run with --apply to persist.');

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(`[backfill-return-policy] fatal: ${error?.message || error}`);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
