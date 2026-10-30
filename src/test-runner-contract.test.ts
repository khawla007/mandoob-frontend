import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  enumerateSourceTestFiles,
  escapeTestPattern,
  partitionTestPatterns,
} from '../scripts/run-source-tests.mjs';

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

test('the source-test runner bounds each Node process to avoid long-run resource exhaustion', () => {
  const patterns = Array.from({ length: 259 }, (_, index) => `src/example-${index}.test.ts`);
  const batches = partitionTestPatterns(patterns, 128);

  assert.deepEqual(
    batches.map((batch: string[]) => batch.length),
    [128, 128, 3],
  );
  assert.deepEqual(batches.flat(), patterns);
});

test('socket scanner tests run in a dedicated Node test process', () => {
  const patterns = [
    'src/lib/security/pro-lifecycle-plaintext-absence.test.ts',
    'src/lib/security/scan-file.test.ts',
    'src/lib/settings/provider-state.test.ts',
  ];

  assert.deepEqual(partitionTestPatterns(patterns, 128), [
    [patterns[1]],
    [patterns[0], patterns[2]],
  ]);
});

test('socket scanner isolation recognizes Windows-style test paths', () => {
  const patterns = [
    String.raw`src\lib\security\pro-lifecycle-plaintext-absence.test.ts`,
    String.raw`src\lib\security\scan-file.test.ts`,
    String.raw`src\lib\settings\provider-state.test.ts`,
  ];

  assert.deepEqual(partitionTestPatterns(patterns, 128), [
    [patterns[1]],
    [patterns[0], patterns[2]],
  ]);
});
