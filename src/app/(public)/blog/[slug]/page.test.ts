import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

test('Blog detail distinguishes unavailable and missing states', () => {
  assert.match(source, /resolveBlogDetail/u);
  assert.match(source, /status === 'missing'[\s\S]*notFound\(\)/u);
  assert.match(source, /status === 'unavailable'/u);
});

test('Blog detail renders safe Article JSON-LD and editorial navigation', () => {
  assert.match(source, /buildBlogArticleJsonLd/u);
  assert.match(source, /serializeJsonLd/u);
  assert.equal(source.match(/type="application\/ld\+json"/gu)?.length, 1);
  assert.match(source, /aria-label="Breadcrumb"/u);
  assert.match(source, /href="\/estimate"/u);
  assert.match(source, /href="\/blog"/u);
});
