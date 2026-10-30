import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

test('Playwright loads and lists the complete reduced auth spec', () => {
  const output = execFileSync(
    resolve('node_modules/.bin/playwright'),
    ['test', '--config', 'playwright.p3-13-auth.config.ts', '--list'],
    { encoding: 'utf8' },
  );
  assert.match(output, /Total: 7 tests in 1 file/u);
  assert.doesNotMatch(output, /exports is not defined|No tests found/u);
});
