import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parseCmsPageFormData } from '@/app/admin/pages/action-logic';
import { clampAdminPage, createHeroState, nextDialogFocusIndex, pageHref, serializeHeroState, updateHeroField } from './admin-page-state';

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
    buttonLabel: null, buttonHref: null, backgroundImageMediaId: 'media-1',
  });
  assert.equal(changed.mediaId, 'media-1');
});

test('new editor hero serialization parses end-to-end without blank CSS validation failures', () => {
  const form = new FormData();
  form.set('title', 'Landing'); form.set('status', 'draft');
  form.set('heroSettings', serializeHeroState(createHeroState()));
  const parsed = parseCmsPageFormData(form);
  assert.equal(parsed.backgroundImageMediaId, null);
  assert.equal(parsed.heroSettings.minHeight, undefined);
  assert.equal(parsed.heroSettings.margin, undefined);
});

test('hero JSON carries media identity and URL into parsed persistence input', () => {
  const form = new FormData();
  form.set('title', 'Landing'); form.set('status', 'draft');
  form.set('heroSettings', serializeHeroState(createHeroState({}, 'media-9', 'https://cdn.example/hero.jpg')));
  const parsed = parseCmsPageFormData(form);
  assert.equal(parsed.backgroundImageMediaId, 'media-9');
  assert.equal(parsed.heroSettings.backgroundImageUrl, 'https://cdn.example/hero.jpg');
});

test('dialog focus cycling wraps in both keyboard directions', () => {
  assert.equal(nextDialogFocusIndex(0, 2, false), 1);
  assert.equal(nextDialogFocusIndex(1, 2, false), 0);
  assert.equal(nextDialogFocusIndex(0, 2, true), 1);
  assert.equal(nextDialogFocusIndex(1, 2, true), 0);
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
    'status', 'publishedAt', 'scheduledFor', 'metaTitle',
    'metaDescription', 'canonicalUrl', 'noindex', 'schemaMarkup', 'scriptHead',
    'scriptBodyStart', 'scriptBodyEnd']) assert.match(editor + contentEditor + heroEditor, new RegExp(`name=["']${name}["']`));
  assert.doesNotMatch(editor, /featuredMediaId|termIds|galleryMediaIds/);
  assert.doesNotMatch(heroEditor, /name="backgroundImageMediaId"/);
  const table = await readFile(new URL('./PagesTable.tsx', import.meta.url), 'utf8');
  assert.match(table, /invokerRef\.current\?\.focus\(\)/);
  assert.match(table, /key === 'Tab'/);
});
