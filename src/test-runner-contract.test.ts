import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { enumerateSourceTestFiles, escapeTestPattern } from '../scripts/run-source-tests.mjs';

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

test('the source-test runner escapes literal route brackets before passing Node glob patterns', () => {
  const patterns = enumerateSourceTestFiles().map(escapeTestPattern) as string[];
  const files = readdirSync('src', { encoding: 'utf8', recursive: true })
    .filter((path) => path.endsWith('.test.ts'))
    .map((path) => join('src', path))
    .sort();

  assert.equal(patterns.length, files.length);
  assert.equal(
    patterns.find((path) => path.includes('slug')),
    'src/app/(public)/[[]slug[]]/page.test.ts',
  );
  assert.deepEqual(
    patterns,
    files.map((path) =>
      path.replace(
        /[[\]*?]/gu,
        (character) => ({ '[': '[[]', ']': '[]]', '*': '[*]', '?': '[?]' })[character]!,
      ),
    ),
  );
});
