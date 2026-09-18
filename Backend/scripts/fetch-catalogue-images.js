/**
 * Fill in catalogue photographs for construction categories and services.
 *
 * WHY NOT GOOGLE IMAGES
 * Google Images is a search index, not a licence. The pictures it returns belong
 * to whoever took them; hot-linking them into a commercial product is copyright
 * infringement, and the URLs break the moment the owner moves the file. So this
 * pulls from libraries that state a licence, and records that licence.
 *
 * PROVIDERS
 *   wikimedia  (default)  No API key. Freely licensed, mostly CC-BY / CC-BY-SA,
 *                         which allow commercial use but REQUIRE crediting the
 *                         photographer — so the credit is stored on the record.
 *   pexels     Set PEXELS_API_KEY. Free commercial licence, no attribution
 *              required, and the photography is markedly better for a consumer
 *              app. Preferred if you have a key: https://www.pexels.com/api/
 *   pixabay    Set PIXABAY_API_KEY. Same idea: https://pixabay.com/api/docs/
 *
 * Images are downloaded and re-uploaded to YOUR Cloudinary account, so the app
 * never depends on someone else's server staying up.
 *
 * Usage:
 *   node scripts/fetch-catalogue-images.js --dry-run     preview, writes nothing
 *   node scripts/fetch-catalogue-images.js               fill in what is missing
 *   node scripts/fetch-catalogue-images.js --force       replace existing images
 *   node scripts/fetch-catalogue-images.js --only=categories
 *   node scripts/fetch-catalogue-images.js --provider=pexels
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ConstructionCategory } from '../src/modules/construction/models/constructionCategory.model.js';
import { ConstructionService } from '../src/modules/construction/models/constructionService.model.js';
import { uploadDataUrlToCloudinary } from '../src/utils/cloudinaryUpload.js';

dotenv.config();

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};

const DRY_RUN = has('--dry-run');
const FORCE = has('--force');
const ONLY = valueOf('only', 'all');
const PROVIDER = valueOf('provider', process.env.PEXELS_API_KEY ? 'pexels' : 'wikimedia');
const UA = 'SMSPro-construction-catalogue/1.0 (catalogue imagery seeding)';

/**
 * Hand-written search terms.
 *
 * Searching the raw service name is what produces a photograph of a shop sign
 * that happens to say "Structural Strengthening". These terms describe the WORK,
 * which is what a customer is trying to recognise on the tile.
 */
const TERMS = {
  // ---- categories ----
  'New Building Construction': ['house under construction', 'building construction site', 'concrete frame building'],
  'Renovation & Remodelling': ['kitchen renovation', 'home renovation', 'house remodeling'],
  'Interior Fit-out': ['living room interior', 'apartment interior', 'modern interior room'],
  'Structural Repair & Waterproofing': ['building renovation scaffolding', 'wall repair', 'facade restoration'],
  'Extension & Additional Floor': ['house extension', 'building under construction', 'house addition construction'],
  'Commercial & Shop Fit-out': ['shop interior', 'retail store interior', 'storefront'],
  'External & Site Works': ['paving stones', 'driveway paving', 'garden landscaping'],
  'Finishing Works': ['painting wall', 'house painting', 'interior painting'],
  renovetion: ['home renovation', 'kitchen renovation'],

  // ---- services ----
  'Independent House Construction': ['house under construction', 'single family house construction'],
  'Duplex / Villa Construction': ['villa construction', 'house construction exterior', 'new house building'],
  'Apartment / Multi-unit Building': ['apartment building construction', 'residential building construction'],
  'Full Home Renovation': ['home renovation', 'house renovation interior'],
  'Kitchen Renovation': ['kitchen renovation', 'kitchen under construction'],
  'Bathroom Renovation': ['bathroom renovation', 'bathroom tiling', 'bathroom interior'],
  'Modular Kitchen': ['modern kitchen cabinets', 'fitted kitchen', 'kitchen interior'],
  'Wardrobes & Storage': ['wardrobe closet', 'built in wardrobe', 'closet interior'],
  'False Ceiling & Lighting': ['suspended ceiling', 'ceiling installation', 'ceiling lighting interior'],
  'Terrace & Roof Waterproofing': ['roof waterproofing', 'flat roof membrane', 'roof sealing'],
  'Crack Repair & Plaster Restoration': ['plastering wall', 'wall plaster repair', 'rendering wall'],
  'Structural Strengthening': ['concrete reinforcement', 'rebar column construction', 'steel reinforcement concrete'],
  'Room Extension': ['house extension', 'home addition construction'],
  'Room Addition': ['house extension', 'home addition construction'],
  'Additional Floor': ['building construction storey', 'house under construction roof'],
  'Additional Floor Construction': ['building construction storey', 'house under construction roof'],
  'Balcony / Terrace Enclosure': ['balcony glazing', 'terrace balcony building', 'balcony construction'],
  'Retail Shop Fit-out': ['shop interior', 'retail store interior'],
  'Shop / Showroom Fit-out': ['shop interior', 'showroom interior'],
  'Office Interior': ['office interior', 'modern office workspace'],
  'Office Interior Fit-out': ['office interior', 'modern office workspace'],
  'Restaurant / Cafe Fit-out': ['restaurant interior', 'cafe interior'],
  'Boundary Wall & Gate': ['brick wall construction', 'garden wall gate', 'boundary wall'],
  'Paving & Driveway': ['paving stones', 'driveway paving', 'block paving'],
  'Driveway & Paving': ['paving stones', 'driveway paving', 'block paving'],
  'Drainage & Septic Tank': ['drainage pipe trench', 'sewer pipe installation', 'drainage construction'],
  'Landscaping & Garden': ['garden landscaping', 'landscaped garden'],
  'Painting — Interior & Exterior': ['painting wall roller', 'house painting', 'painter painting wall'],
  'Painting & Polishing': ['painting wall roller', 'house painting'],
  'Tiling & Flooring': ['floor tiling', 'tile installation floor', 'laying tiles'],
  'Flooring & Tiling': ['floor tiling', 'tile installation floor', 'laying tiles'],
  'Plastering & POP Work': ['plastering wall', 'plasterer working', 'rendering wall'],
  'Plumbing & Sanitary': ['plumbing pipes', 'plumber working', 'water pipe installation'],
  'Electrical & Wiring': ['electrical wiring', 'electrician wiring', 'electrical installation'],
};

/**
 * Commons is an encyclopedic archive, not a stock library, so a query like
 * "interior fit out" happily returns a plate from a 1911 gardening annual. These
 * patterns throw that material out. Without them roughly a third of the results
 * are book scans, engravings and listed buildings.
 */
const ARCHIVAL = /\((1[6-9]\d{2}|20[01]\d)\)|engraving|lithograph|postcard|museum|castle|cathedral|ruins?|drawing|sketch|painting of|magazine|journal|catalogue|advertis|1[6-9]\d{2}/i;

/** Anything not in TERMS still gets a sensible query rather than being skipped. */
const termsFor = (name) => {
  const configured = TERMS[name];
  if (Array.isArray(configured)) return configured;
  if (configured) return [configured];
  return [`${String(name).replace(/[/&]/g, ' ').replace(/\s+/g, ' ').trim()} construction`];
};

const stripHtml = (v) => String(v || '').replace(/<[^>]*>/g, '').trim();

// ---------------------------------------------------------------- providers

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Commons answers 429 readily when a script walks a whole catalogue. Backing off
 * and retrying is the difference between filling in 30 rows and filling in one.
 */
async function commonsFetch(url, attempts = 4) {
  for (let i = 0; i < attempts; i += 1) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429 || res.status === 503) {
      await sleep(1500 * (i + 1));
      continue;
    }
    if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
    return res.json();
  }
  throw new Error('Commons rate-limited after retries');
}

async function fromWikimedia(term) {
  const url = 'https://commons.wikimedia.org/w/api.php'
    + '?action=query&format=json&generator=search'
    + `&gsrsearch=${encodeURIComponent(`filetype:bitmap ${term}`)}`
    + '&gsrnamespace=6&gsrlimit=15'
    + '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=900';

  const pages = Object.values((await commonsFetch(url))?.query?.pages || {});

  const candidates = pages
    .map((page) => ({ page, info: page.imageinfo?.[0] }))
    .filter(({ page, info }) => info
      && /^image\/(jpeg|png|webp)$/.test(info.mime)
      // Landscape-ish and big enough to crop into a tile without going soft.
      && info.width >= 640
      && info.width >= info.height * 0.9
      // Reject the archive: book plates, engravings, listed monuments.
      && !ARCHIVAL.test(String(page.title).replace('File:', '')));

  if (!candidates.length) return null;

  // Prefer licences with no attribution obligation, but do not insist on them —
  // insisting leaves half the catalogue blank, which is worse than a credit line.
  const score = ({ page }) => {
    const meta = page.imageinfo[0].extmetadata || {};
    const lic = stripHtml(meta.LicenseShortName?.value || meta.UsageTerms?.value);
    if (/^(cc0|public domain|pd)/i.test(lic)) return 0;
    if (/^cc by \d/i.test(lic)) return 1;
    return 2;
  };
  candidates.sort((a, b) => score(a) - score(b));

  const { page, info } = candidates[0];
  const meta = info.extmetadata || {};
  const license = stripHtml(meta.LicenseShortName?.value || meta.UsageTerms?.value) || 'see source';
  const author = stripHtml(meta.Artist?.value) || 'Wikimedia Commons contributor';
  const noAttributionNeeded = /^(cc0|public domain|pd|no restrictions)/i.test(license);

  return {
    downloadUrl: info.thumburl || info.url,
    attribution: noAttributionNeeded ? null : {
      author: author.slice(0, 200),
      license,
      sourceUrl: info.descriptionurl
        || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      provider: 'wikimedia',
    },
    note: `${license} · ${String(page.title).replace('File:', '').slice(0, 44)}`,
  };
}

async function fromPexels(term) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error('PEXELS_API_KEY is not set');
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(term)}&per_page=5&orientation=landscape`,
    { headers: { Authorization: key, 'User-Agent': UA } },
  );
  if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
  const photo = (await res.json())?.photos?.[0];
  if (!photo) return null;
  return {
    downloadUrl: photo.src?.large || photo.src?.medium,
    // The Pexels licence permits commercial use with no attribution required.
    attribution: null,
    note: `Pexels · ${photo.photographer}`,
  };
}

async function fromPixabay(term) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) throw new Error('PIXABAY_API_KEY is not set');
  const res = await fetch(
    `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(term)}`
    + '&image_type=photo&orientation=horizontal&safesearch=true&per_page=5',
    { headers: { 'User-Agent': UA } },
  );
  if (!res.ok) throw new Error(`Pixabay HTTP ${res.status}`);
  const hit = (await res.json())?.hits?.[0];
  if (!hit) return null;
  return {
    downloadUrl: hit.largeImageURL || hit.webformatURL,
    attribution: null,
    note: `Pixabay · ${hit.user}`,
  };
}

const PROVIDERS = { wikimedia: fromWikimedia, pexels: fromPexels, pixabay: fromPixabay };

// ---------------------------------------------------------------- pipeline

async function toDataUrl(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const type = res.headers.get('content-type') || 'image/jpeg';
  if (!/^image\//.test(type)) throw new Error(`not an image (${type})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > 9 * 1024 * 1024) throw new Error('image over 9MB');
  return `data:${type};base64,${buffer.toString('base64')}`;
}

async function processOne(doc, Model, label) {
  const terms = termsFor(doc.name);

  // Try each phrasing in turn. "roof waterproofing" finds nothing usable in
  // Commons but "flat roof membrane" does, and a blank tile helps nobody.
  let found = null;
  for (const term of terms) {
    found = await PROVIDERS[PROVIDER](term);
    if (found) break;
    await sleep(700);
  }

  if (!found) {
    console.log(`  ~  ${label.padEnd(38)} nothing usable for ${terms.map((t) => `"${t}"`).join(', ')}`);
    return 'skipped';
  }

  if (DRY_RUN) {
    console.log(`  ·  ${label.padEnd(38)} ${found.note}`);
    console.log(`     ${found.downloadUrl.slice(0, 100)}`);
    return 'previewed';
  }

  const dataUrl = await toDataUrl(found.downloadUrl);
  const uploaded = await uploadDataUrlToCloudinary({
    dataUrl,
    folder: 'construction/catalogue',
    publicIdPrefix: 'catalogue',
    publicIdSuffix: String(doc._id),
  });
  const url = uploaded?.secureUrl || uploaded?.url || uploaded;
  if (!url || typeof url !== 'string') throw new Error('Cloudinary returned no URL');

  await Model.updateOne(
    { _id: doc._id },
    { $set: { coverImage: url, imageAttribution: found.attribution } },
  );
  console.log(`  ✓  ${label.padEnd(38)} ${found.note}`);
  return 'saved';
}

async function run() {
  const mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUrl) throw new Error('No MongoDB URI found. Check Backend/.env');
  if (!PROVIDERS[PROVIDER]) throw new Error(`Unknown provider "${PROVIDER}"`);
  if (!DRY_RUN && !process.env.CLOUDINARY_CLOUD_NAME) {
    throw new Error('Cloudinary is not configured — cannot store images. Use --dry-run to preview.');
  }

  console.log(`Connecting to: ${mongoUrl.replace(/\/\/.*@/, '//***:***@')}`);
  await mongoose.connect(mongoUrl);
  console.log(`Connected to db=${mongoose.connection.name}`);
  console.log(`Provider: ${PROVIDER}${DRY_RUN ? '   (DRY RUN — nothing will be written)' : ''}`);
  console.log(FORCE ? 'Mode: replacing ALL images\n' : 'Mode: filling in missing images only\n');

  const missing = FORCE
    ? { isDeleted: { $ne: true } }
    : {
      isDeleted: { $ne: true },
      $or: [{ coverImage: '' }, { coverImage: null }, { coverImage: { $exists: false } }],
    };

  const targets = [];
  if (ONLY === 'all' || ONLY === 'categories') {
    targets.push(['Categories', ConstructionCategory, await ConstructionCategory.find(missing).lean()]);
  }
  if (ONLY === 'all' || ONLY === 'services') {
    targets.push(['Services', ConstructionService, await ConstructionService.find(missing).lean()]);
  }

  const tally = { saved: 0, skipped: 0, previewed: 0, failed: 0 };

  for (const [heading, Model, docs] of targets) {
    console.log(`${heading} (${docs.length} to do)`);
    if (!docs.length) console.log('  nothing missing an image');
    for (const doc of docs) {
      try {
        tally[await processOne(doc, Model, doc.name)] += 1;
      } catch (error) {
        tally.failed += 1;
        console.log(`  ✗  ${String(doc.name).padEnd(38)} ${error.message}`);
      }
      // Be a good citizen with someone else's free API.
      await sleep(1200);
    }
    console.log('');
  }

  console.log('='.repeat(56));
  console.log(DRY_RUN
    ? `  previewed: ${tally.previewed}   no result: ${tally.skipped}   errors: ${tally.failed}`
    : `  saved: ${tally.saved}   no result: ${tally.skipped}   errors: ${tally.failed}`);
  console.log('='.repeat(56));

  if (!DRY_RUN && tally.saved > 0 && PROVIDER === 'wikimedia') {
    console.log('\nSome images are CC-BY / CC-BY-SA and REQUIRE crediting the photographer.');
    console.log('The credit is stored on each record in `imageAttribution` — make sure it is');
    console.log('shown wherever the image is displayed at full size.');
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
