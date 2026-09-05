import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveHeaderCollapsed } from './PublicHeaderFrame';

const source = readFileSync(new URL('./PublicHeaderFrame.tsx', import.meta.url), 'utf8');

test('resolves collapse state using hysteresis thresholds', () => {
  assert.equal(resolveHeaderCollapsed(40, false), false);
  assert.equal(resolveHeaderCollapsed(41, false), true);
  assert.equal(resolveHeaderCollapsed(13, true), true);
  assert.equal(resolveHeaderCollapsed(12, true), false);
});

test('keeps the header expanded while focus is inside the contact bar', () => {
  assert.equal(resolveHeaderCollapsed(100, false, true), false);
  assert.equal(resolveHeaderCollapsed(100, true, true), false);
  assert.equal(resolveHeaderCollapsed(100, false, false), true);
});

test('owns the public styling scope on the header frame root', () => {
  assert.match(source, /<header[^>]*className="site-public public-header-frame"/u);
});

test('installs one passive scroll listener and batches updates through animation frames', () => {
  assert.match(
    source,
    /window\.addEventListener\('scroll',\s*handleScroll,\s*\{ passive: true \}\)/u,
  );
  assert.match(source, /requestAnimationFrame\(handleScrollUpdate\)/u);
});

test('checks topbar focus before collapsing and renders hidden-state semantics declaratively', () => {
  assert.match(source, /const frameRef = useRef<HTMLElement>\(null\)/u);
  assert.match(source, /ref=\{frameRef\}/u);
  assert.match(
    source,
    /frameRef\.current\?\.querySelector\(['"]\.public-topbar['"]\)\?\.contains\(document\.activeElement\)/u,
  );
  assert.match(source, /inert:\s*collapsed/u);
  assert.match(source, /'aria-hidden':\s*collapsed/u);
});

test('cancels pending frames and removes the scroll listener on cleanup', () => {
  assert.match(source, /cancelAnimationFrame\(pendingFrame\)/u);
  assert.match(source, /window\.removeEventListener\('scroll',\s*handleScroll\)/u);
});
