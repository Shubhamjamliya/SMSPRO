/**
 * One-off: clone existing QC products for the same sellers until ~60 total.
 * Usage: node scripts/clone-qc-products-to-60.js
 */
import 'dotenv/config';
import dns from 'dns';
import mongoose from 'mongoose';
import { QuickProduct } from '../src/modules/quick-commerce/models/product.model.js';

// Windows / corporate DNS often fails querySrv for mongodb+srv — force public resolvers.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const TARGET = 60;
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
const explicitDbName = String(process.env.MONGODB_DB_NAME || '').trim();

if (!mongoUri) {
  console.error('Missing MONGO_URI / MONGODB_URI');
  process.exit(1);
}

const slugify = (value = '') =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

await mongoose.connect(mongoUri, {
  family: 4,
  serverSelectionTimeoutMS: 20000,
  ...(explicitDbName ? { dbName: explicitDbName } : {}),
});

console.log(`Connected DB: ${mongoose.connection.name}`);

try {
  const existing = await QuickProduct.find({}).lean();
  console.log(`Found ${existing.length} existing quick_products`);

  if (!existing.length) {
    console.error('No products to clone.');
    process.exit(1);
  }

  const bySeller = {};
  for (const p of existing) {
    const sid = String(p.sellerId || 'none');
    bySeller[sid] = (bySeller[sid] || 0) + 1;
  }
  console.log('By seller:', bySeller);

  if (existing.length >= TARGET) {
    console.log(`Already have ${existing.length} products (>= ${TARGET}). Nothing to do.`);
    process.exit(0);
  }

  const need = TARGET - existing.length;
  const clones = [];
  const stamp = Date.now().toString(36);

  for (let i = 0; i < need; i++) {
    const source = existing[i % existing.length];
    const copyNum = Math.floor(i / existing.length) + 1;
    const baseName = String(source.name || 'Product').replace(/\s*\(Copy\s*\d+\)\s*$/i, '').trim();
    const name = `${baseName} (Copy ${copyNum}-${i + 1})`;
    const slugBase = slugify(name) || `product-${stamp}-${i + 1}`;
    const slug = `${slugBase}-${stamp}-${i + 1}`;
    const skuBase = String(source.sku || 'SKU').replace(/-C\d+$/i, '');
    const sku = `${skuBase}-C${i + 1}`.slice(0, 64);

    const {
      _id,
      __v,
      createdAt,
      updatedAt,
      ...rest
    } = source;

    const variants = Array.isArray(rest.variants)
      ? rest.variants.map((v) => {
          const { _id: vid, ...vRest } = v || {};
          return {
            ...vRest,
            sku: vRest?.sku ? `${String(vRest.sku).slice(0, 40)}-C${i + 1}` : '',
            stock: Number(vRest?.stock || 0) > 0 ? Number(vRest.stock) : 20,
          };
        })
      : [];

    clones.push({
      ...rest,
      name,
      slug,
      sku,
      variants,
      stock: Number(rest.stock || 0) > 0 ? Number(rest.stock) : 20,
      status: rest.status || 'active',
      approvalStatus: rest.approvalStatus || 'approved',
      isActive: rest.isActive !== false,
      // Keep seller + category containers exactly as source
      sellerId: source.sellerId || null,
      categoryId: source.categoryId,
      subcategoryId: source.subcategoryId || null,
      headerId: source.headerId || null,
      approvedAt: source.approvedAt || new Date(),
    });
  }

  const inserted = await QuickProduct.insertMany(clones, { ordered: false });
  const total = await QuickProduct.countDocuments();
  console.log(`Inserted ${inserted.length} clones. Total products now: ${total}`);
} catch (error) {
  console.error('Clone failed:', error?.message || error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
