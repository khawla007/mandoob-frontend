import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const contactFormSource = readFileSync(new URL('./ContactForm.tsx', import.meta.url), 'utf8');
const legalRouteSource = readFileSync(
  new URL('../../app/(public)/legal/[slug]/page.tsx', import.meta.url),
  'utf8',
);
const publicCss = readFileSync(
  new URL('../../app/(public)/public-theme.css', import.meta.url),
  'utf8',
);

test('contact form source publishes no plausible phone fixture or placeholder', () => {
  assert.doesNotMatch(contactFormSource, /placeholder=["{][^\n>]*\+?971/iu);
  assert.doesNotMatch(
    contactFormSource,
    /(?:\+971[\s()-]*\d{1,2}|\b0\d{1,2})[\s()-]*\d{3}[\s-]*\d{4}\b/u,
  );
});

test('production client graph cannot select or statically import a synthetic adapter', () => {
  assert.match(contactFormSource, /process\.env\.NODE_ENV === 'development'/u);
  assert.match(contactFormSource, /await import\('@\/lib\/public-contact\/demo-adapter'\)/u);
  assert.doesNotMatch(
    contactFormSource,
    /import\s*\{[^}]*createSyntheticContactAdapter[^}]*\}\s*from\s*['"]@\/lib\/public-contact\/demo-adapter['"]/u,
  );
  assert.match(
    contactFormSource,
    /import \{ productionContactAdapter \} from '@\/lib\/public-contact\/production-adapter'/u,
  );
});

test('consent links resolve through the published legal CMS route', () => {
  assert.match(contactFormSource, /<Link href="\/legal\/privacy"/u);
  assert.match(contactFormSource, /<Link href="\/legal\/terms"/u);
  assert.doesNotMatch(contactFormSource, /<Link href="\/(?:privacy|terms)"/u);
  assert.match(legalRouteSource, /resolveLegalCmsPage/u);
  assert.match(legalRouteSource, /getPublishedCmsPageBySlug/u);
});

test('contact form CSS stays within the reference density budget', () => {
  const formCss = publicCss.slice(
    publicCss.indexOf('/* ---------- P1.05 CONTACT FORM ---------- */'),
    publicCss.indexOf('/* ---------- About page P1.05 ---------- */'),
  );
  assert.match(formCss, /\.site-public \.contact-form\s*\{[^}]*gap:\s*14px/u);
  assert.match(formCss, /\.site-public \.contact-form__grid\s*\{[^}]*gap:\s*12px/u);
  assert.match(formCss, /\.site-public \.contact-form textarea\s*\{[^}]*min-block-size:\s*96px/u);
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
