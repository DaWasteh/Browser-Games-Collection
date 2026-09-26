// Logiktest für die Browser Games Collection (CI: alle */smoke-test.cjs).
// Führt die Unit-Tests des Spiels (Generatoren, Items, Quests, Speicherstände, Licht-Baking)
// sowie die Syntax-/Import-Prüfung aller ES-Module aus. Die Browser-Tests (tests/smoke.mjs,
// tests/soak.mjs) laufen separat, siehe README.
'use strict';
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

for (const script of ['tests/run-tests.mjs', 'tests/check-syntax.mjs']) {
  execFileSync(process.execPath, [join(__dirname, script)], { cwd: __dirname, stdio: 'inherit' });
}
console.log('gloamdeep smoke ok (Unit-Tests + Syntax-/Importprüfung)');
