import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const source = (path: string) => readFileSync(path, 'utf8');
test('Blog collection and editors opt in individually without changing authorization or composition', () => {
  for (const path of [
    'src/app/admin/blog/page.tsx',
    'src/app/admin/blog/new/page.tsx',
    'src/app/admin/blog/[id]/page.tsx',
  ]) {
    const page = source(path);
    assert.match(page, /admin-management-signal blog-management-workspace/);
    assert.match(page, /await requireRole\('super_admin', 'admin'\)/);
    assert.equal((page.match(/<h1/g) ?? []).length, 1);
    assert.doesNotMatch(page, /signal-kpi|signal-panel|LIVE/);
  }
  const page = source('src/app/admin/blog/page.tsx');
  assert.match(page, /const POSTS_PER_PAGE = 8/);
  assert.match(page, /const currentPage = Math.min\(readPage\(sp\), totalPages\)/);
  assert.match(page, /posts.slice\(start, start \+ POSTS_PER_PAGE\)/);
  assert.match(source('src/app/admin/blog/new/page.tsx'), /post=\{null\} terms=\{terms\}/);
  assert.match(source('src/app/admin/blog/[id]/page.tsx'), /if \(!post\) notFound\(\)/);
});
test('Blog table uses one named keyboard scroll region, readable identities and original actions', () => {
  const table = source('src/components/blog/BlogPostsTable.tsx');
  assert.match(table, /<Table scrollAreaLabel=\{t\('caption'\)\}/);
  assert.doesNotMatch(table, /text-right|truncate/);
  assert.equal((table.match(/TableHead className="text-start"/g) ?? []).length, 4);
  assert.match(table, /formatDateTime\(post.publishedAt, locale\)/);
  assert.match(table, /post.status === 'published'/);
  assert.match(table, /action=\{deletePost.bind\(null, post.id\)\}/);
  assert.match(table, /await deleteBlogPostAction\(id\)/);
});
test('Rich editor naming is optional and supplied only by inspected editorial consumers', () => {
  const rich = source('src/components/blog/BlogEditorContent.tsx');
  assert.match(rich, /contentLabel\?: string/);
  assert.match(rich, /contentLabel\s*\?\s*\{/);
  assert.match(rich, /'aria-label': contentLabel/);
  assert.match(source('src/components/blog/BlogEditor.tsx'), /contentLabel=\{t\('content'\)\}/);
  assert.match(source('src/components/pages/PageEditor.tsx'), /contentLabel=\{t\('content'\)\}/);
  assert.match(rich, /immediatelyRender: false/);
  assert.match(rich, /onMouseDown/);
  assert.match(rich, /name="contentJson"/);
  assert.match(rich, /name="contentHtml"/);
});
test('Blog controls and panel bounds are scoped, leaving checkboxes at their original size', () => {
  const css = source('src/app/globals.css');
  assert.match(css, /\.admin-editorial-workspace \[data-slot='card'\]/);
  assert.match(css, /input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\)/);
  assert.match(css, /\.admin-editorial-workspace \.blog-editor-content/);
  const editor = source('src/components/blog/BlogEditor.tsx');
  assert.match(editor, /saveBlogPostAction\(post\?.id \?\? null, formData\)/);
  assert.match(editor, /\['draft', 'scheduled', 'published', 'archived'\]/);
  assert.match(editor, /maxLength=\{320\}/);
  assert.match(editor, /maxLength=\{70\}/);
  assert.match(editor, /maxLength=\{170\}/);
  assert.match(editor, /setMessage\(t\('saveError'\)\)/);
});

test('Blog table keyboard focus stays visible inside its clipped border', () => {
  assert.match(
    source('src/app/globals.css'),
    /\.admin-editorial-workspace \[data-slot='table-container'\]:focus-visible\s*\{[^}]*outline: 2px solid var\(--ring\);[^}]*outline-offset: -2px;/,
  );
});
