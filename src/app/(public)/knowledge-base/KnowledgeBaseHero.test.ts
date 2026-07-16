import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const page = readFileSync(join(root, 'src/app/(public)/knowledge-base/page.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/app/(public)/public-theme.css'), 'utf8');

test('Knowledge Base hero uses its own modifier, overlay, and background asset', () => {
  assert.match(page, /className="hero hero--knowledge-base"/);
  assert.match(page, /className="hero__overlay" aria-hidden="true"/);
  assert.match(css, /url\('\/hero\/knowledge-base-research\.webp'\)/);
});

test('Knowledge Base hero preserves CTAs and ordered in-hero metrics', () => {
  const hero = page.slice(
    page.indexOf('{/* ============ HERO'),
    page.indexOf('{/* ============ FEATURED'),
  );
  assert.match(
    hero,
    /Estimate setup cost[\s\S]*Browse topics[\s\S]*hero__rule[\s\S]*hero__metrics/,
  );

  const metrics = hero.slice(hero.indexOf('hero__metrics'));
  const labels = ['guides', 'topics', 'free zones', 'updates'];
  let priorIndex = -1;
  for (const label of labels) {
    const index = metrics.indexOf(label);
    assert.ok(index > priorIndex, `${label} must remain present and ordered`);
    priorIndex = index;
  }
});

test('Knowledge Base hero has scoped natural-height responsive rules', () => {
  const desktopBlock = css.match(/\.site-public \.hero--knowledge-base\s*\{[^}]*\}/)?.[0];
  assert.ok(desktopBlock, 'desktop Knowledge Base hero block must exist');
  assert.match(desktopBlock, /padding-block:\s*98px/);
  assert.doesNotMatch(desktopBlock, /(?:height|max-height):/);

  const desktopIndex = css.indexOf(desktopBlock);
  const mobileCss = css.slice(css.indexOf('@media (max-width: 767px)', desktopIndex + desktopBlock.length));
  const mobileBlock = mobileCss.match(/\.site-public \.hero--knowledge-base\s*\{[^}]*\}/)?.[0];
  assert.ok(mobileBlock, 'mobile Knowledge Base hero block must exist');
  assert.match(mobileBlock, /padding-block:\s*var\(--sp-5\)/);
});

test('Knowledge Base primary CTA has scoped accessible normal and hover colors', () => {
  assert.match(css, /\.site-public \.hero--knowledge-base \.btn--accent\s*\{[^}]*background:\s*oklch\(0\.57 0\.19 38\)/);
  assert.match(css, /\.site-public \.hero--knowledge-base \.btn--accent:hover\s*\{[^}]*background:\s*oklch\(0\.52 0\.17 38\)/);
});
