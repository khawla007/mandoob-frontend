import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { clampAdminPage, createHeroState, pageHref, serializeHeroState, updateHeroField } from './admin-page-state';

test('pagination parses and clamps invalid and overflowing page values', () => {
  assert.equal(clampAdminPage(undefined, 17, 8), 1);
  assert.equal(clampAdminPage('-3', 17, 8), 1);
  assert.equal(clampAdminPage('99', 17, 8), 3);
  assert.equal(pageHref(1), '/admin/pages');
  assert.equal(pageHref(3), '/admin/pages?page=3');
});

test('hero state updates immutably and serializes only action-consumed fields', () => {
  const initial = createHeroState({ heading: 'Welcome', overlayOpacity: 0.25 }, 'media-1', '/hero.jpg');
  const changed = updateHeroField(initial, 'headingAlignment', 'left');
  assert.notEqual(changed, initial);
  assert.equal(initial.settings.headingAlignment, 'center');
  assert.deepEqual(JSON.parse(serializeHeroState(changed)), {
    backgroundColor: '#ffffff', overlayColor: '#000000', overlayOpacity: 0.25,
    headingAlignment: 'left', textAlignment: 'center', buttonAlignment: 'center',
    backgroundImageUrl: '/hero.jpg', heading: 'Welcome', text: null,
    buttonLabel: null, buttonHref: null, minHeight: '', maxWidth: '', padding: '', margin: '',
  });
  assert.equal(changed.mediaId, 'media-1');
});

test('admin routes retain server contracts and editor FormData names', async () => {
  const [index, edit, editor, contentEditor, heroEditor] = await Promise.all([
    readFile(new URL('../../app/admin/pages/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../app/admin/pages/[id]/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./PageEditor.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../blog/BlogEditorContent.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./PageHeroSettings.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(index, /searchParams:\s*Promise/);
  assert.match(index, /listAdminCmsPages\(\{ page: requestedPage, pageSize: 8 \}\)/);
  assert.match(edit, /z\.string\(\)\.uuid\(\)/);
  assert.match(edit, /notFound\(\)/);
  for (const name of ['title', 'slug', 'contentJson', 'contentHtml', 'heroSettings',
    'backgroundImageMediaId', 'status', 'publishedAt', 'scheduledFor', 'metaTitle',
    'metaDescription', 'canonicalUrl', 'noindex', 'schemaMarkup', 'scriptHead',
    'scriptBodyStart', 'scriptBodyEnd']) assert.match(editor + contentEditor + heroEditor, new RegExp(`name=["']${name}["']`));
  assert.doesNotMatch(editor, /featuredMediaId|termIds|galleryMediaIds/);
});
