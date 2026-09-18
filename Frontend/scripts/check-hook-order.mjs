/**
 * Find React hooks called AFTER an early return.
 *
 * React counts hooks per render. A `useState` below an `if (loading) return`
 * runs on the loaded render but not the loading one, so the count changes
 * between renders and React throws "Rendered more hooks than during the
 * previous render" — the page goes blank the moment the fetch resolves.
 *
 * It is easy to introduce when adding a feature to an existing page: the new
 * state naturally goes next to the data it belongs to, which is usually below
 * the loading guard.
 *
 * Run: node scripts/check-hook-order.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src/modules/construction';
const HOOK = /\b(useState|useEffect|useCallback|useMemo|useRef|useReducer|useContext|useLayoutEffect)\s*\(/;
// A bare `return` at two-space indent inside a component body.
const EARLY_RETURN = /^ {2}return\s*(\(|null|<)/;
// The component's own final return sits at the end; ignore returns inside JSX
// callbacks, which are indented further.

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.jsx')) files.push(full);
  }
};
walk(ROOT);

let problems = 0;

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');

  // Track each top-level component: from `export default function` / `function X(`
  // at zero indent, to the next zero-indent `}`.
  let inComponent = false;
  let sawEarlyReturn = 0;

  lines.forEach((line, i) => {
    if (/^(export default )?function [A-Z]/.test(line)) {
      inComponent = true;
      sawEarlyReturn = 0;
      return;
    }
    if (inComponent && /^}/.test(line)) { inComponent = false; return; }
    if (!inComponent) return;

    if (EARLY_RETURN.test(line)) {
      // Only counts as "early" if more component code follows before the close.
      sawEarlyReturn = i + 1;
      return;
    }

    if (sawEarlyReturn && HOOK.test(line) && !line.trim().startsWith('*')
      && !line.trim().startsWith('//')) {
      problems += 1;
      console.log(`  X  ${file}:${i + 1}`);
      console.log(`       ${line.trim().slice(0, 74)}`);
      console.log(`       called after an early return on line ${sawEarlyReturn}`);
    }
  });
}

console.log('');
if (problems > 0) {
  console.log(`${problems} hook(s) sit below an early return. Move them up with the others.`);
  process.exit(1);
}
console.log(`Checked ${files.length} components — every hook runs before any early return.`);
