// Syntax check (node --check) for every module plus a static check that every named import
// exists as an export of the imported module. Run with: node tests/check-syntax.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.js') || f.endsWith('.mjs')) files.push(p);
  }
})(join(root, 'js'));
for (const f of readdirSync(join(root, 'tests'))) if (f.endsWith('.mjs')) files.push(join(root, 'tests', f));

let problems = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { problems++; console.log(`SYNTAX ${relative(root, f)}\n${e.stderr}`); }
}

const exportsOf = new Map();
function exportsFor(file) {
  if (exportsOf.has(file)) return exportsOf.get(file);
  const src = readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const t = part.trim(); if (!t) continue;
      const as = t.split(/\s+as\s+/); names.add((as[1] || as[0]).trim());
    }
  }
  exportsOf.set(file, names);
  return names;
}

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const target = resolve(dirname(f), m[2]);
    let names;
    try { names = exportsFor(target); } catch { problems++; console.log(`MISSING MODULE ${relative(root, f)} -> ${m[2]}`); continue; }
    for (const part of m[1].split(',')) {
      const t = part.trim(); if (!t) continue;
      const name = t.split(/\s+as\s+/)[0].trim();
      if (!names.has(name)) { problems++; console.log(`MISSING EXPORT ${relative(root, f)}: '${name}' not exported by ${m[2]}`); }
    }
  }
}
console.log(`${files.length} files checked, ${problems} problem(s)`);
process.exit(problems ? 1 : 0);
