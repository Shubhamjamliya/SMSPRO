/**
 * One-shot cleanup: remove legacy QC auto-seed categories & products from MongoDB.
 * Does NOT delete real admin-created categories, seller products with sellerId,
 * or Admin Hub / OTP sellers.
 *
 * Usage: node scripts/cleanup-quick-commerce-seed-data.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'dns';

dotenv.config();

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (_) {
  /* ignore */
}

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  throw new Error('Missing MONGODB_URI');
}

const SEED_CATEGORY_SLUGS = [
  // seed.service.js headers
  'fruits-vegetables',
  'dairy-bread-eggs',
  'cold-drinks-juices',
  'snacks-munchies',
  'bakery-biscuits',
  'instant-frozen-food',
  // sellerCatalog DEFAULT_CATEGORY_TREE
  'catalog',
  'groceries',
  'staples',
  'dairy-breakfast',
  'snacks',
  'fresh',
  'fruits',
  'vegetables',
  'herbs',
  'beverages',
  'soft-drinks',
  'tea-coffee',
  'juices',
  'home-essentials',
  'cleaning',
  'laundry',
  'kitchen-care',
  'personal-care',
  'skin-care',
  'hair-care',
  'daily-hygiene',
];

const SEED_PRODUCT_SLUGS = [
  'fresh-bananas-robusta',
  'farm-fresh-tomato',
  'amul-taaza-toned-milk',
  'country-delight-paneer',
  'coca-cola-soft-drink',
  'tropicana-mixed-fruit-juice',
  'lays-classic-salted-chips',
  'haldirams-aloo-bhujia',
  'britannia-good-day-cashew',
  'harvest-gold-white-bread',
  'mccain-french-fries',
  'itc-yippee-noodles',
];

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const categories = db.collection('quick_categories');
  const products = db.collection('quick_products');

  const seedCats = await categories
    .find({ slug: { $in: SEED_CATEGORY_SLUGS } })
    .project({ _id: 1, slug: 1, name: 1 })
    .toArray();
  const seedCatIds = seedCats.map((c) => c._id);

  const catDelete = seedCatIds.length
    ? await categories.deleteMany({ _id: { $in: seedCatIds } })
    : { deletedCount: 0 };

  const productBySlug = await products.deleteMany({
    slug: { $in: SEED_PRODUCT_SLUGS },
  });

  // Legacy mock products had no seller
  const productNoSeller = await products.deleteMany({
    $or: [{ sellerId: null }, { sellerId: { $exists: false } }],
  });

  // Orphan products still pointing at deleted seed categories
  const productOrphanCats = seedCatIds.length
    ? await products.deleteMany({
        $or: [
          { headerId: { $in: seedCatIds } },
          { categoryId: { $in: seedCatIds } },
          { subcategoryId: { $in: seedCatIds } },
        ],
      })
    : { deletedCount: 0 };

  console.log(
    JSON.stringify(
      {
        seedCategoriesFound: seedCats.map((c) => ({ slug: c.slug, name: c.name })),
        categoriesDeleted: catDelete.deletedCount || 0,
        productsDeletedBySlug: productBySlug.deletedCount || 0,
        productsDeletedNoSeller: productNoSeller.deletedCount || 0,
        productsDeletedOrphanCategory: productOrphanCats.deletedCount || 0,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
