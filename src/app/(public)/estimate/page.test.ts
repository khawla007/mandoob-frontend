import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('estimate page renders the five reference regions in order with one h1 and a local hero image', async () => {
  const [page, component] = await Promise.all([
    read('./page.tsx'),
    read('../../../components/estimator/CostEstimator.tsx'),
  ]);
  const regions = [
    'estimator-hero',
    '<CostEstimator',
    'estimator-benefits',
    'estimator-help-limitations',
  ];
  let cursor = -1;
  for (const region of regions) {
    const next = page.indexOf(region === '<CostEstimator' ? region : `id="${region}"`);
    assert.ok(next > cursor, `${region} must follow the previous reference region`);
    cursor = next;
  }
  assert.match(component, /id="estimator-workspace"/u);
  assert.equal((`${page}\n${component}`.match(/<h1\b/gu) ?? []).length, 1);
  assert.match(page, /<Image[\s\S]*src="\/company-setup\/mainland-hero\.webp"/u);
  assert.doesNotMatch(page, /https?:\/\//u);
});

test('estimate workspace exposes nine ordered steps and non-color status semantics', async () => {
  const component = await read('../../../components/estimator/CostEstimator.tsx');
  const labels = [
    'Jurisdiction',
    'Authority',
    'Business activity',
    'Legal structure',
    'Shareholders',
    'Visas',
    'Office',
    'Add-ons',
    'Summary',
  ];
  let cursor = -1;
  for (const label of labels) {
    const next = component.indexOf(`'${label}'`);
    assert.ok(next > cursor, `${label} must remain in the required order`);
    cursor = next;
  }
  assert.match(component, /aria-current/u);
  assert.match(component, /aria-invalid/u);
  assert.match(component, /aria-describedby/u);
  assert.match(component, /aria-live="polite"/u);
  assert.match(component, /data-step-state/u);
  assert.match(component, /Completed|Current|Needs attention/u);
});

test('public estimator uses only the coherent local source and truthful action states', async () => {
  const component = await read('../../../components/estimator/CostEstimator.tsx');
  assert.doesNotMatch(component, /fetch\s*\(/u);
  assert.doesNotMatch(component, /\/api\/v1\/public\/estimate/u);
  assert.match(component, /calculateCatalogEstimate/u);
  assert.match(component, /ESTIMATOR_DRAFT_STORAGE_KEY/u);
  assert.match(component, /Saved on this device/u);
  assert.match(component, /Export unavailable/u);
  assert.match(component, /Continue to application/u);
  assert.match(component, /role="dialog"/u);
  assert.match(component, /event\.key === 'Escape'/u);
  assert.match(component, /resetTriggerRef\.current\?\.focus/u);
  assert.match(component, /id="estimate-jurisdiction"[\s\S]*?tabIndex=\{-1\}/u);
});

test('estimate page removes unsafe reference claims and contact proof', async () => {
  const [page, component] = await Promise.all([
    read('./page.tsx'),
    read('../../../components/estimator/CostEstimator.tsx'),
  ]);
  const source = `${page}\n${component}`;
  for (const forbidden of [
    /45\+/u,
    /real[- ]time pricing/iu,
    /accurate(?:\s*&\s*| and )updated/iu,
    /no hidden (?:fee|charge)/iu,
    /2,000\+/u,
    /4\.9\/5/u,
    /google reviews/iu,
    /whatsapp/iu,
    /free consultation/iu,
    /get exact quote/iu,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test('estimate CSS preserves reference desktop proportions, themes, focus, reduced motion, and overflow safety', async () => {
  const css = await read('../public-theme.css');
  assert.match(css, /--accent-ink:\s*var\(--accent\)/u);
  assert.match(css, /\.site-public #estimator \.eyebrow\s*\{[^}]*color:\s*var\(--zinc-500\)/u);
  assert.match(
    css,
    /\.site-public #estimator \.eyebrow--accent\s*\{[^}]*color:\s*var\(--zinc-500\)/u,
  );
  assert.match(css, /\.site-public \.estimator-workspace__grid/u);
  assert.match(
    css,
    /grid-template-columns:\s*minmax\(180px,\s*0\.72fr\)\s+minmax\(0,\s*1\.8fr\)\s+minmax\(300px,\s*1fr\)/u,
  );
  assert.match(css, /\.dark \.site-public \.estimator/u);
  assert.match(css, /\.estimator[\s\S]*:focus-visible/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /overflow-wrap:\s*anywhere/u);
  assert.match(
    css,
    /\.site-public \.estimator-hero__expectations li > span\s*\{[^}]*color:\s*var\(--public-cta-background\)/u,
  );
  assert.match(
    css,
    /\.site-public \.estimator-benefits li > span\s*\{[^}]*color:\s*var\(--public-cta-background\)/u,
  );
});
