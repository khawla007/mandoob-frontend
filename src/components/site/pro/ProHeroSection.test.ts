import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const component = readFileSync(
  join(root, 'src/components/site/pro/ProHeroSection.tsx'),
  'utf8',
);
const css = readFileSync(join(root, 'src/app/(public)/public-theme.css'), 'utf8');

test('PRO hero uses a dedicated page modifier and background asset', () => {
  assert.match(component, /className="hero hero--pro"/);
  assert.match(css, /\.site-public \.hero--pro\s*\{/);
  assert.match(css, /url\('\/hero\/pro-firm-operations\.webp'\)/);
});

test('PRO hero has compact desktop and mobile spacing without a fixed height', () => {
  assert.match(
    css,
    /\.site-public \.hero--pro\s*\{(?:(?!})[\s\S])*padding-block:\s*var\(--sp-7\)/,
  );
  assert.match(
    css,
    /@media \(max-width: 767px\)[\s\S]*?\.site-public \.hero--pro\s*\{[^}]*padding-block:\s*var\(--sp-6\)/,
  );
  assert.doesNotMatch(
    css,
    /\.site-public \.hero--pro\s*\{(?:(?!})[\s\S])*(?:height|max-height):/,
  );
});
