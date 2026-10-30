import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const globLiterals = { '[': '[[]', ']': '[]]', '*': '[*]', '?': '[?]' };

export function escapeTestPattern(path) {
  return path.replace(/[[\]*?]/gu, (character) => globLiterals[character]);
}

export function enumerateSourceTestFiles(root = 'src') {
  return readdirSync(root, { encoding: 'utf8', recursive: true })
    .filter((path) => path.endsWith('.test.ts'))
    .map((path) => join(root, path))
    .sort();
}

export function partitionTestPatterns(patterns, batchSize = 128) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new RangeError('batchSize must be a positive safe integer');
  }
  const isIsolatedPattern = (pattern) =>
    pattern.replaceAll('\\', '/').endsWith('/security/scan-file.test.ts');
  const isolatedPatterns = patterns.filter(isIsolatedPattern);
  const regularPatterns = patterns.filter((pattern) => !isIsolatedPattern(pattern));
  const batches = isolatedPatterns.map((pattern) => [pattern]);
  for (let index = 0; index < regularPatterns.length; index += batchSize) {
    batches.push(regularPatterns.slice(index, index + batchSize));
  }
  return batches;
}

function main() {
  const testFiles = enumerateSourceTestFiles();
  const testPatterns = testFiles.map(escapeTestPattern);

  if (testFiles.length === 0) {
    console.error('No source test files found.');
    process.exit(1);
  }

  if (process.argv.includes('--list-patterns')) {
    process.stdout.write(`${JSON.stringify(testPatterns)}\n`);
    return;
  }

  for (const batch of partitionTestPatterns(testPatterns)) {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--conditions=react-server', '--test', '--test-concurrency=1', ...batch],
      { stdio: 'inherit' },
    );

    if (result.error) {
      console.error(result.error.message);
      process.exit(1);
    }
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
