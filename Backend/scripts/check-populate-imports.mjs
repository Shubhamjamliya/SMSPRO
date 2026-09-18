/**
 * Find `.populate()` calls whose target model the file never imports.
 *
 * Mongoose resolves a populate by MODEL NAME at call time. If nothing has
 * imported that model yet, it throws MissingSchemaError. Whether it works then
 * depends on which other module happened to be imported first — so it can pass
 * every test and still 500 in production on a cold route.
 *
 * Walks each service, collects the ref targets of the fields it populates, and
 * reports any whose model file is not imported there.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SERVICES = 'src/modules/construction/services';
const MODELS = 'src/modules/construction/models';

// field name -> model name, read from the model files themselves.
const refByField = new Map();
for (const f of readdirSync(MODELS)) {
  const src = readFileSync(join(MODELS, f), 'utf8');
  for (const m of src.matchAll(/(\w+)\s*:\s*\{[^}]*?ref:\s*'([\w]+)'/gs)) {
    refByField.set(m[1], m[2]);
  }
  // `field: { type: ..., ref: 'X' }` inside arrays too
  for (const m of src.matchAll(/(\w+):\s*\[\s*\{[^\]]*?ref:\s*'(\w+)'/gs)) {
    refByField.set(m[1], m[2]);
  }
}

// model name -> the file that exports it
const fileByModel = new Map();
for (const f of readdirSync(MODELS)) {
  const src = readFileSync(join(MODELS, f), 'utf8');
  for (const m of src.matchAll(/export const (\w+)\s*=\s*mongoose\.models/g)) {
    fileByModel.set(m[1], f);
  }
}

let problems = 0;
for (const f of readdirSync(SERVICES).filter((x) => x.endsWith('.js'))) {
  const src = readFileSync(join(SERVICES, f), 'utf8');
  const populated = new Set(
    [...src.matchAll(/\.populate\(\s*['"](\w+)['"]/g)].map((m) => m[1]),
  );
  // object form: .populate({ path: 'x', ... })
  for (const m of src.matchAll(/path:\s*['"](\w+)['"]/g)) populated.add(m[1]);

  const missing = [];
  for (const field of populated) {
    const model = refByField.get(field);
    if (!model) continue;                      // not a ref we can resolve
    const modelFile = fileByModel.get(model);
    if (!modelFile) continue;                  // model lives outside this module
    const importedHere = new RegExp(`from '\\.\\./models/${modelFile.replace('.', '\\.')}'`).test(src)
      || src.includes(`{ ${model} }`);
    if (!importedHere) missing.push(`${field} -> ${model} (${modelFile})`);
  }

  if (missing.length) {
    problems += 1;
    console.log(`  X  ${f}`);
    missing.forEach((m) => console.log(`       populates ${m} but never imports it`));
  }
}

console.log('');
console.log(problems === 0
  ? 'Every populated model is imported where it is used.'
  : `${problems} service(s) populate a model they do not import.`);
process.exit(problems ? 1 : 0);
