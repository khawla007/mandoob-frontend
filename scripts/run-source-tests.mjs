import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const testFiles = readdirSync('src', { encoding: 'utf8', recursive: true })
  .filter((path) => path.endsWith('.test.ts'))
  .map((path) => join('src', path))
  .sort();

if (testFiles.length === 0) {
  console.error('No source test files found.');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--conditions=react-server', '--test', '--test-concurrency=1', ...testFiles],
  { stdio: 'inherit' },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
