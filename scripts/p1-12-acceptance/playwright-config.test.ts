import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('acceptance config cannot bypass the exact app launch', () => {
  const source = readFileSync('playwright.p1-12.config.ts', 'utf8');
  assert.doesNotMatch(source, /P112_SKIP_WEB_SERVER/u);
  assert.match(source, /reuseExistingServer:\s*false/u);
  assert.match(source, /run-app\.ts --mode/u);
});
