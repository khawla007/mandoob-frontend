import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

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
