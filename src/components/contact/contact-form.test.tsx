import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

test('contact form passes its isolated client interaction suite', () => {
  const clientCasesPath = resolve(dirname(import.meta.filename), 'contact-form.client-cases.tsx');
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--test-reporter=spec', clientCasesPath],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env,
    },
  );

  assert.equal(
    result.status,
    0,
    `Contact form client suite failed:\n${result.stdout}\n${result.stderr}`,
  );
});
