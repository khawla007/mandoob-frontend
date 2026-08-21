import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./TenantSuspendedBanner.tsx', import.meta.url), 'utf8');

test('pending workspace copy keeps company onboarding available', () => {
  assert.match(source, /Company setup remains available/u);
  assert.doesNotMatch(source, /awaiting admin approval\. Editing is disabled/u);
  assert.match(source, /workspace is suspended\. Editing is disabled/u);
});
