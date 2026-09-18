/**
 * Phase 5 acceptance test — the BRD's core mechanism, end to end.
 *
 * "The customer's money goes in before work starts, so the contractor knows the
 * money is real. But it is released only as each stage is genuinely completed
 * and approved." Everything below tests exactly that:
 *
 *   1  Accepting a quotation creates a project and locks the agreed value
 *   2  Stage amounts reconstruct the agreed value EXACTLY (no rounding drift)
 *   3  Funding holds money without moving it — balance unchanged, locked up
 *   4  Held money is not spendable in any other module
 *   5  A stage cannot be submitted without photographic evidence
 *   6  Stages must be approved in order
 *   7  A stage cannot be submitted if its money is not held
 *   8  Approving releases exactly the stage amount minus retention
 *   9  A double-tapped approval pays ONCE
 *  10  Rejection sends it back and pays nothing
 *  11  Retention is withheld per stage and released only after handover + period
 *  12  Cancelling returns everything still held to the customer
 *  13  held + released + refunded === funded, at every step
 *  14  A supervisor cannot approve when the setting says customer-only
 *
 * Creates synthetic records and removes them. Safe on staging.
 * Run: node scripts/verify-construction-projects.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const CUSTOMER_PHONE = '9000000061';
const CONTRACTOR_PHONE = '9000000062';

let passed = 0;
let failed = 0;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function ok(label, condition, detail = '') {
  console.log(`${condition ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (condition) passed += 1; else failed += 1;
}
function eq(label, actual, expected) {
  ok(label, round2(actual) === round2(expected), `${round2(actual)}${round2(actual) === round2(expected) ? '' : ` (expected ${round2(expected)})`}`);
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
    Quote: (await import('../src/modules/construction/models/quotation.model.js')).Quotation,
    Enquiry: (await import('../src/modules/construction/models/constructionEnquiry.model.js')).ConstructionEnquiry,
    Lead: (await import('../src/modules/construction/models/contractorLead.model.js')).ContractorLead,
    Contractor: (await import('../src/modules/construction/models/contractorProfile.model.js')).ContractorProfile,
    Category: (await import('../src/modules/construction/models/constructionCategory.model.js')).ConstructionCategory,
    Service: (await import('../src/modules/construction/models/constructionService.model.js')).ConstructionService,
    Settings: (await import('../src/modules/construction/models/constructionSettings.model.js')).ConstructionSettings,
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
  const handover = await import('../src/modules/construction/services/handover.service.js');
  const settingsService = await import('../src/modules/construction/services/settings.service.js');
  const { deductWalletBalance } = await import('../src/modules/food/user/services/userWallet.service.js');
  const { getAvailableBalance } = await import('../src/core/wallet/hold.service.js');
  const { findOrCreateUserByPhone } = await import('../src/core/users/user.service.js');

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
      M.Submission.deleteMany({ projectId: { $in: pIds } }),
      M.Stage.deleteMany({ projectId: { $in: pIds } }),
      M.Project.deleteMany({ _id: { $in: pIds } }),
      M.Quote.deleteMany({ $or: [{ enquiryId: { $in: eIds } }, { contractorId: { $in: cIds } }] }),
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

  // ---- setup -------------------------------------------------------------
  const settings = await settingsService.getSettings({ force: true });
  const retentionPct = Number(settings.money?.retentionPercent) || 0;
  console.log(`Retention setting: ${retentionPct}%   Approval mode: ${settings.stages?.stageApprovalMode}\n`);

  const service = await M.Service.findOne({ status: 'active', isDeleted: { $ne: true } }).lean();
  if (!service) throw new Error('No active construction service — run the catalogue seed first.');

  const customer = await findOrCreateUserByPhone({ phone: CUSTOMER_PHONE, countryCode: '+91' });
  const contractorUser = await findOrCreateUserByPhone({ phone: CONTRACTOR_PHONE, countryCode: '+91' });
  const contractor = await M.Contractor.create({
    userId: contractorUser._id,
    businessName: 'Escrow Test Builders',
    ownerName: 'Test Builder',
    phone: CONTRACTOR_PHONE, phoneLast10: CONTRACTOR_PHONE, phoneDigits: CONTRACTOR_PHONE,
    status: 'approved', isActive: true,
    trades: [service.categoryId], serviceAreas: ['Indore'],
    maxConcurrentProjects: 5,
  });

  await M.Wallet.create({ userId: customer._id, balance: 1000000, transactions: [] });

  const enquiry = await M.Enquiry.create({
    customerId: customer._id,
    serviceId: service._id,
    categoryId: service.categoryId,
    site: { city: 'Indore' },
    status: 'quoted',
    statusHistory: [{ status: 'submitted', at: new Date() }],
  });
  await M.Lead.create({
    enquiryId: enquiry._id, contractorId: contractor._id, status: 'accepted',
  });

  // A total that does NOT divide cleanly by the stage percentages, on purpose —
  // this is where naive rounding leaves the stages not summing to the agreed value.
  const quotation = await M.Quote.create({
    enquiryId: enquiry._id,
    contractorId: contractor._id,
    customerId: customer._id,
    title: 'Escrow test quotation',
    sections: [{ name: 'Work', items: [{ description: 'Build', quantity: 1, unit: 'lumpsum', rate: 333333.33 }] }],
    taxMode: 'none',
    exclusions: 'Land cost',
    proposedStages: [
      { name: 'Mobilisation', percentage: 15 },
      { name: 'Foundation', percentage: 30 },
      { name: 'Structure', percentage: 33 },
      { name: 'Finishing', percentage: 22 },
    ],
    status: 'accepted',
    acceptedAt: new Date(),
    validUntil: new Date(Date.now() + 864e5),
  });

  // ---- 1. project creation ------------------------------------------------
  console.log('1. Accepting a quotation creates the project (BRD step 9)');
  const created = await projectService.createProjectFromQuotation(quotation._id);
  ok('project created', Boolean(created.projectNumber), created.projectNumber);
  eq('agreed value locked from the quotation', created.agreedValue, quotation.total);
  ok('starts awaiting funding', created.status === 'awaiting_funding');
  ok('retention snapshotted at creation', created.retentionPercent === retentionPct,
    `${created.retentionPercent}%`);

  const again = await projectService.createProjectFromQuotation(quotation._id);
  ok('creating twice returns the same project', String(again._id) === String(created._id));

  const stages = await M.Stage.find({ projectId: created._id }).sort({ sequence: 1 }).lean();
  ok('four stages built', stages.length === 4);
  eq('stage amounts sum EXACTLY to the agreed value',
    stages.reduce((s, x) => s + x.amount, 0), created.agreedValue);

  // ---- 2. funding ---------------------------------------------------------
  console.log('\n2. Funding holds money without moving it (BRD §13 steps 1–2)');
  const before = await M.Wallet.findOne({ userId: customer._id }).lean();
  await projectService.fundProject(customer._id, created._id, created.agreedValue);
  const afterFund = await M.Wallet.findOne({ userId: customer._id }).lean();

  eq('customer balance UNCHANGED', afterFund.balance, before.balance);
  eq('lockedAmount now holds the project value', afterFund.lockedAmount, created.agreedValue);
  const avail = await getAvailableBalance(customer._id);
  eq('available balance reduced', avail.availableBalance, before.balance - created.agreedValue);

  let project = await M.Project.findById(created._id);
  ok('project is now active', project.status === 'active');

  // The point of a hold is that the held slice becomes untouchable, NOT that the
  // whole wallet freezes. So spend just past the available line — the customer
  // has plenty of balance, but not once the project's money is set aside.
  await expectRejection(
    'spending the whole balance is refused — the held slice is untouchable',
    () => deductWalletBalance(customer._id, before.balance, 'Food order', { orderId: `t1_${Date.now()}` }),
  );
  await expectRejection(
    'spending even ₹1 past the available balance is refused',
    () => deductWalletBalance(customer._id, avail.availableBalance + 1, 'Food order', { orderId: `t2_${Date.now()}` }),
  );
  const afterAttempts = await M.Wallet.findOne({ userId: customer._id }).lean();
  eq('balance untouched by the refused attempts', afterAttempts.balance, before.balance);
  await expectRejection(
    'funding beyond the agreed value is refused',
    () => projectService.fundProject(customer._id, created._id, 1000),
  );

  // ---- 3. submission gates ------------------------------------------------
  console.log('\n3. Evidence and ordering gates (BRD W16, C17)');
  const [s1, s2, s3, s4] = await M.Stage.find({ projectId: created._id }).sort({ sequence: 1 });

  await expectRejection(
    'submitting with no photographs is refused',
    () => stageService.submitStage(contractor._id, s1._id, { photos: [] }),
  );
  await expectRejection(
    'submitting stage 2 before stage 1 is refused',
    () => stageService.submitStage(contractor._id, s2._id, { photos: ['https://example.com/a.jpg'] }),
  );

  await stageService.submitStage(contractor._id, s1._id, {
    notes: 'Site cleared and set out',
    photos: [{ url: 'https://example.com/1.jpg', caption: 'Cleared' }],
  });
  const submitted = await M.Stage.findById(s1._id);
  ok('stage 1 submitted for approval', submitted.status === 'submitted_for_approval');

  // ---- 4. approval releases money ----------------------------------------
  console.log('\n4. Approval releases the payment (BRD §13 steps 4–5)');
  const expectedRetention = round2((s1.amount * retentionPct) / 100);
  const expectedPayout = round2(s1.amount - expectedRetention);

  await stageService.approveStage(s1._id, {
    actorRole: 'customer', actorId: customer._id, via: 'customer',
  });

  const paid = await M.Stage.findById(s1._id);
  ok('stage marked paid', paid.status === 'payment_released');
  eq('released the stage amount minus retention', paid.releasedAmount, expectedPayout);

  eq('retention withheld from THIS stage is recorded on it',
    paid.retainedAmount, expectedRetention);

  const cw = await M.ContractorWallet.findOne({ contractorId: contractor._id }).lean();
  eq('contractor wallet credited', cw?.balance, expectedPayout);

  const afterRelease = await M.Wallet.findOne({ userId: customer._id }).lean();
  eq('customer balance debited by the payout', afterRelease.balance, before.balance - expectedPayout);
  eq('lock reduced by the payout', afterRelease.lockedAmount, created.agreedValue - expectedPayout);

  project = await M.Project.findById(created._id);
  eq('project released total', project.releasedAmount, expectedPayout);
  eq('INVARIANT held = funded − released − refunded',
    project.fundedAmount - project.releasedAmount - project.refundedAmount,
    created.agreedValue - expectedPayout);

  // ---- 5. idempotency -----------------------------------------------------
  console.log('\n5. A double-tapped approval pays ONCE');
  const replay = await stageService.approveStage(s1._id, {
    actorRole: 'customer', actorId: customer._id, via: 'customer',
  });
  ok('second approval reported as already released', replay.alreadyReleased === true);
  const cw2 = await M.ContractorWallet.findOne({ contractorId: contractor._id }).lean();
  eq('contractor wallet UNCHANGED', cw2?.balance, expectedPayout);

  // ---- 6. rejection -------------------------------------------------------
  console.log('\n6. Rejection sends it back and pays nothing (BRD C17)');
  await stageService.submitStage(contractor._id, s2._id, {
    photos: ['https://example.com/2.jpg'], notes: 'Foundation poured',
  });
  await expectRejection(
    'rejecting without a reason is refused',
    () => stageService.rejectStage(s2._id, { actorId: customer._id, reason: '' }),
  );
  await stageService.rejectStage(s2._id, {
    actorId: customer._id, reason: 'Curing not complete — resubmit in a week',
  });
  const rejected = await M.Stage.findById(s2._id);
  ok('stage returned to in_progress', rejected.status === 'in_progress');
  ok('reason recorded for the contractor', Boolean(rejected.rejectionReason));

  const cw3 = await M.ContractorWallet.findOne({ contractorId: contractor._id }).lean();
  eq('no money moved on rejection', cw3?.balance, expectedPayout);

  const attempts = await M.Submission.countDocuments({ stageId: s2._id });
  await stageService.submitStage(contractor._id, s2._id, {
    photos: ['https://example.com/2b.jpg'], notes: 'Cured and ready',
  });
  ok('resubmission creates a NEW attempt, keeping the history',
    (await M.Submission.countDocuments({ stageId: s2._id })) === attempts + 1);

  // ---- 7. finish the remaining stages -------------------------------------
  console.log('\n7. Working through the remaining stages');
  await stageService.approveStage(s2._id, { actorRole: 'customer', actorId: customer._id });
  for (const st of [s3, s4]) {
    await stageService.submitStage(contractor._id, st._id, { photos: ['https://example.com/x.jpg'] });
    await stageService.approveStage(st._id, { actorRole: 'customer', actorId: customer._id });
  }

  project = await M.Project.findById(created._id);
  ok('project moved to handover_pending', project.status === 'handover_pending');

  const totalRetention = round2((created.agreedValue * retentionPct) / 100);
  eq('retention still held after every stage', project.fundedAmount - project.releasedAmount, totalRetention);

  // ---- 8. handover and retention ------------------------------------------
  console.log('\n8. Handover and retention (BRD C23 · §13 step 7)');
  const handoverResult = await handover.confirmHandover(customer._id, created._id, {
    rating: 5, review: 'Excellent work',
  });
  ok('project completed', handoverResult.project.status === 'completed');
  eq('retention still held at handover', handoverResult.retentionHeld, totalRetention);

  const ratedContractor = await M.Contractor.findById(contractor._id).lean();
  ok('rating folded into the contractor score', ratedContractor.rating === 5, `${ratedContractor.rating}`);
  ok('completed project counted', ratedContractor.completedProjects === 1);

  if (totalRetention > 0) {
    await expectRejection(
      'retention cannot be released before the defect period ends',
      () => handover.releaseRetention(created._id),
    );
  }

  await handover.releaseRetention(created._id, { force: true });
  const closed = await M.Project.findById(created._id);
  ok('project closed', closed.status === 'closed');
  eq('everything funded has now been released', closed.releasedAmount, created.agreedValue);

  const finalWallet = await M.Wallet.findOne({ userId: customer._id }).lean();
  eq('customer lock fully cleared', finalWallet.lockedAmount, 0);
  eq('customer paid exactly the agreed value', finalWallet.balance, before.balance - created.agreedValue);

  const finalContractorWallet = await M.ContractorWallet.findOne({ contractorId: contractor._id }).lean();
  eq('contractor received the whole agreed value', finalContractorWallet.balance, created.agreedValue);

  // ---- 9. reconciliation ---------------------------------------------------
  console.log('\n9. Reconciliation against the escrow ledger (BRD §13)');
  const recon = await projectService.reconcileProjectMoney(created._id);
  ok('project money matches the ledger', recon.inSync === true,
    recon.inSync ? '' : JSON.stringify(recon.drift));

  const all = await handover.reconcileAllProjects();
  ok('no drift across all projects', all.drifted.length === 0);

  // ---- 10. cancellation returns held money --------------------------------
  console.log('\n10. Cancelling returns everything still held (BRD Q14)');
  const enquiry2 = await M.Enquiry.create({
    customerId: customer._id, serviceId: service._id, categoryId: service.categoryId,
    site: { city: 'Indore' }, status: 'quoted',
  });
  const quote2 = await M.Quote.create({
    enquiryId: enquiry2._id, contractorId: contractor._id, customerId: customer._id,
    sections: [{ name: 'Work', items: [{ description: 'Build', quantity: 1, unit: 'lumpsum', rate: 100000 }] }],
    taxMode: 'none', exclusions: 'None',
    proposedStages: [{ name: 'A', percentage: 50 }, { name: 'B', percentage: 50 }],
    status: 'accepted', acceptedAt: new Date(),
  });
  const p2 = await projectService.createProjectFromQuotation(quote2._id);
  await projectService.fundProject(customer._id, p2._id, 100000);

  const beforeCancel = await M.Wallet.findOne({ userId: customer._id }).lean();
  eq('locked for the second project', beforeCancel.lockedAmount, 100000);

  await projectService.cancelProject(p2._id, 'Customer changed their mind');
  const afterCancel = await M.Wallet.findOne({ userId: customer._id }).lean();
  eq('lock released back to the customer', afterCancel.lockedAmount, 0);
  eq('balance untouched — nothing was paid out', afterCancel.balance, beforeCancel.balance);

  const cancelled = await M.Project.findById(p2._id);
  ok('project cancelled', cancelled.status === 'cancelled');
  eq('refund recorded', cancelled.refundedAmount, 100000);

  // ---- 11. approval-mode gate ----------------------------------------------
  console.log('\n11. Who may approve (BRD Q13)');
  await M.Settings.updateOne({ key: 'construction' }, { $set: { 'stages.stageApprovalMode': 'customer_only' } });
  settingsService.invalidateSettingsCache();

  const enquiry3 = await M.Enquiry.create({
    customerId: customer._id, serviceId: service._id, categoryId: service.categoryId,
    site: { city: 'Indore' }, status: 'quoted',
  });
  const quote3 = await M.Quote.create({
    enquiryId: enquiry3._id, contractorId: contractor._id, customerId: customer._id,
    sections: [{ name: 'W', items: [{ description: 'Build', quantity: 1, unit: 'lumpsum', rate: 50000 }] }],
    taxMode: 'none', exclusions: 'None',
    proposedStages: [{ name: 'Only', percentage: 100 }],
    status: 'accepted', acceptedAt: new Date(),
  });
  const p3 = await projectService.createProjectFromQuotation(quote3._id);
  await projectService.fundProject(customer._id, p3._id, 50000);
  const p3s1 = await M.Stage.findOne({ projectId: p3._id, sequence: 1 });
  await stageService.submitStage(contractor._id, p3s1._id, { photos: ['https://example.com/z.jpg'] });

  await expectRejection(
    'a supervisor cannot approve when the setting is customer-only',
    () => stageService.approveStage(p3s1._id, { actorRole: 'admin', via: 'supervisor' }),
  );
  await expectRejection(
    'a different customer cannot approve someone else\'s stage',
    () => stageService.approveStage(p3s1._id, {
      actorRole: 'customer', actorId: new mongoose.Types.ObjectId(),
    }),
  );

  await M.Settings.updateOne({ key: 'construction' }, { $set: { 'stages.stageApprovalMode': settings.stages.stageApprovalMode } });
  settingsService.invalidateSettingsCache();

  // ---- cleanup --------------------------------------------------------------
  console.log('\n12. Cleanup');
  await cleanup();
  ok('synthetic data removed', (await M.Project.countDocuments({ customerId: customer._id })) === 0);

  console.log(`\n${'='.repeat(52)}`);
  console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
  console.log('='.repeat(52));
  if (failed > 0) {
    console.log('\n✗ Escrow guarantees are NOT holding. Do not enable funding.');
    process.exitCode = 1;
  } else {
    console.log('\n✓ All project and escrow guarantees hold.');
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\nVerification crashed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
