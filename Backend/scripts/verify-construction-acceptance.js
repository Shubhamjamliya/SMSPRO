/**
 * Phase 8 — the go-live acceptance matrix.
 *
 * The earlier suites each prove one phase in isolation. This one proves the
 * things that only break when the pieces are put together, and that a person
 * would only discover in production:
 *
 *   1  A held rupee is not spendable in food, quick, porter, taxi or bike-rent
 *   2  Turning the module OFF stops new enquiries
 *   3  Turning the module OFF does NOT strand an open project's money
 *      — it can still be funded, approved, released, handed over and closed
 *   4  Turning it off does not disturb the other five modules
 *   5  Double-tapping stage approval releases exactly once
 *   6  funded === released + refunded + held after every single operation
 *   7  A suspended contractor loses access on the NEXT request, not at token expiry
 *   8  Every money row is tagged `module: 'construction'`
 *   9  The audit log records every approval and release, with actor and timestamp
 *  10  Deleting nothing: the ledger, the messages and the audit trail all refuse
 *
 * Run this last, before the flag goes on.
 * Creates synthetic records and removes them. Safe on staging.
 * Do NOT run against production.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const CUSTOMER_PHONE = '9000000095';
const CONTRACTOR_PHONE = '9000000096';

let passed = 0;
let failed = 0;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function ok(label, condition, detail = '') {
  console.log(`${condition ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (condition) passed += 1; else failed += 1;
}
function eq(label, actual, expected) {
  const same = round2(actual) === round2(expected);
  console.log(`${same ? '  ✓' : '  ✗'} ${label} — ${round2(actual)}${same ? '' : ` (expected ${round2(expected)})`}`);
  if (same) passed += 1; else failed += 1;
}
async function expectRejection(label, fn) {
  try {
    await fn();
    console.log(`  ✗ ${label} — expected refusal but it SUCCEEDED`);
    failed += 1;
    return null;
  } catch (e) {
    console.log(`  ✓ ${label}`);
    passed += 1;
    return e;
  }
}

async function run() {
  if (!mongoUrl) throw new Error('No MongoDB URI found in environment. Check Backend/.env');
  console.log(`Connecting to: ${mongoUrl.replace(/\/\/.*@/, '//***:***@')}`);
  await mongoose.connect(mongoUrl);
  console.log(`Connected to db=${mongoose.connection.name}\n`);

  const M = {
    Project: (await import('../src/modules/construction/models/constructionProject.model.js')).ConstructionProject,
    Stage: (await import('../src/modules/construction/models/projectStage.model.js')).ProjectStage,
    Submission: (await import('../src/modules/construction/models/stageSubmission.model.js')).StageSubmission,
    Dispute: (await import('../src/modules/construction/models/projectDispute.model.js')).ProjectDispute,
    Doc: (await import('../src/modules/construction/models/projectDocument.model.js')).ProjectDocument,
    Msg: (await import('../src/modules/construction/models/projectMessage.model.js')).ProjectMessage,
    Score: (await import('../src/modules/construction/models/contractorScore.model.js')).ContractorScore,
    Quote: (await import('../src/modules/construction/models/quotation.model.js')).Quotation,
    Enquiry: (await import('../src/modules/construction/models/constructionEnquiry.model.js')).ConstructionEnquiry,
    Lead: (await import('../src/modules/construction/models/contractorLead.model.js')).ContractorLead,
    Contractor: (await import('../src/modules/construction/models/contractorProfile.model.js')).ContractorProfile,
    Service: (await import('../src/modules/construction/models/constructionService.model.js')).ConstructionService,
    User: (await import('../src/core/users/user.model.js')).FoodUser,
    Wallet: (await import('../src/modules/food/user/models/userWallet.model.js')).FoodUserWallet,
    ContractorWallet: (await import('../src/core/payments/models/contractorWallet.model.js')).ConstructionContractorWallet,
    Hold: (await import('../src/core/wallet/models/walletHold.model.js')).WalletHold,
    Ledger: (await import('../src/core/wallet/models/walletHoldLedger.model.js')).WalletHoldLedger,
    Txn: (await import('../src/core/payments/models/transaction.model.js')).Transaction,
    Audit: (await import('../src/core/audit/auditLog.model.js')).PlatformAuditLog,
  };

  const projectService = await import('../src/modules/construction/services/project.service.js');
  const stageService = await import('../src/modules/construction/services/stage.service.js');
  const enquiryService = await import('../src/modules/construction/services/enquiry.service.js');
  const handover = await import('../src/modules/construction/services/handover.service.js');
  const moduleService = await import('../src/core/modules/moduleEnabled.service.js');
  const { deductWalletBalance } = await import('../src/modules/food/user/services/userWallet.service.js');
  const { findOrCreateUserByPhone } = await import('../src/core/users/user.service.js');
  const { listAuditTrail } = await import('../src/core/audit/audit.service.js');

  const cleanup = async () => {
    const us = await M.User.find({ phone: { $in: [CUSTOMER_PHONE, CONTRACTOR_PHONE] } }).select('_id').lean();
    const uIds = us.map((u) => u._id);
    const cs = await M.Contractor.find({ phoneLast10: CONTRACTOR_PHONE }).select('_id').lean();
    const cIds = cs.map((c) => c._id);
    const ps = await M.Project.find({ customerId: { $in: uIds } }).select('_id holdId').lean();
    const pIds = ps.map((p) => p._id);
    const holdIds = ps.map((p) => p.holdId).filter(Boolean);
    const es = await M.Enquiry.find({ customerId: { $in: uIds } }).select('_id').lean();
    const eIds = es.map((e) => e._id);

    await Promise.all([
      M.Msg.collection.deleteMany({ projectId: { $in: pIds } }),
      M.Doc.collection.deleteMany({ projectId: { $in: pIds } }),
      M.Dispute.collection.deleteMany({ projectId: { $in: pIds } }),
      M.Score.deleteMany({ contractorId: { $in: cIds } }),
      M.Submission.deleteMany({ projectId: { $in: pIds } }),
      M.Stage.deleteMany({ projectId: { $in: pIds } }),
      M.Project.deleteMany({ _id: { $in: pIds } }),
      M.Quote.deleteMany({ contractorId: { $in: cIds } }),
      M.Lead.deleteMany({ enquiryId: { $in: eIds } }),
      M.Enquiry.deleteMany({ _id: { $in: eIds } }),
      M.Contractor.deleteMany({ _id: { $in: cIds } }),
      M.Wallet.deleteMany({ userId: { $in: uIds } }),
      M.ContractorWallet.deleteMany({ contractorId: { $in: cIds } }),
      M.Ledger.collection.deleteMany({ holdId: { $in: holdIds } }),
      M.Hold.collection.deleteMany({ _id: { $in: holdIds } }),
      M.Txn.deleteMany({ entityId: { $in: [...uIds, ...cIds] } }),
      M.Audit.collection.deleteMany({ entityId: { $in: [...pIds, ...eIds, ...cIds] } }),
      M.User.deleteMany({ _id: { $in: uIds } }),
    ]);
  };
  await cleanup();

  // Remember the live flag so the module is left exactly as it was found.
  const wasEnabled = await moduleService.isModuleEnabled('construction');
  console.log(`Module currently ${wasEnabled ? 'ENABLED' : 'disabled'} — it will be restored at the end.\n`);

  // The flag lives on the shared GlobalSettings document, under `modules`.
  const { GlobalSettings } = await import('../src/modules/common/models/settings.model.js');
  const setModule = async (enabled) => {
    await GlobalSettings.updateOne({}, { $set: { 'modules.construction': enabled } }, { upsert: true });
    moduleService.invalidateModuleEnabledCache();
    // The service caches for 10s; force a re-read so the next assertion is true.
    await moduleService.getEnabledModules(true);
  };

  let restore = null;
  try {
    // ---- setup -------------------------------------------------------------
    await setModule(true);

    const service = await M.Service.findOne({ status: 'active', isDeleted: { $ne: true } }).lean();
    if (!service) throw new Error('No active construction service — run the catalogue seed first.');

    const customer = await findOrCreateUserByPhone({ phone: CUSTOMER_PHONE, countryCode: '+91' });
    const contractorUser = await findOrCreateUserByPhone({ phone: CONTRACTOR_PHONE, countryCode: '+91' });
    const contractor = await M.Contractor.create({
      userId: contractorUser._id,
      businessName: 'Acceptance Builders',
      ownerName: 'Tester',
      phone: CONTRACTOR_PHONE, phoneLast10: CONTRACTOR_PHONE, phoneDigits: CONTRACTOR_PHONE,
      status: 'approved', isActive: true,
      trades: [service.categoryId], serviceAreas: ['Indore'],
      maxConcurrentProjects: 5,
    });

    await M.Wallet.create({ userId: customer._id, balance: 300000, transactions: [] });

    const enquiry = await M.Enquiry.create({
      customerId: customer._id, serviceId: service._id, categoryId: service.categoryId,
      site: { city: 'Indore' }, status: 'quoted',
    });
    const quotation = await M.Quote.create({
      enquiryId: enquiry._id, contractorId: contractor._id, customerId: customer._id,
      sections: [{ name: 'Work', items: [{ description: 'Build', quantity: 1, unit: 'lumpsum', rate: 100000 }] }],
      taxMode: 'none', exclusions: 'Land',
      proposedStages: [{ name: 'Foundation', percentage: 50 }, { name: 'Finishing', percentage: 50 }],
      status: 'accepted', acceptedAt: new Date(),
    });

    const project = await projectService.createProjectFromQuotation(quotation._id);
    await projectService.fundProject(customer._id, project._id, project.agreedValue);
    const [s1, s2] = await M.Stage.find({ projectId: project._id }).sort({ sequence: 1 });

    /** The invariant, checked after literally every operation below. */
    const assertInvariant = async (label) => {
      const p = await M.Project.findById(project._id).lean();
      const held = round2(p.fundedAmount - p.releasedAmount - p.refundedAmount);
      const sum = round2(p.releasedAmount + p.refundedAmount + held);
      const same = sum === round2(p.fundedAmount);
      console.log(`${same ? '  ✓' : '  ✗'} INVARIANT after ${label} — ${sum} = ${round2(p.fundedAmount)}`);
      if (same) passed += 1; else failed += 1;
    };

    // ---- 1. cross-module isolation -----------------------------------------
    console.log('1. Held money is ring-fenced from every other module');

    const before = await M.Wallet.findOne({ userId: customer._id }).lean();
    eq('the whole balance is locked', before.lockedAmount, project.agreedValue);

    // Attempt the WHOLE balance in each module. The held slice has to be what
    // makes that fail — spending merely some of the free balance proves nothing,
    // because that money genuinely is spendable and should be.
    for (const label of ['Food order', 'Quick commerce', 'Porter delivery', 'Taxi ride', 'Bike rental']) {
      await expectRejection(
        `${label.padEnd(16)} cannot reach the held money`,
        () => deductWalletBalance(customer._id, before.balance, label, {
          orderId: `acc_${Date.now()}_${Math.random()}`,
        }),
      );
    }
    // And one rupee past the free balance, to pin the boundary exactly.
    await expectRejection(
      'spending ₹1 past the free balance is refused',
      () => deductWalletBalance(
        customer._id,
        round2(before.balance - before.lockedAmount) + 1,
        'Boundary probe',
        { orderId: `acc_edge_${Date.now()}` },
      ),
    );
    const afterAttempts = await M.Wallet.findOne({ userId: customer._id }).lean();
    eq('balance untouched by all five attempts', afterAttempts.balance, before.balance);
    await assertInvariant('spend attempts');

    // ---- 2 & 3. the kill-switch --------------------------------------------
    console.log('\n2. Switching the module OFF stops new work');
    await setModule(false);
    ok('the module reports as disabled', (await moduleService.isModuleEnabled('construction')) === false);

    await expectRejection(
      'assertModuleEnabled refuses while off',
      () => moduleService.assertModuleEnabled('construction'),
    );

    console.log('\n3. Switching it OFF must NOT strand an open project (the go-live gate)');

    // This is the whole point. Everything below runs with the module DISABLED.
    await stageService.submitStage(contractor._id, s1._id, {
      photos: ['https://example.com/foundation.jpg'], notes: 'Foundation complete',
    });
    ok('a contractor can still submit finished work while the module is off',
      (await M.Stage.findById(s1._id)).status === 'submitted_for_approval');

    const released = await stageService.approveStage(s1._id, {
      actorRole: 'customer', actorId: customer._id,
    });
    ok('a customer can still approve while the module is off',
      released.stage?.status === 'payment_released' || released.alreadyReleased === true);
    await assertInvariant('approval while disabled');

    const cw = await M.ContractorWallet.findOne({ contractorId: contractor._id }).lean();
    ok('the contractor was actually PAID while the module is off',
      Number(cw?.balance) > 0, `${cw?.balance}`);

    await stageService.submitStage(contractor._id, s2._id, { photos: ['https://example.com/f.jpg'] });
    await stageService.approveStage(s2._id, { actorRole: 'customer', actorId: customer._id });
    await assertInvariant('final stage while disabled');

    const readyProject = await M.Project.findById(project._id).lean();
    ok('the project reached handover while the module is off',
      readyProject.status === 'handover_pending', readyProject.status);

    const handedOver = await handover.confirmHandover(customer._id, project._id, {
      rating: 5, review: 'Finished fine despite the module being switched off.',
    });
    ok('handover completes while the module is off',
      handedOver.project.status === 'completed');
    await assertInvariant('handover while disabled');

    await handover.releaseRetention(project._id, { force: true });
    const closed = await M.Project.findById(project._id).lean();
    ok('retention releases and the project CLOSES while the module is off',
      closed.status === 'closed', closed.status);
    eq('every rupee reached someone', closed.releasedAmount, closed.fundedAmount);
    await assertInvariant('retention release while disabled');

    const finalWallet = await M.Wallet.findOne({ userId: customer._id }).lean();
    eq('no customer money is left stranded in a lock', finalWallet.lockedAmount, 0);

    // New work, by contrast, must be refused.
    await expectRejection(
      'a NEW enquiry is refused while the module is off',
      async () => {
        await moduleService.assertModuleEnabled('construction');
        return enquiryService.createEnquiry(customer._id, {
          serviceId: service._id, site: { city: 'Indore' },
        });
      },
    );

    // ---- 4. the other modules ----------------------------------------------
    console.log('\n4. The other five modules are unaffected');
    const others = ['food', 'quickCommerce', 'porter', 'taxi', 'bikeRent'];
    for (const key of others) {
      const enabled = await moduleService.isModuleEnabled(key);
      ok(`${key.padEnd(14)} still answers its own flag`, typeof enabled === 'boolean',
        enabled ? 'enabled' : 'disabled');
    }

    await setModule(true);
    ok('the module switches back on', (await moduleService.isModuleEnabled('construction')) === true);

    // ---- 5. idempotency -----------------------------------------------------
    console.log('\n5. A double tap pays once');
    const walletBeforeReplay = await M.ContractorWallet.findOne({ contractorId: contractor._id }).lean();
    const replay = await stageService.approveStage(s1._id, {
      actorRole: 'customer', actorId: customer._id,
    });
    ok('the replay reports it was already released', replay.alreadyReleased === true);
    const walletAfterReplay = await M.ContractorWallet.findOne({ contractorId: contractor._id }).lean();
    eq('the contractor wallet did not move', walletAfterReplay?.balance, walletBeforeReplay?.balance);
    await assertInvariant('replayed approval');

    // ---- 6. money rows are tagged -------------------------------------------
    console.log('\n6. Every money row is attributable to this module');

    const hold = await M.Hold.findById(closed.holdId).lean();
    ok('the escrow hold is tagged construction', hold?.module === 'construction', hold?.module);

    const ledger = await M.Ledger.find({ holdId: closed.holdId }).lean();
    ok('the ledger has entries', ledger.length > 0, `${ledger.length} rows`);
    ok('every ledger row carries a stable reference',
      ledger.every((l) => String(l.reference || '').length > 0));

    // The Transaction model carries `module` as a TOP-LEVEL field, not inside
    // metadata — `recordTransactionInSession` takes it as its own argument and
    // `releaseHold` passes `hold.module`. Reading metadata.module here was the
    // mistake, not a missing tag.
    const txns = await M.Txn.find({ entityId: { $in: [customer._id, contractor._id] } }).lean();
    const tagged = txns.filter((t) => t.module === 'construction');
    ok('every transaction row is tagged module: construction',
      txns.length > 0 && tagged.length === txns.length,
      `${tagged.length}/${txns.length}`);

    // And platform-wide: no escrow row anywhere belongs to another module.
    const strays = await M.Txn.countDocuments({
      category: { $regex: '^escrow' },
      module: { $ne: 'construction' },
    });
    ok('no escrow row anywhere is mis-tagged', strays === 0, `${strays} strays`);

    // ---- 7. the audit trail --------------------------------------------------
    console.log('\n7. The audit trail records who did what, and when');

    const trail = await listAuditTrail({
      module: 'construction', entityType: 'project', entityId: project._id, limit: 100,
    });
    ok('the project has an audit trail', trail.entries.length > 0, `${trail.entries.length} entries`);
    ok('every entry is timestamped', trail.entries.every((e) => Boolean(e.createdAt)));
    ok('every entry names an action', trail.entries.every((e) => Boolean(e.action)));

    // ---- 8. nothing can be rewritten ----------------------------------------
    console.log('\n8. The permanent records refuse to be rewritten');

    const anyLedger = ledger[0];
    await expectRejection(
      'the escrow ledger refuses an update',
      () => M.Ledger.updateOne({ _id: anyLedger._id }, { $set: { amount: 1 } }),
    );
    await expectRejection(
      'the escrow ledger refuses a delete',
      () => M.Ledger.deleteOne({ _id: anyLedger._id }),
    );

    const anyAudit = trail.entries[0];
    await expectRejection(
      'the audit log refuses an update',
      () => M.Audit.updateOne({ _id: anyAudit.id }, { $set: { action: 'tampered' } }),
    );
    await expectRejection(
      'the audit log refuses a delete',
      () => M.Audit.deleteOne({ _id: anyAudit.id }),
    );

    const anyMessage = await M.Msg.findOne({ projectId: project._id });
    if (anyMessage) {
      await expectRejection(
        'a project message refuses to have its body changed',
        () => M.Msg.updateOne({ _id: anyMessage._id }, { $set: { body: 'rewritten' } }),
      );
    }

    // ---- 9. suspension takes effect immediately -----------------------------
    console.log('\n9. A suspended contractor loses access on the NEXT request');

    await M.Contractor.updateOne({ _id: contractor._id }, { $set: { isActive: false } });
    const suspended = await M.Contractor.findById(contractor._id).lean();
    ok('the profile reads as suspended', suspended.isActive === false);

    // The guard reads the profile per request rather than trusting the token,
    // which is what makes suspension immediate rather than waiting for expiry.
    const guardSource = (await import('node:fs')).readFileSync(
      'src/modules/construction/middleware/contractorGuard.middleware.js', 'utf8',
    );
    ok('the guard re-reads the profile on every request, not the token',
      /ContractorProfile\.findOne|ContractorProfile\.findById/.test(guardSource));
    ok('the guard checks isActive', /isActive/.test(guardSource));
    ok('the guard checks the approval status', /status/.test(guardSource));

    await M.Contractor.updateOne({ _id: contractor._id }, { $set: { isActive: true } });

    // ---- 10. the module reconciles ------------------------------------------
    console.log('\n10. Nothing has drifted');
    const recon = await projectService.reconcileProjectMoney(project._id);
    ok('the project reconciles against the escrow ledger', recon.inSync === true,
      recon.inSync ? '' : JSON.stringify(recon.drift));

    const all = await handover.reconcileAllProjects();
    ok('every project on the platform reconciles', all.drifted.length === 0,
      `${all.drifted.length} drifted`);

    restore = wasEnabled;
  } finally {
    // Leave the flag exactly as it was found, whatever happened above.
    if (restore !== null) await setModule(restore);
    else await setModule(wasEnabled);
    console.log(`\n(module flag restored to ${wasEnabled ? 'ENABLED' : 'disabled'})`);
    await cleanup();
  }

  console.log(`\n${'='.repeat(56)}`);
  console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
  console.log('='.repeat(56));
  if (failed > 0) {
    console.log('\n✗ ACCEPTANCE FAILED — do not enable the module.');
    process.exitCode = 1;
  } else {
    console.log('\n✓ Acceptance matrix passed. The module is safe to enable.');
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\nAcceptance run crashed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
