import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const explorer = readFileSync(
  new URL('../../../components/knowledge-base/KnowledgeBaseExplorer.tsx', import.meta.url),
  'utf8',
);
const css = readFileSync(new URL('../public-theme.css', import.meta.url), 'utf8');

test('Knowledge Base hero uses the approved local asset and search-first reference hierarchy', () => {
  assert.match(page, /KnowledgeBaseExplorer/u);
  assert.match(explorer, /className="kb-reference-hero"/u);
  assert.match(explorer, /\/hero\/knowledge-base-research\.webp/u);
  assert.match(explorer, /<h1[\s\S]*<form[\s\S]*role="search"[\s\S]*Suggested searches/u);
});

test('Knowledge Base search is labelled, URL-backed, and restores active values', () => {
  assert.match(explorer, /label htmlFor="knowledge-query"/u);
  assert.match(explorer, /name="q"/u);
  assert.match(explorer, /defaultValue=\{normalizedQuery\}/u);
  assert.match(explorer, /new URLSearchParams/u);
  assert.match(explorer, /aria-live="polite"/u);
});

test('Knowledge Base hero has scoped natural-height desktop and preserved narrow rules', () => {
  const desktop = css.match(/\.site-public \.kb-reference-hero__inner\s*\{[^}]*\}/u)?.[0];
  assert.ok(desktop);
  assert.match(desktop, /min-block-size:\s*500px/u);
  assert.doesNotMatch(desktop, /height:/u);
  assert.match(css, /@media \(max-width: 639px\)[\s\S]*\.kb-reference-hero__copy/u);
});

test('Knowledge Base primary CTA inherits accessible shared button colors', () => {
  assert.match(
    css,
    /\.site-public \.btn--accent\s*\{[^}]*background:\s*var\(--public-cta-background\)/u,
  );
  assert.doesNotMatch(css, /\.site-public \.kb-reference-hero \.btn--accent(?::hover)?\s*\{/u);
});
