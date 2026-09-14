import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public-theme.css', import.meta.url), 'utf8');

test('Blog index uses explicit read/search states and semantic pagination boundaries', () => {
  assert.match(source, /resolveBlogIndex/u);
  assert.match(source, /status === 'unavailable'/u);
  assert.match(source, /status === 'empty'/u);
  assert.match(source, /No matching articles/u);
  assert.match(source, /currentPage === 1 \? \([\s\S]*?<span/u);
  assert.match(source, /currentPage === totalPages \? \([\s\S]*?<span/u);
  assert.doesNotMatch(source, /aria-disabled/u);
  assert.doesNotMatch(source, /Updated[\s\S]*by editors/u);
});

test('Blog featured media keeps its keyboard focus ring inside the clipped card', () => {
  assert.match(
    css,
    /\.site-public \.blog-featured-card__media:focus-visible\s*\{[^}]*outline-offset:\s*-3px/u,
  );
});

test('Blog hero gradient remains contrast-safe across the editorial paper', () => {
  assert.match(
    css,
    /\.site-public \.blog-hero\s*\{[\s\S]*color-mix\(in oklch, var\(--accent-soft\) 18%, white\) 100%/u,
  );
  assert.match(
    css,
    /\.site-public \.blog-hero \.kb-editorial-breadcrumb(?:,\s*\.site-public \.blog-hero \.kb-editorial-breadcrumb a)?\s*\{[^}]*color:\s*var\(--blog-hero-muted\)/u,
  );
});
