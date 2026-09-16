import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { blogTermInputSchema } from '@/lib/validation/blog';
const page = readFileSync('src/app/admin/blog/tags/page.tsx', 'utf8');
test('Tags deliberately opts into taxonomy styling with its original authorization and kind', () => {
  assert.match(page, /admin-management-signal taxonomy-tags-workspace admin-taxonomy-workspace/);
  assert.match(page, /await requireRole\('super_admin', 'admin'\)/);
  assert.match(page, /await listBlogTerms\('tag'\)/);
  assert.match(page, /kind="tag" terms=\{terms\}/);
  assert.equal((page.match(/<h1/g) ?? []).length, 1);
  assert.doesNotMatch(page, /signal-kpi|signal-panel|LIVE/);
});
test('Pure tag kind inputs preserve zero, bounded long copy and invalid-input behavior', () => {
  const result = blogTermInputSchema.parse({
    kind: 'tag',
    name: 'س'.repeat(80),
    slug: 'tag-test',
    description: 'و'.repeat(240),
    sortOrder: 0,
  });
  assert.equal(result.kind, 'tag');
  assert.equal(result.sortOrder, 0);
  assert.equal(result.description?.length, 240);
  assert.equal(
    blogTermInputSchema.safeParse({ kind: 'tag', name: '', slug: 'blank', sortOrder: 0 }).success,
    false,
  );
});
