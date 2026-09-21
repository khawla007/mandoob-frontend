import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { blogTermInputSchema } from '@/lib/validation/blog';
const page = readFileSync('src/app/admin/blog/attributes/page.tsx', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');
test('Attributes deliberately opts into the shared inspected taxonomy workspace', () => {
  assert.match(
    page,
    /admin-management-signal taxonomy-attributes-workspace admin-taxonomy-workspace/,
  );
  assert.match(page, /await requireRole\('super_admin', 'admin'\)/);
  assert.match(page, /await listBlogTerms\('attribute'\)/);
  assert.match(page, /kind="attribute" terms=\{terms\}/);
  assert.equal((page.match(/<h1/g) ?? []).length, 1);
  assert.doesNotMatch(
    readFileSync('src/app/admin/blog/tags/page.tsx', 'utf8'),
    /taxonomy-attributes-workspace/,
  );
});
test('Shared taxonomy styles stay gated and preserve accessible instrument-free form surfaces', () => {
  assert.match(css, /\.admin-taxonomy-workspace \[data-slot='card'\]/);
  assert.match(css, /\.admin-taxonomy-eyebrow \{[^}]*color: var\(--signal-accent-copy\)/);
  assert.match(css, /\.dark \.admin-taxonomy-workspace button\[data-variant='destructive'\]/);
  assert.doesNotMatch(page, /signal-kpi|signal-panel|LIVE/);
});
test('Pure attribute inputs preserve supported kind and zero/large/long-copy validation', () => {
  for (const sortOrder of [0, 10000]) {
    const result = blogTermInputSchema.parse({
      kind: 'attribute',
      name: 'س'.repeat(80),
      slug: 'long-attribute',
      description: 'و'.repeat(240),
      sortOrder,
    });
    assert.equal(result.kind, 'attribute');
    assert.equal(result.sortOrder, sortOrder);
    assert.equal(result.description?.length, 240);
  }
  assert.equal(
    blogTermInputSchema.safeParse({ kind: 'attribute', name: '', slug: 'blank', sortOrder: 0 })
      .success,
    false,
  );
});
