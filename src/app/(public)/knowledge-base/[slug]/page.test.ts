import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

test('Knowledge Base detail uses editorial hierarchy and safe destinations', () => {
  assert.match(source, /aria-label="Breadcrumb"/u);
  assert.match(source, /<h1/u);
  assert.match(source, /shouldShowTableOfContents/u);
  assert.match(source, /id=\{headingAnchor\(section\.heading\)\}/u);
  assert.match(source, /Related guides/u);
  assert.match(source, /indicative/u);
  assert.match(source, /href="\/knowledge-base"/u);
});

test('Knowledge Base detail keeps true missing semantics and safely serializes JSON-LD once per type', () => {
  assert.match(source, /if \(!article\) notFound\(\)/u);
  assert.match(source, /serializeJsonLd/u);
  assert.equal(source.match(/type="application\/ld\+json"/gu)?.length, 1);
  assert.doesNotMatch(source, /JSON\.stringify\(data\)/u);
});
