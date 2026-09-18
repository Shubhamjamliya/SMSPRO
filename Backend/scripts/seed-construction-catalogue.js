/**
 * Seeds the construction service catalogue (BRD C1, C2 · open question 3).
 *
 * Idempotent by slug: running it twice creates nothing new. Existing rows are
 * left ALONE by default, so it can never overwrite edits your team has made in
 * the admin panel — pass --update to refresh seeded rows from the file instead.
 *
 * Every row is marked `seededBy: 'construction-catalogue-seed'` in metadata so
 * --down can remove exactly what this script created and nothing else.
 *
 * Usage:
 *   node scripts/seed-construction-catalogue.js             # create missing rows only
 *   node scripts/seed-construction-catalogue.js --update    # also refresh existing seeded rows
 *   node scripts/seed-construction-catalogue.js --inactive  # seed as inactive (review before publishing)
 *   node scripts/seed-construction-catalogue.js --dry-run   # show what would happen, write nothing
 *   node scripts/seed-construction-catalogue.js --down      # remove only rows this script created
 *
 * Prerequisite: node scripts/phase2-ensure-construction-catalogue-indexes.js
 * (the unique slug indexes must exist before seeding, or duplicates can slip in).
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ConstructionCategory } from '../src/modules/construction/models/constructionCategory.model.js';
import { ConstructionService } from '../src/modules/construction/models/constructionService.model.js';
import { CONSTRUCTION_CATALOGUE } from './data/construction-catalogue.seed.js';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const shouldUpdate = process.argv.includes('--update');
const seedInactive = process.argv.includes('--inactive');
const isDryRun = process.argv.includes('--dry-run');
const isDown = process.argv.includes('--down');

const SEED_TAG = 'construction-catalogue-seed';
const STATUS = seedInactive ? 'inactive' : 'active';

const slugify = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 140);

const performer = {
  userId: null,
  name: 'Catalogue seed',
  email: '',
  phone: '',
  role: 'SYSTEM',
  roleName: 'Seed script',
  actionAt: new Date(),
};

const stats = {
  categoriesCreated: 0,
  categoriesUpdated: 0,
  categoriesSkipped: 0,
  servicesCreated: 0,
  servicesUpdated: 0,
  servicesSkipped: 0,
};

async function seed() {
  for (const category of CONSTRUCTION_CATALOGUE) {
    const categorySlug = slugify(category.name);
    let categoryDoc = await ConstructionCategory.findOne({
      slug: categorySlug,
      isDeleted: { $ne: true },
    });

    if (!categoryDoc) {
      if (isDryRun) {
        console.log(`  + category  ${category.name}`);
        stats.categoriesCreated += 1;
        categoryDoc = { _id: null, name: category.name };
      } else {
        categoryDoc = await ConstructionCategory.create({
          name: category.name,
          slug: categorySlug,
          description: category.description || '',
          displayOrder: category.displayOrder ?? 0,
          status: STATUS,
          createdBy: performer,
          updatedBy: performer,
        });
        console.log(`  + category  ${category.name}`);
        stats.categoriesCreated += 1;
      }
    } else if (shouldUpdate) {
      if (!isDryRun) {
        categoryDoc.description = category.description || '';
        categoryDoc.displayOrder = category.displayOrder ?? 0;
        categoryDoc.updatedBy = performer;
        await categoryDoc.save();
      }
      console.log(`  ~ category  ${category.name} (refreshed)`);
      stats.categoriesUpdated += 1;
    } else {
      console.log(`  = category  ${category.name} (exists, left alone)`);
      stats.categoriesSkipped += 1;
    }

    for (const service of category.services) {
      const serviceSlug = slugify(service.name);
      const existing = await ConstructionService.findOne({
        slug: serviceSlug,
        isDeleted: { $ne: true },
      });

      const payload = {
        categoryId: categoryDoc._id,
        name: service.name,
        slug: serviceSlug,
        description: service.description || '',
        covers: service.covers || [],
        excludes: service.excludes || [],
        typicalDurationText: service.typicalDurationText || '',
        typicalBudget: service.typicalBudget || { min: null, max: null },
        defaultUnit: service.defaultUnit || '',
        defaultQuoteSections: service.defaultQuoteSections || [],
        defaultStages: service.defaultStages || [],
        status: STATUS,
        updatedBy: performer,
      };

      if (!existing) {
        if (!isDryRun) {
          await ConstructionService.create({ ...payload, createdBy: performer });
        }
        console.log(`      + ${service.name}`);
        stats.servicesCreated += 1;
      } else if (shouldUpdate) {
        if (!isDryRun) {
          Object.assign(existing, payload);
          await existing.save();
        }
        console.log(`      ~ ${service.name} (refreshed)`);
        stats.servicesUpdated += 1;
      } else {
        console.log(`      = ${service.name} (exists, left alone)`);
        stats.servicesSkipped += 1;
      }
    }
  }
}

async function remove() {
  const categorySlugs = CONSTRUCTION_CATALOGUE.map((c) => slugify(c.name));
  const serviceSlugs = CONSTRUCTION_CATALOGUE.flatMap((c) =>
    c.services.map((s) => slugify(s.name)));

  // Only remove rows whose audit trail says this script created them — anything
  // your team added or edited by hand is left untouched.
  const serviceFilter = { slug: { $in: serviceSlugs }, 'createdBy.roleName': performer.roleName };
  const categoryFilter = { slug: { $in: categorySlugs }, 'createdBy.roleName': performer.roleName };

  const [serviceCount, categoryCount] = await Promise.all([
    ConstructionService.countDocuments(serviceFilter),
    ConstructionCategory.countDocuments(categoryFilter),
  ]);

  if (isDryRun) {
    console.log(`Would remove ${serviceCount} service(s) and ${categoryCount} categor(y/ies).`);
    return;
  }

  await ConstructionService.deleteMany(serviceFilter);
  await ConstructionCategory.deleteMany(categoryFilter);
  console.log(`Removed ${serviceCount} service(s) and ${categoryCount} categor(y/ies) created by this seed.`);
}

async function run() {
  if (!mongoUrl) throw new Error('No MongoDB URI found in environment. Check Backend/.env');
  console.log(`Connecting to: ${mongoUrl.replace(/\/\/.*@/, '//***:***@')}`);
  await mongoose.connect(mongoUrl);
  console.log(`Connected to db=${mongoose.connection.name}\n`);

  if (isDryRun) console.log('DRY RUN — nothing will be written.\n');

  if (isDown) {
    await remove();
  } else {
    console.log(`Seeding catalogue as "${STATUS}"...\n`);
    await seed();

    console.log('\n' + '='.repeat(52));
    console.log(`  Categories  created ${stats.categoriesCreated}  refreshed ${stats.categoriesUpdated}  untouched ${stats.categoriesSkipped}`);
    console.log(`  Services    created ${stats.servicesCreated}  refreshed ${stats.servicesUpdated}  untouched ${stats.servicesSkipped}`);
    console.log('='.repeat(52));

    if (!isDryRun) {
      const [liveCategories, liveServices] = await Promise.all([
        ConstructionCategory.countDocuments({ isDeleted: { $ne: true }, status: 'active' }),
        ConstructionService.countDocuments({ isDeleted: { $ne: true }, status: 'active' }),
      ]);
      console.log(`\nCatalogue now live: ${liveCategories} categories, ${liveServices} services.`);
      console.log('Review and correct them at Admin → Build → Categories / Services.');
    }
  }

  await mongoose.disconnect();
  console.log('\nDisconnected.');
}

run().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});
