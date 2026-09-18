/**
 * Phase 1 migration — ensure indexes for the real-time order upgrade.
 *
 * Creates (idempotent, non-destructive):
 *   - idempotency_keys: unique {key, scope} + TTL {createdAt} (24h auto-expire)
 *   - counters: relies on the existing unique {model} index (used for per-target event seq)
 *
 * Run:      node scripts/phase1-ensure-order-realtime-indexes.js
 * Rollback: node scripts/phase1-ensure-order-realtime-indexes.js --down
 *           (drops the idempotency_keys collection; event-seq counters live in the shared
 *            `counters` collection and are left in place.)
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { IdempotencyKey } from '../src/core/idempotency/idempotencyKey.model.js';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const isDown = process.argv.includes('--down');

async function run() {
  if (!mongoUrl) throw new Error('No MongoDB URI found in environment. Check Backend/.env');
  console.log(`Connecting to: ${mongoUrl.replace(/\/\/.*@/, '//***:***@')}`);
  await mongoose.connect(mongoUrl);
  console.log('Connected.');

  if (isDown) {
    try {
      await mongoose.connection.db.collection('idempotency_keys').drop();
      console.log('Rolled back: dropped idempotency_keys collection.');
    } catch (e) {
      if (e?.codeName === 'NamespaceNotFound') console.log('idempotency_keys did not exist — nothing to drop.');
      else throw e;
    }
  } else {
    await IdempotencyKey.syncIndexes();
    const indexes = await IdempotencyKey.collection.indexes();
    console.log('idempotency_keys indexes:', indexes.map((i) => i.name).join(', '));
    console.log('Done. (TTL index expireAfterSeconds=86400 on createdAt.)');
  }

  await mongoose.disconnect();
  console.log('Disconnected.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
