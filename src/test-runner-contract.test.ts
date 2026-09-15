import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('the ordinary source-test command uses a portable enumerating runner', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  const runner = readFileSync('scripts/run-source-tests.mjs', 'utf8');

  assert.equal(packageJson.scripts.test, 'node scripts/run-source-tests.mjs');
  assert.match(runner, /readdirSync/);
  assert.match(runner, /--test-concurrency=1/);
  assert.doesNotMatch(packageJson.scripts.test, /\*\*/);
});
