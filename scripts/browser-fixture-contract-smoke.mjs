import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Regression for the TEST harness, not a replacement for mounted UI tests.
// Playwright treats an async waitForFunction predicate's Promise as truthy;
// a false resolution therefore does not keep polling for real readiness.
const files = ['lib/browser-fixture.mjs', 'lib/admin-fixture.mjs', 'lib/panel-fixture.mjs', 'industrial-admin-ui-smoke.mjs', 'industrial-panel-ui-smoke.mjs', 'meters-schneider-admin-ui-smoke.mjs', 'meters-schneider-ui-smoke.mjs', 'msr127-panel-ui-smoke.mjs', 'grafcet-geometry-lifecycle-ui-smoke.mjs', 'panel3d-profile.mjs']
for (const file of files) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  assert.ok(!/\.waitForFunction\(\s*async\b/.test(source), file + ': preload modules and use a synchronous readiness predicate')
  console.log('PASS — ' + file + ': no async-Promise readiness false positive')
}
console.log(`\nPASS — ${files.length} browser-fixture readiness contracts; actual browser suites remain required`)
