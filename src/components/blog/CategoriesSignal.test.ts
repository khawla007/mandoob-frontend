import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const page = readFileSync('src/app/admin/blog/categories/page.tsx', 'utf8');
const manager = readFileSync('src/components/blog/BlogTaxonomyManager.tsx', 'utf8');
const css = readFileSync('src/app/globals.css', 'utf8');
test('Categories opts in independently, preserving authorization and category loader', () => {
  assert.match(page, /admin-management-signal taxonomy-categories-workspace/);
  assert.match(page, /await requireRole\('super_admin', 'admin'\)/);
  assert.match(page, /await listBlogTerms\('category'\)/);
  assert.match(page, /kind="category" terms=\{terms\}/);
  assert.equal((page.match(/<h1/g) ?? []).length, 1);
  for (const route of ['attributes', 'tags']) {
    assert.doesNotMatch(
      readFileSync(`src/app/admin/blog/${route}/page.tsx`, 'utf8'),
      /taxonomy-categories-workspace/,
    );
  }
});
test('Categories has scoped operational panels, field geometry and logical action alignment', () => {
  assert.match(css, /\.admin-taxonomy-workspace \[data-slot='card'\]/);
  assert.match(css, /\.admin-taxonomy-workspace :is\(input, textarea, button\)/);
  assert.match(css, /\.admin-taxonomy-workspace form/);
  assert.doesNotMatch(page, /signal-kpi|signal-panel|LIVE/);
});
test('Taxonomy native form payload, confirmation, failure and pending contracts stay exact', () => {
  for (const name of ['kind', 'name', 'slug', 'sortOrder', 'description'])
    assert.equal((manager.match(new RegExp(`name="${name}"`, 'g')) ?? []).length, 2);
  assert.match(manager, /saveBlogTermAction\(id, formData\)/);
  assert.match(manager, /deleteBlogTermAction\(term.id\)/);
  assert.match(manager, /window.confirm\(t\('deleteConfirm'/);
  assert.match(manager, /if \(!confirmed\) return/);
  assert.match(manager, /if \(!id\) form.reset\(\)/);
  assert.equal((manager.match(/disabled=\{pending\}/g) ?? []).length, 3);
  assert.equal((manager.match(/router.refresh\(\)/g) ?? []).length, 2);
  assert.equal((manager.match(/if \(!result.ok\)/g) ?? []).length, 2);
  assert.match(manager, /aria-live="polite"/);
});

test('Categories eyebrow uses the accessible paired accent token', () => {
  assert.match(css, /\.admin-taxonomy-eyebrow \{[^}]*color: var\(--signal-accent-copy\)/);
});
