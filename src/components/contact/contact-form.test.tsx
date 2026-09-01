import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const contactFormSource = readFileSync(new URL('./ContactForm.tsx', import.meta.url), 'utf8');

test('contact form source publishes no plausible phone fixture or placeholder', () => {
  assert.doesNotMatch(contactFormSource, /placeholder=["{][^\n>]*\+?971/iu);
  assert.doesNotMatch(
    contactFormSource,
    /(?:\+971[\s()-]*\d{1,2}|\b0\d{1,2})[\s()-]*\d{3}[\s-]*\d{4}\b/u,
  );
});

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
