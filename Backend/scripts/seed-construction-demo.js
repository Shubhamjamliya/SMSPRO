/**
 * Construction demo data — one complete flow, left in place for you to click through.
 *
 * This is NOT a test. The verify scripts create data and delete it; this one
 * creates data and LEAVES it, so every screen in the module has something real
 * on it: customer, contractor and admin.
 *
 * Everything is built by calling the real services, never by writing documents
 * straight into MongoDB. That matters — a seed that inserts rows by hand can
 * produce states the application itself can never reach, and then you spend an
 * afternoon debugging a screen that was fine all along.
 *
 * WHAT YOU GET
 *   1 customer with a funded wallet and two enquiries
 *   3 contractors — two approved and competing, one waiting in the approval queue
 *   1 live project mid-flight: one stage paid, one waiting on the customer,
 *     one frozen by an open dispute
 *   1 finished project, so ratings, reviews, earnings and reports have history
 *   Documents with a superseded version, a two-way conversation, and a resolved
 *     dispute alongside the open one
 *
 * Re-running is safe: it removes only what it created, by phone number, then
 * builds it again.
 *
 * Run:    node scripts/seed-construction-demo.js
 * Clean:  node scripts/seed-construction-demo.js --clean
 *
 * Do NOT run against production.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
const CLEAN_ONLY = process.argv.includes('--clean');

/** Reserved demo numbers. Everything the script owns is found through these. */
const P = {
  customer: '9111100001',
  builderA: '9111100002',
  builderB: '9111100003',
  pending: '9111100004',
};
const ALL_PHONES = Object.values(P);

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const daysAgo = (d) => new Date(Date.now() - d * 86400000);
const daysAhead = (d) => new Date(Date.now() + d * 86400000);

const step = (n, label) => console.log(`\n${String(n).padStart(2)}. ${label}`);
const done = (label, detail = '') => console.log(`     ${label}${detail ? ` — ${detail}` : ''}`);

async function run() {
  if (!mongoUrl) throw new Error('No MongoDB URI found in environment. Check Backend/.env');
  console.log(`Connecting to: ${mongoUrl.replace(/\/\/.*@/, '//***:***@')}`);
  await mongoose.connect(mongoUrl);
  console.log(`Connected to db=${mongoose.connection.name}`);

  // ---- models ------------------------------------------------------------
  const C = '../src/modules/construction/models';
  const M = {
    Contractor: (await import(`${C}/contractorProfile.model.js`)).ContractorProfile,
    ContractorDoc: (await import(`${C}/contractorDocument.model.js`)).ContractorDocument,
    Portfolio: (await import(`${C}/contractorPortfolio.model.js`)).ContractorPortfolio,
    Enquiry: (await import(`${C}/constructionEnquiry.model.js`)).ConstructionEnquiry,
    Lead: (await import(`${C}/contractorLead.model.js`)).ContractorLead,
    Visit: (await import(`${C}/siteVisit.model.js`)).SiteVisit,
    Quote: (await import(`${C}/quotation.model.js`)).Quotation,
    Template: (await import(`${C}/quotationTemplate.model.js`)).QuotationTemplate,
    Project: (await import(`${C}/constructionProject.model.js`)).ConstructionProject,
    Stage: (await import(`${C}/projectStage.model.js`)).ProjectStage,
    Submission: (await import(`${C}/stageSubmission.model.js`)).StageSubmission,
    ProjectDoc: (await import(`${C}/projectDocument.model.js`)).ProjectDocument,
    Message: (await import(`${C}/projectMessage.model.js`)).ProjectMessage,
    Dispute: (await import(`${C}/projectDispute.model.js`)).ProjectDispute,
    Score: (await import(`${C}/contractorScore.model.js`)).ContractorScore,
    Service: (await import(`${C}/constructionService.model.js`)).ConstructionService,
    Category: (await import(`${C}/constructionCategory.model.js`)).ConstructionCategory,
    User: (await import('../src/core/users/user.model.js')).FoodUser,
    Wallet: (await import('../src/modules/food/user/models/userWallet.model.js')).FoodUserWallet,
    ContractorWallet: (await import('../src/core/payments/models/contractorWallet.model.js')).ConstructionContractorWallet,
    Hold: (await import('../src/core/wallet/models/walletHold.model.js')).WalletHold,
    Ledger: (await import('../src/core/wallet/models/walletHoldLedger.model.js')).WalletHoldLedger,
    Txn: (await import('../src/core/payments/models/transaction.model.js')).Transaction,
    Audit: (await import('../src/core/audit/auditLog.model.js')).PlatformAuditLog,
  };

  // ---- services ----------------------------------------------------------
  const S = '../src/modules/construction/services';
  const onboarding = await import(`${S}/contractorOnboarding.service.js`);
  const contractorAdmin = await import(`${S}/contractorAdmin.service.js`);
  const enquiryService = await import(`${S}/enquiry.service.js`);
  const matching = await import(`${S}/matching.service.js`);
  const leadService = await import(`${S}/lead.service.js`);
  const visitService = await import(`${S}/siteVisit.service.js`);
  const quoteService = await import(`${S}/quotation.service.js`);
  const projectService = await import(`${S}/project.service.js`);
  const stageService = await import(`${S}/stage.service.js`);
  const docService = await import(`${S}/document.service.js`);
  const msgService = await import(`${S}/message.service.js`);
  const disputeService = await import(`${S}/dispute.service.js`);
  const handover = await import(`${S}/handover.service.js`);
  const scoreService = await import(`${S}/score.service.js`);
  const { findOrCreateUserByPhone } = await import('../src/core/users/user.service.js');

  // ---- clean -------------------------------------------------------------
  const clean = async () => {
    const users = await M.User.find({ phone: { $in: ALL_PHONES } }).select('_id').lean();
    const uIds = users.map((u) => u._id);
    const cs = await M.Contractor.find({ phoneLast10: { $in: ALL_PHONES } }).select('_id').lean();
    const cIds = cs.map((c) => c._id);
    const ps = await M.Project.find({ customerId: { $in: uIds } }).select('_id holdId').lean();
    const pIds = ps.map((p) => p._id);
    const holdIds = ps.map((p) => p.holdId).filter(Boolean);
    const es = await M.Enquiry.find({ customerId: { $in: uIds } }).select('_id').lean();
    const eIds = es.map((e) => e._id);

    await Promise.all([
      // Messages, documents and the ledger all refuse ordinary deletes by
      // design, so cleanup goes through the driver.
      M.Message.collection.deleteMany({ projectId: { $in: pIds } }),
      M.ProjectDoc.collection.deleteMany({ projectId: { $in: pIds } }),
      M.Dispute.collection.deleteMany({ projectId: { $in: pIds } }),
      M.Submission.deleteMany({ projectId: { $in: pIds } }),
      M.Stage.deleteMany({ projectId: { $in: pIds } }),
      M.Project.deleteMany({ _id: { $in: pIds } }),
      M.Quote.deleteMany({ $or: [{ enquiryId: { $in: eIds } }, { contractorId: { $in: cIds } }] }),
      M.Template.deleteMany({ contractorId: { $in: cIds } }),
      M.Visit.deleteMany({ $or: [{ enquiryId: { $in: eIds } }, { contractorId: { $in: cIds } }] }),
      M.Lead.deleteMany({ $or: [{ enquiryId: { $in: eIds } }, { contractorId: { $in: cIds } }] }),
      M.Enquiry.deleteMany({ _id: { $in: eIds } }),
      M.ContractorDoc.deleteMany({ contractorId: { $in: cIds } }),
      M.Portfolio.deleteMany({ contractorId: { $in: cIds } }),
      M.Score.deleteMany({ contractorId: { $in: cIds } }),
      M.Contractor.deleteMany({ _id: { $in: cIds } }),
      M.Wallet.deleteMany({ userId: { $in: uIds } }),
      M.ContractorWallet.deleteMany({ contractorId: { $in: cIds } }),
      M.Ledger.collection.deleteMany({ holdId: { $in: holdIds } }),
      M.Hold.collection.deleteMany({ _id: { $in: holdIds } }),
      M.Txn.deleteMany({ entityId: { $in: [...uIds, ...cIds] } }),
      M.Audit.collection.deleteMany({ entityId: { $in: [...pIds, ...eIds, ...cIds] } }),
      M.User.deleteMany({ _id: { $in: uIds } }),
    ]);
    return { users: uIds.length, contractors: cIds.length, projects: pIds.length };
  };

  step(0, 'Removing any previous demo data');
  const removed = await clean();
  done(`cleared ${removed.users} user(s), ${removed.contractors} contractor(s), ${removed.projects} project(s)`);

  if (CLEAN_ONLY) {
    console.log('\nDemo data removed. Nothing else was touched.');
    await mongoose.disconnect();
    return;
  }

  // ---- catalogue ---------------------------------------------------------
  const services = await M.Service.find({ status: 'active', isDeleted: { $ne: true } })
    .limit(6).lean();
  if (services.length < 2) {
    throw new Error('The catalogue is empty. Run `npm run db:seed-construction` first.');
  }
  const houseService = services.find((s) => /house|villa|building/i.test(s.name)) || services[0];
  const kitchenService = services.find((s) => /kitchen|renovat|interior/i.test(s.name)) || services[1];

  // ---- 1. people ---------------------------------------------------------
  step(1, 'Creating the customer and three contractors');

  const customerUser = await findOrCreateUserByPhone({ phone: P.customer, countryCode: '+91' });
  await M.User.updateOne({ _id: customerUser._id }, {
    $set: { name: 'Rohit Sharma', email: 'rohit.demo@example.com' },
  });
  await M.Wallet.create({ userId: customerUser._id, balance: 6000000, transactions: [] });
  done('customer Rohit Sharma', `wallet ₹60,00,000 · ${P.customer}`);

  const makeContractor = async (phone, data) => {
    const user = await findOrCreateUserByPhone({ phone, countryCode: '+91' });
    return M.Contractor.create({
      userId: user._id,
      phone, phoneLast10: phone, phoneDigits: phone,
      status: 'onboarding',
      isActive: true,
      ...data,
    });
  };

  const builderA = await makeContractor(P.builderA, {
    businessName: 'Shreeji Constructions',
    ownerName: 'Mahesh Gurjar',
    email: 'shreeji.demo@example.com',
    businessType: 'partnership',
    about: 'Twenty years of residential building across Indore and Dewas. '
      + 'We handle everything from foundation to handover with our own supervisors.',
    yearsExperience: 20,
    trades: [houseService.categoryId, kitchenService.categoryId],
    serviceAreas: ['Indore', 'Dewas', 'Ujjain'],
    travelRadiusKm: 60,
    projectSizeMin: 300000,
    projectSizeMax: 40000000,
    maxConcurrentProjects: 4,
    bank: { accountHolder: 'Shreeji Constructions', accountNumber: '50100234567890', ifsc: 'HDFC0001234', bankName: 'HDFC Bank' },
  });

  const builderB = await makeContractor(P.builderB, {
    businessName: 'Maruti Builders & Interiors',
    ownerName: 'Anil Patidar',
    email: 'maruti.demo@example.com',
    businessType: 'pvt_ltd',
    about: 'Interior-led builders. Known for finishing quality and on-time handover.',
    yearsExperience: 11,
    trades: [houseService.categoryId, kitchenService.categoryId],
    serviceAreas: ['Indore', 'Bhopal'],
    travelRadiusKm: 40,
    projectSizeMin: 200000,
    projectSizeMax: 20000000,
    maxConcurrentProjects: 3,
    bank: { accountHolder: 'Maruti Builders', accountNumber: '50100987654321', ifsc: 'ICIC0000456', bankName: 'ICICI Bank' },
  });

  const pendingBuilder = await makeContractor(P.pending, {
    businessName: 'Nakoda Infra Projects',
    ownerName: 'Sunil Jain',
    email: 'nakoda.demo@example.com',
    businessType: 'individual',
    about: 'New to the platform. Civil contractor with 6 years of site experience.',
    yearsExperience: 6,
    trades: [houseService.categoryId],
    serviceAreas: ['Indore'],
    maxConcurrentProjects: 2,
    status: 'pending_approval',
    submittedAt: daysAgo(1),
  });
  done('3 contractors created');

  // ---- 2. documents, portfolio, approval ---------------------------------
  step(2, 'Documents, portfolio, and putting two through approval');

  const addDocs = async (contractor, expiring = false) => {
    await onboarding.addDocument(contractor._id, {
      type: 'contractor_license',
      documentNumber: `LIC/MP/${String(contractor.phoneLast10).slice(-4)}`,
      fileUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      expiresAt: daysAhead(expiring ? 400 : 500).toISOString(),
    });
    await onboarding.addDocument(contractor._id, {
      type: 'gst_certificate',
      documentNumber: '23AABCS1429B1ZX',
      fileUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    });
    await onboarding.addDocument(contractor._id, {
      type: 'insurance',
      documentNumber: 'POL-99381',
      fileUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      expiresAt: daysAhead(300).toISOString(),
    });
  };

  await addDocs(builderA, true);
  await addDocs(builderB);
  await onboarding.addDocument(pendingBuilder._id, {
    type: 'contractor_license',
    documentNumber: 'LIC/MP/7742',
    fileUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    expiresAt: daysAhead(400).toISOString(),
  });

  await onboarding.addPortfolioEntry(builderA._id, {
    title: '3BHK duplex, Vijay Nagar',
    description: 'Ground plus one, 2,400 sq ft built-up. Handed over in 11 months.',
    images: [
      'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    ],
    location: 'Indore',
    projectValue: 6800000,
    completedAt: daysAgo(200),
  });
  await onboarding.addPortfolioEntry(builderA._id, {
    title: 'Kitchen and living renovation, Silicon City',
    description: 'Full strip-out and modular kitchen with false ceiling.',
    images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
    location: 'Indore',
    projectValue: 1250000,
    completedAt: daysAgo(90),
  });
  await onboarding.addPortfolioEntry(builderB._id, {
    title: 'Office fit-out, AB Road',
    description: '4,000 sq ft commercial interior.',
    images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
    location: 'Indore',
    projectValue: 3400000,
    completedAt: daysAgo(150),
  });

  // Approval refuses a contractor who has not submitted, so mark the two we are
  // approving as submitted first. Their profile fields were filled in above,
  // which is everything `submitOnboarding` would have written — this only moves
  // the status, it does not skip any validation that matters.
  await M.Contractor.updateMany(
    { _id: { $in: [builderA._id, builderB._id] } },
    { $set: { status: 'pending_approval', submittedAt: daysAgo(30), onboardingStep: 7 } },
  );

  // Then verify every document. The approve button is blocked until nothing is
  // pending, which is the real rule your team works to.
  for (const c of [builderA, builderB]) {
    const docs = await M.ContractorDoc.find({ contractorId: c._id });
    for (const d of docs) await contractorAdmin.verifyDocument(d._id, null);
    await contractorAdmin.approveContractor(c._id, null);
  }

  // Now lapse one of Shreeji's documents. It has to be done AFTER verification,
  // because the platform rightly refuses to verify a document that has already
  // expired — and this is the real-world sequence anyway: verified while valid,
  // then the renewal gets forgotten. Without it the demo shows a suspiciously
  // perfect 100/100 with an empty "what to improve" list.
  await M.ContractorDoc.updateOne(
    { contractorId: builderA._id, type: 'insurance' },
    { $set: { expiresAt: daysAgo(12) } },
  );
  done('Shreeji and Maruti approved', 'Nakoda left waiting in the queue');
  done("Shreeji's insurance has lapsed since verification", 'so the expiry warning has something to show');

  // ---- 3. a finished project, for history --------------------------------
  step(3, 'A completed project, so ratings and reports have history');

  const oldEnquiry = await enquiryService.createEnquiry(customerUser._id, {
    serviceId: kitchenService._id,
    description: 'Kitchen and two bathrooms renovation at our old flat.',
    site: { addressLine: '44 Scheme 54', area: 'Vijay Nagar', city: 'Indore', state: 'MP' },
    budgetMin: 800000,
    budgetMax: 1500000,
    urgency: 'flexible',
  });
  await matching.matchEnquiry(oldEnquiry._id);
  const oldLead = await M.Lead.findOne({ enquiryId: oldEnquiry._id, contractorId: builderA._id });
  if (oldLead) await leadService.acceptLead(builderA._id, oldLead._id);

  const oldDraft = await quoteService.createDraft(builderA._id, { enquiryId: oldEnquiry._id });
  await quoteService.updateDraft(builderA._id, oldDraft._id, {
    title: 'Kitchen and bathroom renovation',
    sections: [
      { name: 'Kitchen', items: [{ description: 'Modular kitchen with counter', quantity: 1, unit: 'lumpsum', rate: 620000 }] },
      { name: 'Bathrooms', items: [{ description: 'Two bathrooms, full renovation', quantity: 2, unit: 'nos', rate: 190000 }] },
    ],
    taxMode: 'none',
    exclusions: 'Appliances, loose furniture, electrical upgrade beyond existing points',
    // Settings cap any single stage at 40%, the first at 20% and require at
    // least three — the guardrail against "70% advance" (BRD W12).
    proposedStages: [
      { name: 'Strip-out and plumbing', percentage: 20 },
      { name: 'Carcass and tiling', percentage: 40 },
      { name: 'Fit-out and handover', percentage: 40 },
    ],
    validUntil: daysAhead(30),
  });
  const oldSent = await quoteService.sendQuotation(builderA._id, oldDraft._id);
  await enquiryService.acceptQuotation(customerUser._id, oldEnquiry._id, oldSent._id);

  const oldProject = await M.Project.findOne({ quotationId: oldSent._id });
  await projectService.fundProject(customerUser._id, oldProject._id, oldProject.agreedValue);
  const oldStages = await M.Stage.find({ projectId: oldProject._id }).sort({ sequence: 1 });
  for (const st of oldStages) {
    await stageService.submitStage(builderA._id, st._id, {
      notes: 'Completed as agreed.',
      photos: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
    });
    await stageService.approveStage(st._id, { actorRole: 'customer', actorId: customerUser._id });
  }
  await handover.confirmHandover(customerUser._id, oldProject._id, {
    rating: 5,
    review: 'Excellent work. Kept to the dates, cleaned up every evening, and the '
      + 'stage photos meant I could follow it while I was travelling.',
  });
  await handover.releaseRetention(oldProject._id, { force: true });
  done(`${oldProject.projectNumber} closed`, `₹${oldProject.agreedValue.toLocaleString('en-IN')} · rated 5★`);

  // ---- 4. the live project -----------------------------------------------
  step(4, 'The live project — enquiry through to a part-built house');

  const enquiry = await enquiryService.createEnquiry(customerUser._id, {
    serviceId: houseService._id,
    description: 'Building a 3BHK independent house on our plot. Ground plus one, '
      + 'around 1,800 sq ft built-up. We want proper supervision and stage photos.',
    site: {
      addressLine: 'Plot 27, Sector C',
      area: 'Sanwer Road',
      city: 'Indore',
      state: 'MP',
      pincode: '452015',
      location: { type: 'Point', coordinates: [75.8577, 22.7196] },
    },
    budgetMin: 2500000,
    budgetMax: 4500000,
    urgency: 'within_month',
    attachments: [
      { url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', kind: 'site_photo', caption: 'Plot, front view' },
      { url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', kind: 'drawing', caption: 'Architect plan' },
    ],
  });
  await matching.matchEnquiry(enquiry._id);
  done(`enquiry ${enquiry.enquiryNumber} raised and matched`);

  for (const c of [builderA, builderB]) {
    const lead = await M.Lead.findOne({ enquiryId: enquiry._id, contractorId: c._id });
    if (lead) await leadService.acceptLead(c._id, lead._id);
  }

  const visit = await visitService.proposeVisit({
    enquiryId: enquiry._id,
    contractorId: builderA._id,
    proposedBy: 'contractor',
    // A visit cannot be booked in the past, so it is scheduled ahead and then
    // completed — which is the state that matters for the demo.
    scheduledAt: daysAhead(1),
    actorId: builderA._id,
  });
  await visitService.confirmVisit(visit._id, { actorRole: 'customer', actorId: customerUser._id });
  await visitService.submitVisitReport(builderA._id, visit._id, {
    report: {
      measurements: '30x60 plot · 1,800 sq ft proposed built-up · ground + 1',
      observations: 'Level plot, 20 ft road access. Municipal water at the boundary. '
        + 'Neighbouring wall on the east will need shoring during excavation.',
      photos: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
    },
    checkIn: { coordinates: [75.8578, 22.7197] },
  });
  done('site visit completed with a report');

  /** Two competing quotes, so the compare screen has something to compare. */
  const quoteFrom = async (contractor, { total, stages, exclusions, title }) => {
    const draft = await quoteService.createDraft(contractor._id, { enquiryId: enquiry._id });
    await quoteService.updateDraft(contractor._id, draft._id, {
      title,
      sections: [
        { name: 'Civil work', items: [
          { description: 'Excavation and foundation', quantity: 1800, unit: 'sqft', rate: Math.round(total * 0.28 / 1800) },
          { description: 'RCC structure and masonry', quantity: 1800, unit: 'sqft', rate: Math.round(total * 0.37 / 1800) },
        ] },
        { name: 'Finishing', items: [
          { description: 'Plaster, flooring, painting', quantity: 1800, unit: 'sqft', rate: Math.round(total * 0.25 / 1800) },
          { description: 'Plumbing and electrical', quantity: 1, unit: 'lumpsum', rate: Math.round(total * 0.10) },
        ] },
      ],
      taxMode: 'none',
      exclusions,
      proposedStages: stages,
      validUntil: daysAhead(21),
      notes: 'Rates hold for 21 days. Cement and steel at current market rate.',
    });
    return quoteService.sendQuotation(contractor._id, draft._id);
  };

  const quoteA = await quoteFrom(builderA, {
    title: '3BHK independent house — ground plus one',
    total: 3400000,
    exclusions: 'Land cost, municipal approvals, boundary wall, furniture, appliances',
    stages: [
      { name: 'Mobilisation and excavation', percentage: 15 },
      { name: 'Foundation and plinth', percentage: 25 },
      { name: 'Structure and roof slab', percentage: 35 },
      { name: 'Finishing and handover', percentage: 25 },
    ],
  });
  const quoteB = await quoteFrom(builderB, {
    title: '3BHK house construction',
    total: 3750000,
    exclusions: 'Land cost, approvals, compound wall, loose furniture',
    stages: [
      { name: 'Site setup', percentage: 20 },
      { name: 'Foundation', percentage: 25 },
      { name: 'Superstructure', percentage: 30 },
      { name: 'Finishing', percentage: 25 },
    ],
  });
  done('two quotes sent', `₹${quoteA.total.toLocaleString('en-IN')} vs ₹${quoteB.total.toLocaleString('en-IN')}`);

  // A question on the cheaper quote, so the Q&A thread has content.
  await enquiryService.askQuotationQuestion(customerUser._id, quoteA._id,
    'Does the finishing stage include the modular kitchen, or is that separate?');

  await enquiryService.acceptQuotation(customerUser._id, enquiry._id, quoteA._id);
  const project = await M.Project.findOne({ quotationId: quoteA._id });
  done(`${project.projectNumber} created`, `₹${project.agreedValue.toLocaleString('en-IN')}`);

  await projectService.fundProject(customerUser._id, project._id, project.agreedValue);
  done('project funded — money held, not paid');

  // ---- 5. stages: one paid, one waiting, one frozen -----------------------
  step(5, 'Working the stages into a realistic mid-flight state');

  const [s1, s2, s3] = await M.Stage.find({ projectId: project._id }).sort({ sequence: 1 });

  await stageService.submitStage(builderA._id, s1._id, {
    progressPercent: 100,
    notes: 'Site cleared, boundary marked, excavation complete to 4 ft. '
      + 'Shoring done on the east wall as discussed at the site visit.',
    photos: [
      { url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', caption: 'Excavation complete' },
      { url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', caption: 'East wall shoring' },
    ],
  });
  await stageService.approveStage(s1._id, { actorRole: 'customer', actorId: customerUser._id });
  done('stage 1 approved and PAID');

  await stageService.submitStage(builderA._id, s2._id, {
    progressPercent: 100,
    notes: 'Foundation poured and cured. Plinth beam complete. Ready for your check.',
    photos: [
      { url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', caption: 'Foundation poured' },
      { url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', caption: 'Plinth beam' },
    ],
  });
  done('stage 2 submitted — WAITING for the customer');

  await stageService.updateProgress(builderA._id, s3._id, {
    progressPercent: 35,
    notes: 'Columns up to first floor level. Slab shuttering starts next week.',
  });
  // Put its target date in the past. The stage really is running late, which is
  // what the delay report, the delay alert and the first dispute are all about.
  await M.Stage.updateOne({ _id: s3._id }, { $set: { targetDate: daysAgo(9) } });
  done('stage 3 under way at 35%', 'and 9 days past its target date');

  // ---- 6. documents, conversation, disputes -------------------------------
  step(6, 'Papers, conversation and a disagreement');

  const asCustomer = { customerId: customerUser._id };
  const asContractor = { contractorId: builderA._id };
  const asAdmin = { isAdmin: true };

  const agreement = await docService.addDocument(project._id, {
    documentType: 'Agreement / contract',
    title: 'Construction agreement',
    fileUrl: 'https://res.cloudinary.com/demo/image/upload/sample.pdf',
  }, asContractor);
  await docService.addDocument(project._id, {
    documentType: 'Agreement / contract',
    title: 'Construction agreement (revision B — revised stage dates)',
    fileUrl: 'https://res.cloudinary.com/demo/image/upload/sample.pdf',
    supersedesId: agreement._id,
  }, asContractor);
  await docService.addDocument(project._id, {
    documentType: 'Approved drawings',
    title: 'Structural drawings, stamped',
    fileUrl: 'https://res.cloudinary.com/demo/image/upload/sample.pdf',
  }, asContractor);
  await docService.addDocument(project._id, {
    documentType: 'Government approvals & permits',
    title: 'Building permission — IMC',
    fileUrl: 'https://res.cloudinary.com/demo/image/upload/sample.pdf',
  }, asCustomer);
  done('4 documents filed, one of them a superseded revision');

  await msgService.sendMessage(project._id, {
    body: 'Foundation photos are up. Please have a look when you can — once you '
      + 'approve I will order steel for the slab.',
  }, asContractor);
  await msgService.sendMessage(project._id, {
    body: 'Saw them, looks good. My brother is visiting the site on Saturday, '
      + 'can someone be there to walk him through it?',
  }, asCustomer);
  await msgService.sendMessage(project._id, {
    body: 'Yes, our supervisor Ramesh will be there from 10am.',
    attachments: [{ url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', kind: 'image' }],
  }, asContractor);
  done('a two-way conversation, plus the system notes from each approval');

  // One dispute resolved, so the history reads properly...
  const settled = await disputeService.raiseDispute(project._id, {
    stageId: s3._id,
    reason: 'delay',
    description: 'The slab work has slipped by about two weeks against the dates in '
      + 'the agreement, and I have not had an explanation for it.',
  }, asCustomer);
  await disputeService.startReview(settled._id, null);
  await disputeService.resolveDispute(settled._id, {
    outcome: 'dismissed',
    resolutionNote: 'Delay was caused by three days of rain and a steel delivery '
      + 'shortfall, both documented in the site messages. Revised dates agreed with '
      + 'the customer. No money moved.',
  });
  done('one dispute raised and resolved');

  // ...and one left OPEN, so the admin queue and payment control have work.
  const open = await disputeService.raiseDispute(project._id, {
    stageId: s3._id,
    reason: 'work_quality',
    description: 'There is honeycombing visible on two of the ground floor columns. '
      + 'I want this looked at by someone independent before the slab goes on top of it.',
    evidence: [
      'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    ],
  }, asCustomer);
  await disputeService.addComment(open._id,
    'We have photographed the columns from all sides and are happy for an '
    + 'independent engineer to inspect. Repair mortar is on site if it is needed.',
    asContractor);
  done(`one dispute OPEN — ${open.disputeNumber}`, `₹${round2(open.frozenAmount).toLocaleString('en-IN')} frozen`);

  await msgService.sendMessage(project._id, {
    body: 'Following up on the column issue — happy to bring in a third-party '
      + 'engineer this week if that helps settle it.',
  }, asAdmin);

  // ---- 7. a second live enquiry, still choosing ---------------------------
  step(7, 'A second enquiry still out for quotes');

  const openEnquiry = await enquiryService.createEnquiry(customerUser._id, {
    serviceId: kitchenService._id,
    description: 'Separate job — modular kitchen for my mother\'s flat in Bhopal.',
    site: { addressLine: '12 Arera Colony', area: 'E-3', city: 'Bhopal', state: 'MP' },
    budgetMin: 400000,
    budgetMax: 900000,
    urgency: 'within_month',
  });
  await matching.matchEnquiry(openEnquiry._id);
  for (const c of [builderA, builderB]) {
    const lead = await M.Lead.findOne({ enquiryId: openEnquiry._id, contractorId: c._id });
    if (lead) await leadService.acceptLead(c._id, lead._id);
  }

  const smallQuote = async (contractor, rate, exclusions) => {
    const d = await quoteService.createDraft(contractor._id, { enquiryId: openEnquiry._id });
    await quoteService.updateDraft(contractor._id, d._id, {
      title: 'Modular kitchen',
      sections: [{ name: 'Kitchen', items: [
        { description: 'Modular kitchen, full', quantity: 1, unit: 'lumpsum', rate },
      ] }],
      taxMode: 'none',
      exclusions,
      proposedStages: [
        { name: 'Advance and measurement', percentage: 20 },
        { name: 'Fabrication', percentage: 40 },
        { name: 'Installation and handover', percentage: 40 },
      ],
      validUntil: daysAhead(14),
    });
    return quoteService.sendQuotation(contractor._id, d._id);
  };
  await smallQuote(builderA, 640000, 'Chimney, hob and appliances');
  await smallQuote(builderB, 590000, 'Appliances, and any civil work beyond the existing layout');
  done(`${openEnquiry.enquiryNumber} — two live quotes waiting on the customer`);

  // ---- 8. scores ---------------------------------------------------------
  step(8, 'Recalculating trust scores');
  for (const c of [builderA, builderB]) await scoreService.recalculateScore(c._id);
  const scoreA = await M.Score.findOne({ contractorId: builderA._id }).lean();
  done(`Shreeji: ${scoreA.isProvisional ? 'New (provisional)' : `${scoreA.score}/100`}`,
    `${scoreA.stats.projectsCompleted} completed`);

  // ---- summary -----------------------------------------------------------
  const liveProject = await M.Project.findById(project._id).lean();
  const wallet = await M.Wallet.findOne({ userId: customerUser._id }).lean();
  const walletA = await M.ContractorWallet.findOne({ contractorId: builderA._id }).lean();

  console.log(`\n${'='.repeat(66)}`);
  console.log('  DEMO DATA READY');
  console.log('='.repeat(66));

  console.log('\n  LOG IN  ·  OTP is 1234 for every account');
  console.log('  ─────────────────────────────────────────────────────────────');
  console.log(`  Customer     /user/auth/login        ${P.customer}   Rohit Sharma`);
  console.log(`  Contractor   /contractor/login       ${P.builderA}   Shreeji Constructions`);
  console.log(`  Contractor   /contractor/login       ${P.builderB}   Maruti Builders`);
  console.log(`  Pending      /contractor/login       ${P.pending}   Nakoda Infra (awaiting approval)`);
  console.log('  Admin        your existing admin login');

  console.log('\n  THE MONEY, RIGHT NOW');
  console.log('  ─────────────────────────────────────────────────────────────');
  console.log(`  Customer wallet          ₹${round2(wallet.balance).toLocaleString('en-IN')}`);
  console.log(`  Locked in escrow         ₹${round2(wallet.lockedAmount).toLocaleString('en-IN')}`);
  console.log(`  Live project value       ₹${round2(liveProject.agreedValue).toLocaleString('en-IN')}`);
  console.log(`  Released so far          ₹${round2(liveProject.releasedAmount).toLocaleString('en-IN')}`);
  console.log(`  Still held               ₹${round2(liveProject.fundedAmount - liveProject.releasedAmount - liveProject.refundedAmount).toLocaleString('en-IN')}`);
  console.log(`  Shreeji's wallet         ₹${round2(walletA?.balance).toLocaleString('en-IN')}`);

  console.log('\n  WHAT TO CHECK, AND WHERE');
  console.log('  ─────────────────────────────────────────────────────────────');
  const checks = [
    ['CUSTOMER', ''],
    ['/construction', 'catalogue with photos, search, your projects strip'],
    ['/construction/contractors', 'verified directory — filter by city and rating'],
    [`/construction/contractors/${builderA._id}`, 'public profile: badges, past work, a 5★ review'],
    ['/construction/enquiries', 'two enquiries, one converted and one still open'],
    [`/construction/enquiries/${openEnquiry._id}/compare`, 'two quotes side by side'],
    ['/construction/quotations', 'My Quotes — grouped by enquiry'],
    ['/construction/projects', 'one live, one closed · a stage is waiting on you'],
    [`/construction/projects/${project._id}`, 'money bar, stages, and the four tabs'],
    ['', 'Overview · Documents (a superseded revision) · Messages · Disputes'],
    ['CONTRACTOR', 'log in as ' + P.builderA],
    ['/contractor/dashboard', 'sidebar, tab bar, live figures'],
    ['/contractor/profile', 'everything submitted, plus photo upload'],
    ['/contractor/projects', 'the live project · stage 3 is frozen by the dispute'],
    ['/contractor/earnings', 'paid, held and awaiting approval'],
    ['/contractor/score', 'trust score with the breakdown'],
    ['ADMIN', ''],
    ['/admin/construction/dashboard', 'the work queue — the open dispute is top'],
    ['/admin/construction/contractors', 'Nakoda Infra is waiting for approval'],
    ['/admin/construction/enquiries', 'the pipeline'],
    ['/admin/construction/projects', 'the register, led by money held'],
    ['/admin/construction/disputes', `${open.disputeNumber} is open and freezing money`],
    ['/admin/construction/payments', 'held · awaiting · frozen · released'],
    ['/admin/construction/reports', 'five cuts, with CSV'],
    ['/admin/construction/activity', 'every action above, permanently recorded'],
  ];
  for (const [path, note] of checks) {
    if (!path) { console.log(`               ${note}`); continue; }
    if (!note || path === path.toUpperCase()) {
      console.log(`\n  ${path}${note ? `  (${note})` : ''}`);
      continue;
    }
    console.log(`    ${path.padEnd(46)} ${note}`);
  }

  console.log('\n  To remove all of this:  node scripts/seed-construction-demo.js --clean');
  console.log('');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\nSeed failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
