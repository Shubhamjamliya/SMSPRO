/**
 * Normalize stored phones to last-10, unset derived phone fields, and sync indexes.
 *
 * Usage (from Backend/):
 *   node src/modules/food/restaurant/scripts/backfillPrimaryContactUnique.js
 */
import mongoose from 'mongoose';
import { config } from '../../../../config/env.js';
import { FoodRestaurant } from '../models/restaurant.model.js';

const normalizeLast10 = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(-15);
  return digits ? digits.slice(-10) : '';
};

async function main() {
  const uri = config.mongodbUri || process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MongoDB URI missing');
  }

  await mongoose.connect(uri);
  const collection = mongoose.connection.collection('food_restaurants');

  const cursor = FoodRestaurant.find({}).cursor();
  let updated = 0;
  for await (const doc of cursor) {
    const primary = normalizeLast10(doc.primaryContactNumber || doc.ownerPhone);
    const owner = normalizeLast10(doc.ownerPhone || doc.primaryContactNumber);
    const needsUpdate =
      (primary && doc.primaryContactNumber !== primary) ||
      (owner && doc.ownerPhone !== owner) ||
      doc.primaryContactLast10 != null ||
      doc.ownerPhoneLast10 != null ||
      doc.ownerPhoneDigits != null ||
      doc.primaryContactDigits != null;

    if (!needsUpdate) continue;

    if (primary) doc.primaryContactNumber = primary;
    if (owner) doc.ownerPhone = owner;
    await doc.save({ validateBeforeSave: true });
    updated += 1;
  }

  // Remove legacy derived fields from all documents.
  await collection.updateMany(
    {},
    {
      $unset: {
        primaryContactLast10: '',
        primaryContactDigits: '',
        ownerPhoneLast10: '',
        ownerPhoneDigits: '',
      },
    }
  );

  for (const indexName of [
    'restaurantNameNormalized_1_ownerPhoneLast10_1',
    'primaryContactLast10_1',
    'ownerPhone_1', // non-unique legacy; recreated as unique via syncIndexes
  ]) {
    try {
      await collection.dropIndex(indexName);
      console.log(`Dropped index ${indexName}`);
    } catch (err) {
      console.log(`Index drop skipped (${indexName}):`, err?.message || err);
    }
  }

  try {
    await FoodRestaurant.syncIndexes();
    console.log('Synced FoodRestaurant indexes');
  } catch (err) {
    console.error(
      'syncIndexes failed (resolve duplicate phones across primaryContactNumber/ownerPhone first):',
      err?.message || err
    );
  }

  console.log(`Normalized ${updated} restaurants`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
