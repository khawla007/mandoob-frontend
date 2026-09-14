import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public-theme.css', import.meta.url), 'utf8');

test('Knowledge Base renders the seven reference regions in exact order', () => {
  const markers = [
    'KB-REGION-1',
    'KB-REGION-2',
    'KB-REGION-3',
    'KB-REGION-4',
    'KB-REGION-5',
    'KB-REGION-6',
    'KB-REGION-7',
  ];
  let previous = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker);
    assert.ok(index > previous, `${marker} must exist in order`);
    previous = index;
  }
});

test('Knowledge Base uses real discovery, native FAQ, safe support, and no-write newsletter', () => {
  assert.match(source, /KnowledgeBaseExplorer/u);
  assert.match(source, /<details/u);
  assert.match(source, /href="\/contact"/u);
  assert.match(source, /WhatsApp[\s\S]*Unavailable/u);
  assert.match(source, /KnowledgeBaseNewsletter/u);
  assert.doesNotMatch(
    source,
    /45\+|Monthly|90 seconds|Popular Guides|Expert Support|Always Updated/u,
  );
});

test('Knowledge Base guide media keeps its focus ring inside the clipped card', () => {
  assert.match(
    css,
    /\.site-public \.kb-guide-card__media:focus-visible\s*\{[^}]*outline-offset:\s*-3px/u,
  );
});
