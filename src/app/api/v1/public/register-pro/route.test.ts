import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { POST } from './route';

test('legacy public PRO registration cannot create a company or user', async () => {
  const response = await POST();
  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), {
    ok: false,
    code: 'GONE',
    error: 'Public PRO registration is no longer available',
  });
});

test('legacy public PRO registration UI redirects to the localized contact page', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/app/(auth)/register/pro/page.tsx'),
    'utf8',
  );
  assert.match(page, /redirect\('\/contact'\)/u);
  assert.doesNotMatch(page, /invite|email|RegisterProForm/iu);
  assert.equal(existsSync(join(process.cwd(), 'src/components/auth/RegisterProForm.tsx')), false);
});

test('public sales calls to action no longer link to self-registration', () => {
  for (const file of [
    'src/components/site/pro/ProHeroSection.tsx',
    'src/components/site/pro/ProFinalCtaSection.tsx',
    'src/app/(public)/pricing/page.tsx',
    'src/app/(public)/contact/page.tsx',
  ]) {
    assert.doesNotMatch(readFileSync(join(process.cwd(), file), 'utf8'), /\/register\/pro/u);
  }
});
