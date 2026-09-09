import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('legacy auth seed refuses execution and directs P2.12 callers to the guarded fixture', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/seed-auth.ts'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(
    result.stderr,
    'scripts/seed-auth.ts is unsupported for P2.12 acceptance.\n' +
      'Use the guarded fixture tool instead:\n' +
      'P2_ACCEPTANCE_LOCAL_ONLY=1 npx tsx scripts/p2-acceptance/fixture.ts setup\n',
  );
});
