/**
 * Guard against duplicate keys in the API client objects.
 *
 * JavaScript accepts a duplicate key in an object literal silently — the last
 * one simply wins. In an API client that is a nasty class of bug, because the
 * call still exists, still type-checks, and still runs; it just talks to the
 * wrong endpoint.
 *
 * This actually happened: `contractorApi` ended up with two `listDocuments` and
 * two `addDocument` keys — the contractor's own licences, and a project's
 * documents. The later pair won, so registration step 5 posted to a project
 * route with no project id. The upload succeeded, the document never saved, and
 * the form insisted no document had been added. Nothing errored loudly enough
 * to notice.
 *
 * Run: node scripts/check-api-clients.mjs
 */
import { readFileSync, existsSync } from 'node:fs';

const CLIENTS = [
  'src/modules/construction/contractor/services/contractorApi.js',
  'src/modules/construction/user/services/api.js',
  'src/modules/construction/admin/services/adminApi.js',
];

let failed = 0;

for (const file of CLIENTS) {
  if (!existsSync(file)) {
    console.log(`  –  ${file} (not found, skipped)`);
    continue;
  }

  const source = readFileSync(file, 'utf8');

  // Top-level keys of the exported client sit at exactly two spaces of indent.
  const keys = [...source.matchAll(/^ {2}([a-zA-Z_$][\w$]*)\s*:/gm)].map((m) => m[1]);

  const seen = new Map();
  const duplicates = [];
  for (const key of keys) {
    if (seen.has(key)) duplicates.push(key);
    seen.set(key, (seen.get(key) || 0) + 1);
  }

  const unique = [...new Set(duplicates)];
  if (unique.length) {
    failed += 1;
    console.log(`  ✗  ${file}`);
    for (const key of unique) {
      console.log(`       "${key}" is defined ${seen.get(key)} times — only the last one is reachable`);
    }
  } else {
    console.log(`  ✓  ${file} — ${keys.length} methods, no collisions`);
  }
}

console.log('');
if (failed > 0) {
  console.log(`${failed} API client(s) have duplicate keys. Rename the collisions.`);
  process.exit(1);
}
console.log('All API clients are free of duplicate keys.');
