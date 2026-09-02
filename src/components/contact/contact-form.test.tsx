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

test('dark contact controls keep a three-to-one perceivable boundary in every state', () => {
  assert.match(
    publicCss,
    /\.dark \.site-public \.contact-page__form-panel\s*\{[^}]*--contact-control-background:\s*var\(--zinc-100\);[^}]*--contact-control-border:\s*var\(--zinc-500\);/u,
  );
  assert.match(
    publicCss,
    /\.site-public \.contact-form input:not\(\[type='checkbox'\]\),[^]*?border:\s*1px solid var\(--contact-control-border, var\(--public-border-subtle\)\);[^]*?background:\s*var\(--contact-control-background, var\(--public-surface-elevated\)\);/u,
  );
  assert.match(
    publicCss,
    /\.site-public \.contact-form input:not\(\[type='checkbox'\]\):focus-visible,[^]*?border-color:\s*var\(--public-focus-ring\);/u,
  );
  assert.match(
    publicCss,
    /\.site-public \.contact-form input:not\(\[type='checkbox'\]\)\[aria-invalid='true'\],[^]*?\.site-public \.contact-form textarea\[aria-invalid='true'\]\s*\{[^}]*border-color:\s*var\(--public-danger\);/u,
  );

  const panel = oklchLuminance(0.268, 0.008, 45);
  const stateBoundaries = {
    default: oklchLuminance(0.553, 0.011, 45),
    focus: hexLuminance('#ff865f'),
    invalid: hexLuminance('#ffb4a8'),
  };
  for (const [state, boundary] of Object.entries(stateBoundaries)) {
    const ratio = contrast(boundary, panel);
    assert.ok(ratio >= 3, `${state} boundary contrast was ${ratio.toFixed(2)}:1`);
  }
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

function hexLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function oklchLuminance(lightness: number, chroma: number, hue: number) {
  const angle = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: number, second: number) {
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
