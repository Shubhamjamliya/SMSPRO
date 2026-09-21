/**
 * Moves Budget Friendly services out of the general catalogue into their own
 * collection (construction_budget_services).
 *
 * Budget Friendly services were briefly stored in construction_services tagged
 * with `serviceType: 'budget_friendly'`. They now live in a dedicated model. For
 * each tagged service this script:
 *
 *   1. creates a Budget Friendly card from it (name, description, image, duration,
 *      "covers" as features, and the lower end of its budget range as the price),
 *      LINKED back to the original service, and
 *   2. removes the tag, so the original goes back to being an ordinary catalogue
 *      service.
 *
 * Nothing is deleted. Enquiries and projects already raised against the original
 * service keep working, and customers can still enquire through the linked card.
 *
 * Idempotent: a service that already has a card linked to it is not copied again,
 * and once the tag is removed it is not picked up on the next run.
 *
 * Usage:
 *   node scripts/migrate-budget-services-to-own-collection.js --dry-run   # show what would happen
 *   node scripts/migrate-budget-services-to-own-collection.js             # do it
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ConstructionBudgetService } from '../src/modules/construction/models/constructionBudgetService.model.js';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const isDryRun = process.argv.includes('--dry-run');

const performer = {
  userId: null,
  name: 'Budget services migration',
  email: '',
  phone: '',
  role: 'SYSTEM',
  roleName: 'Migration script',
  actionAt: new Date(),
};

async function run() {
  if (!mongoUrl) throw new Error('No MongoDB URI found in environment. Check Backend/.env');
  console.log(`Connecting to: ${mongoUrl.replace(/\/\/.*@/, '//***:***@')}`);
  await mongoose.connect(mongoUrl);
  console.log(`Connected to db=${mongoose.connection.name}`);
  if (isDryRun) console.log('DRY RUN — nothing will be written.\n');

  // Read the raw collection: the field is no longer part of the schema, so the
  // model would not return it.
  const services = mongoose.connection.collection('construction_services');
  const tagged = await services.find({ serviceType: 'budget_friendly' }).toArray();
  console.log(`Found ${tagged.length} service(s) tagged budget_friendly.\n`);

  const stats = { created: 0, alreadyLinked: 0, deletedSkipped: 0, untagged: 0 };

  for (const service of tagged) {
    const label = `"${service.name}"`;

    if (service.isDeleted) {
      // A deleted service has nothing to show or link to — just drop the stale tag.
      console.log(`  - ${label} is deleted: no card, tag removed`);
      stats.deletedSkipped += 1;
    } else {
      const existing = await ConstructionBudgetService.findOne({ catalogueServiceId: service._id }).select('_id').lean();
      if (existing) {
        console.log(`  = ${label} already has a card: not copied again`);
        stats.alreadyLinked += 1;
      } else {
        const min = service.typicalBudget?.min;
        console.log(`  + ${label} -> new card${min != null ? ` (from ₹${Math.round(min)})` : ''}`);
        if (!isDryRun) {
          await ConstructionBudgetService.create({
            name: service.name,
            description: service.description || '',
            image: service.coverImage || '',
            price: min != null ? Math.round(min) : null,
            typicalDurationText: service.typicalDurationText || '',
            features: service.covers || [],
            catalogueServiceId: service._id,
            displayOrder: service.displayOrder || 0,
            status: service.status === 'inactive' ? 'inactive' : 'active',
            createdBy: performer,
            updatedBy: performer,
          });
        }
        stats.created += 1;
      }
    }

    if (!isDryRun) await services.updateOne({ _id: service._id }, { $unset: { serviceType: '' } });
    stats.untagged += 1;
  }

  console.log('\n' + '='.repeat(52));
  console.log(`  Cards created         ${stats.created}`);
  console.log(`  Already had a card    ${stats.alreadyLinked}`);
  console.log(`  Deleted (no card)     ${stats.deletedSkipped}`);
  console.log(`  Tags removed          ${stats.untagged}`);
  console.log('='.repeat(52));

  await mongoose.disconnect();
  console.log('\nDisconnected.');
}

run().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
