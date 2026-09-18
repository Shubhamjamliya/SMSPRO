/**
 * Manual one-off migration helper (NOT run on server start).
 * Categories / products / sellers are intentionally excluded —
 * those must be created via admin / seller flows only.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const sourceUri = process.env.SRC_MONGO_URI || process.env.SOURCE_MONGO_URI;
const targetUri = process.env.TGT_MONGO_URI || process.env.TARGET_MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URI;
const replaceExistingCollections =
  String(process.env.REPLACE_EXISTING_COLLECTIONS || '').toLowerCase() === 'true';

if (!sourceUri) {
  throw new Error('Missing SRC_MONGO_URI (or SOURCE_MONGO_URI)');
}

if (!targetUri) {
  throw new Error('Missing target Mongo URI');
}

const COLLECTION_MAPPINGS = [
  // quick_categories / quick_products / sellers intentionally omitted (no auto seed/import)
  { source: 'settings', target: 'quick_settings' },
  { source: 'offersections', target: 'quick_offer_sections' },
  { source: 'offers', target: 'quick_offers' },
  { source: 'coupons', target: 'quick_coupons' },
  { source: 'faqs', target: 'quick_faqs', optional: true },
  { source: 'notifications', target: 'quick_notifications', optional: true },
  { source: 'reviews', target: 'quick_reviews', optional: true },
];

function sanitizeDoc(mapping, doc) {
  return { ...doc };
}

async function copyCollection(sourceDb, targetDb, mapping) {
  const sourceCollections = await sourceDb.listCollections({ name: mapping.source }, { nameOnly: true }).toArray();
  if (sourceCollections.length === 0) {
    if (mapping.optional) {
      return { ...mapping, count: 0, skipped: true };
    }
    throw new Error(`Source collection not found: ${mapping.source}`);
  }

  const sourceDocs = await sourceDb.collection(mapping.source).find({}).toArray();
  const targetCollection = targetDb.collection(mapping.target);

  if (sourceDocs.length === 0) {
    return { ...mapping, count: 0 };
  }

  const docs = sourceDocs.map((doc) => sanitizeDoc(mapping, doc));
  if (replaceExistingCollections) {
    await targetCollection.deleteMany({});
    await targetCollection.insertMany(docs, { ordered: false });
  } else {
    await targetCollection.bulkWrite(
      docs.map((doc) => ({
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
  return { ...mapping, count: docs.length };
}

async function main() {
  const sourceConn = await mongoose.createConnection(sourceUri).asPromise();
  const targetConn = await mongoose.createConnection(targetUri).asPromise();

  try {
    const results = [];
    for (const mapping of COLLECTION_MAPPINGS) {
      const result = await copyCollection(sourceConn.db, targetConn.db, mapping);
      results.push(result);
      const prefix = result.skipped ? 'Skipped' : 'Copied';
      console.log(`${prefix} ${result.count} docs: ${mapping.source} -> ${mapping.target}`);
    }

    console.log('\nImport complete.');
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await sourceConn.close();
    await targetConn.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
