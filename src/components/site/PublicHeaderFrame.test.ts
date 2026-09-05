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

test('owns the public styling scope on the header frame root', () => {
  assert.match(source, /<header className="site-public public-header-frame"/u);
});

test('installs one passive scroll listener and batches updates through animation frames', () => {
  assert.match(
    source,
    /window\.addEventListener\('scroll',\s*handleScroll,\s*\{ passive: true \}\)/u,
  );
  assert.match(source, /requestAnimationFrame\(handleScrollUpdate\)/u);
});

test('cancels pending frames and removes the scroll listener on cleanup', () => {
  assert.match(source, /cancelAnimationFrame\(pendingFrame\)/u);
  assert.match(source, /window\.removeEventListener\('scroll',\s*handleScroll\)/u);
});
