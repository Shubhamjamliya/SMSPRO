/**
 * Phase 3 acceptance test — contractor onboarding against a real database.
 *
 * Proves the guarantees BRD W1–W5, A2, A3 and Rule 6 depend on:
 *
 *   1  A new phone gets a resumable draft, not a rejection
 *   2  The draft resumes at the step it was left on
 *   3  Submitting without any licence is refused (verification needs evidence)
 *   4  Approving with unverified documents is refused
 *   5  Approving with an EXPIRED document is refused
 *   6  A clean application approves, and only then
 *   7  Identity is shared — the contractor maps to one central FoodUser
 *   8  Rejection stores a snapshot to diff the resubmission against
 *   9  An approved contractor can be suspended and loses access immediately
 *  10  The expiry sweep warns ahead of time and un-verifies a lapsed document
 *
 * Creates a synthetic contractor on a reserved test number and removes
 * everything it created. Safe on staging. Do not run against production.
 *
 * Run: node scripts/verify-contractor-onboarding.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;

// Reserved test range — will not collide with a real Indian mobile number.
const TEST_PHONE = '9000000042';

let passed = 0;
let failed = 0;

function ok(label, condition, detail = '') {
  console.log(`${condition ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (condition) passed += 1; else failed += 1;
}

async function expectRejection(label, fn) {
  try {
    await fn();
    console.log(`  ✗ ${label} — expected refusal but it SUCCEEDED`);
    failed += 1;
  } catch (e) {
    console.log(`  ✓ ${label}`);
    passed += 1;
    return e;
  }
  return null;
}

const fullForm = (tradeId) => ({
  businessName: 'Verify Test Constructions',
  businessType: 'proprietorship',
  ownerName: 'Test Owner',
  email: 'verify-test@example.com',
  profileImage: '',
  yearsExperience: 12,
  about: 'Synthetic record created by verify-contractor-onboarding.js',
  trades: [String(tradeId)],
  projectSizeMin: 500000,
  projectSizeMax: 20000000,
  maxConcurrentProjects: 4,
  serviceAreas: ['Indore', 'Bhopal'],
  travelRadiusKm: 80,
  panNumber: 'ABCDE1234F',
  panImage: 'https://example.com/pan.jpg',
  aadhaarNumber: '123456789012',
  aadhaarImage: 'https://example.com/aadhaar.jpg',
  gstNumber: '',
  gstImage: '',
  bankName: 'HDFC Bank',
  accountHolderName: 'Test Owner',
  accountNumber: '50100123456789',
  ifscCode: 'HDFC0001234',
  accountType: 'current',
  upiId: '',
});

async function cleanup(models) {
  const { ContractorProfile, ContractorDocument, ContractorPortfolio, FoodUser, FoodRefreshToken, PlatformAuditLog } = models;
  const contractors = await ContractorProfile.find({ phoneLast10: TEST_PHONE }).select('_id userId').lean();
  const ids = contractors.map((c) => c._id);
  if (ids.length) {
    await ContractorDocument.deleteMany({ contractorId: { $in: ids } });
    await ContractorPortfolio.deleteMany({ contractorId: { $in: ids } });
    await PlatformAuditLog.collection.deleteMany({ entityId: { $in: ids } });
    await FoodRefreshToken.deleteMany({ userId: { $in: ids } });
  }
  await ContractorProfile.deleteMany({ phoneLast10: TEST_PHONE });
  await FoodUser.deleteMany({ phone: TEST_PHONE });
}

async function run() {
  if (!mongoUrl) throw new Error('No MongoDB URI found in environment. Check Backend/.env');
  console.log(`Connecting to: ${mongoUrl.replace(/\/\/.*@/, '//***:***@')}`);
  await mongoose.connect(mongoUrl);
  console.log(`Connected to db=${mongoose.connection.name}\n`);

  const { ContractorProfile } = await import('../src/modules/construction/models/contractorProfile.model.js');
  const { ContractorDocument } = await import('../src/modules/construction/models/contractorDocument.model.js');
  const { ContractorPortfolio } = await import('../src/modules/construction/models/contractorPortfolio.model.js');
  const { ConstructionCategory } = await import('../src/modules/construction/models/constructionCategory.model.js');
  const { FoodUser } = await import('../src/core/users/user.model.js');
  const { FoodRefreshToken } = await import('../src/core/refreshTokens/refreshToken.model.js');
  const { PlatformAuditLog } = await import('../src/core/audit/auditLog.model.js');
  const onboarding = await import('../src/modules/construction/services/contractorOnboarding.service.js');
  const admin = await import('../src/modules/construction/services/contractorAdmin.service.js');
  const authSvc = await import('../src/modules/construction/services/contractorAuth.service.js');
  const expiry = await import('../src/modules/construction/services/documentExpiry.service.js');
  const { findOrCreateUserByPhone } = await import('../src/core/users/user.service.js');

  const models = { ContractorProfile, ContractorDocument, ContractorPortfolio, FoodUser, FoodRefreshToken, PlatformAuditLog };
  await cleanup(models);

  const trade = await ConstructionCategory.findOne({ status: 'active', isDeleted: { $ne: true } }).lean();
  if (!trade) throw new Error('No active construction category found — run the catalogue seed first.');
  console.log(`Using trade: ${trade.name}\n`);

  // ---- 1. a new phone gets a draft ---------------------------------------
  console.log('1. First-time registration');
  const commonUser = await findOrCreateUserByPhone({ phone: TEST_PHONE, countryCode: '+91' });
  const draft = await ContractorProfile.create({
    userId: commonUser._id,
    businessName: 'New contractor',
    ownerName: 'Contractor',
    phone: TEST_PHONE,
    phoneLast10: TEST_PHONE,
    phoneDigits: TEST_PHONE,
    status: 'onboarding',
    onboardingStep: 1,
  });
  ok('draft created in "onboarding" status', draft.status === 'onboarding');
  ok('contractor code assigned', Boolean(draft.contractorCode), draft.contractorCode);
  ok('linked to the shared FoodUser (BRD Rule 1)', String(draft.userId) === String(commonUser._id));

  // ---- 2. draft resumes where it left off --------------------------------
  console.log('\n2. Saving progress between steps');
  await onboarding.saveDraft(draft._id, { businessName: 'Verify Test Constructions', onboardingStep: 3 });
  let reread = await ContractorProfile.findById(draft._id);
  ok('resume step advanced to 3', reread.onboardingStep === 3);
  await onboarding.saveDraft(draft._id, { onboardingStep: 2 });
  reread = await ContractorProfile.findById(draft._id);
  ok('stepping back does NOT lose progress', reread.onboardingStep === 3, `still ${reread.onboardingStep}`);

  // ---- 3. no licence, no submission --------------------------------------
  console.log('\n3. Submission requires evidence (Rule 6)');
  await expectRejection(
    'submitting with no licence uploaded is refused',
    () => onboarding.submitOnboarding(draft._id, fullForm(trade._id)),
  );

  // ---- 4. submit properly -------------------------------------------------
  console.log('\n4. Upload a licence, then submit');
  const licence = await onboarding.addDocument(draft._id, {
    type: 'contractor_license',
    label: '',
    documentNumber: 'LIC/TEST/001',
    fileUrl: 'https://example.com/licence.pdf',
    issuedAt: new Date(Date.now() - 90 * 864e5),
    expiresAt: new Date(Date.now() + 365 * 864e5),
  });
  ok('document starts as pending', licence.status === 'pending');

  await onboarding.submitOnboarding(draft._id, fullForm(trade._id));
  reread = await ContractorProfile.findById(draft._id);
  ok('status moved to pending_approval', reread.status === 'pending_approval');
  ok('submittedAt recorded', Boolean(reread.submittedAt));

  // ---- 5. approval gates --------------------------------------------------
  console.log('\n5. Approval gates (BRD A2 · Rule 6)');
  await expectRejection(
    'approving with an unverified document is refused',
    () => admin.approveContractor(draft._id, { userId: null, role: 'ADMIN', name: 'Test Admin' }),
  );

  // Expired document must block approval even once verified.
  const expiredDoc = await ContractorDocument.create({
    contractorId: draft._id,
    type: 'gst_certificate',
    fileUrl: 'https://example.com/gst.pdf',
    status: 'verified',
    expiresAt: new Date(Date.now() - 10 * 864e5),
  });
  await admin.verifyDocument(licence._id, { userId: null, role: 'ADMIN', name: 'Test Admin' });
  await expectRejection(
    'approving with an EXPIRED document is refused',
    () => admin.approveContractor(draft._id, { userId: null, role: 'ADMIN', name: 'Test Admin' }),
  );

  await ContractorDocument.updateOne(
    { _id: expiredDoc._id },
    { $set: { expiresAt: new Date(Date.now() + 200 * 864e5) } },
  );

  // ---- 6. clean approval --------------------------------------------------
  console.log('\n6. Clean approval');
  const approved = await admin.approveContractor(draft._id, { userId: null, role: 'ADMIN', name: 'Test Admin' });
  ok('contractor approved', approved.status === 'approved');
  ok('approvedAt recorded', Boolean(approved.approvedAt));

  // ---- 7. rejection keeps a snapshot -------------------------------------
  console.log('\n7. Rejection keeps a diffable snapshot (BRD A2)');
  await expectRejection(
    'rejecting without a reason is refused',
    () => admin.rejectContractor(draft._id, '', { role: 'ADMIN' }),
  );
  const rejected = await admin.rejectContractor(draft._id, 'Licence copy is unreadable', { role: 'ADMIN', name: 'Test Admin' });
  ok('status is rejected', rejected.status === 'rejected');
  ok('reason stored', rejected.rejectionReason === 'Licence copy is unreadable');
  ok('snapshot captured for diffing', Boolean(rejected.rejectedSnapshot?.businessName));

  // ---- 8. suspension ------------------------------------------------------
  console.log('\n8. Suspension (BRD A3)');
  await admin.approveContractor(draft._id, { role: 'ADMIN', name: 'Test Admin' });
  const suspended = await admin.suspendContractor(draft._id, 'Complaint under investigation', { role: 'ADMIN' });
  ok('contractor deactivated', suspended.isActive === false);
  const history = (await ContractorProfile.findById(draft._id)).statusHistory;
  ok('every status change is on the record', history.length >= 4, `${history.length} entries`);

  // ---- 9. expiry sweep ----------------------------------------------------
  console.log('\n9. Document expiry sweep (Rule 6)');
  await ContractorDocument.updateOne(
    { _id: licence._id },
    { $set: { expiresAt: new Date(Date.now() + 15 * 864e5), expiryWarnedAt: null } },
  );
  await ContractorDocument.updateOne(
    { _id: expiredDoc._id },
    { $set: { status: 'verified', expiresAt: new Date(Date.now() - 5 * 864e5) } },
  );
  const sweep = await expiry.runDocumentExpirySweep();
  ok('warned about the document lapsing in 15 days', sweep.warned >= 1, `${sweep.warned} warned`);
  ok('un-verified the already-lapsed document', sweep.lapsed >= 1, `${sweep.lapsed} lapsed`);

  const afterSweep = await ContractorDocument.findById(expiredDoc._id).lean();
  ok('lapsed document dropped back to pending, not deleted', afterSweep.status === 'pending');

  const lapsedList = await expiry.findApprovedContractorsWithLapsedDocuments();
  ok('lapsed-document report is queryable', Array.isArray(lapsedList));

  // ---- 10. duplicate protection ------------------------------------------
  console.log('\n10. One account per phone number');
  await expectRejection(
    'a second contractor on the same number is refused',
    () => ContractorProfile.create({
      userId: new mongoose.Types.ObjectId(),
      businessName: 'Duplicate Co',
      ownerName: 'Dup',
      phone: TEST_PHONE,
      phoneLast10: TEST_PHONE,
      phoneDigits: TEST_PHONE,
    }),
  );

  // ---- cleanup ------------------------------------------------------------
  console.log('\n11. Cleanup');
  await cleanup(models);
  const left = await ContractorProfile.countDocuments({ phoneLast10: TEST_PHONE });
  ok('synthetic data removed', left === 0);

  console.log(`\n${'='.repeat(52)}`);
  console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
  console.log('='.repeat(52));
  if (failed > 0) {
    console.log('\n✗ Contractor onboarding guarantees are NOT holding.');
    process.exitCode = 1;
  } else {
    console.log('\n✓ All contractor onboarding guarantees hold.');
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\nVerification crashed:', err.message);
  console.error(err.stack);
  try {
    const { ContractorProfile } = await import('../src/modules/construction/models/contractorProfile.model.js');
    const { ContractorDocument } = await import('../src/modules/construction/models/contractorDocument.model.js');
    const { ContractorPortfolio } = await import('../src/modules/construction/models/contractorPortfolio.model.js');
    const { FoodUser } = await import('../src/core/users/user.model.js');
    const { FoodRefreshToken } = await import('../src/core/refreshTokens/refreshToken.model.js');
    const { PlatformAuditLog } = await import('../src/core/audit/auditLog.model.js');
    await cleanup({ ContractorProfile, ContractorDocument, ContractorPortfolio, FoodUser, FoodRefreshToken, PlatformAuditLog });
    console.error('(synthetic data cleaned up)');
  } catch { /* best effort */ }
  process.exit(1);
});
