import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '@/lib/errors';
import {
  parseCmsPageFormData,
  runDeleteCmsPageAction,
  runSaveCmsPageAction,
} from './action-logic';

const pageId = '11111111-1111-4111-8111-111111111111';

function validForm(): FormData {
  const form = new FormData();
  form.set('title', ' About ');
  form.set('slug', 'About Us');
  form.set('contentJson', '{"type":"doc"}');
  form.set('contentHtml', '<p>About</p>');
  form.set('heroSettings', '{"backgroundColor":"#fff","overlayOpacity":0.4}');
  form.set('backgroundImageMediaId', ' media-1 ');
  form.set('status', 'published');
  form.set('publishedAt', '2026-07-10T12:30:00.000Z');
  form.set('scheduledFor', '');
  form.set('metaTitle', ' About meta ');
  form.set('metaDescription', ' Description ');
  form.set('canonicalUrl', 'https://example.com/about');
  form.set('noindex', 'on');
  form.set('schemaMarkup', '{"@type":"WebPage"}');
  form.set('headScripts', '<script>head()</script>');
  form.set('bodyStartScripts', '<script>start()</script>');
  form.set('bodyEndScripts', '<script>end()</script>');
  return form;
}

test('parseCmsPageFormData parses every page input, JSON, booleans, timestamps, and script slots', () => {
  assert.deepEqual(parseCmsPageFormData(validForm()), {
    title: 'About', slug: 'about-us', contentJson: { type: 'doc' }, contentHtml: '<p>About</p>',
    heroSettings: {
      backgroundColor: '#fff', overlayColor: '#000000', overlayOpacity: 0.4,
      headingAlignment: 'center', textAlignment: 'center', buttonAlignment: 'center',
    },
    backgroundImageMediaId: 'media-1', status: 'published',
    publishedAt: '2026-07-10T12:30:00.000Z', scheduledFor: null,
    metaTitle: 'About meta', metaDescription: 'Description',
    canonicalUrl: 'https://example.com/about', noindex: true,
    schemaMarkup: { '@type': 'WebPage' },
    headScripts: '<script>head()</script>', bodyStartScripts: '<script>start()</script>',
    bodyEndScripts: '<script>end()</script>',
  });
});

for (const [field, value] of [
  ['contentJson', '{'], ['heroSettings', '[]'], ['schemaMarkup', 'null'],
] as const) {
  test(`parseCmsPageFormData rejects invalid ${field} JSON objects`, () => {
    const form = validForm();
    form.set(field, value);
    assert.throws(() => parseCmsPageFormData(form), (error: unknown) =>
      error instanceof ApiError && error.code === 'INVALID_INPUT');
  });
}

function deps(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  return {
    calls,
    dependencies: {
      requireActor: async () => { calls.push('auth'); return { id: 'admin-1', role: 'admin' as const }; },
      getPage: async () => { calls.push('get'); return { slug: 'old-page' }; },
      upsertPage: async () => { calls.push('upsert'); return { id: pageId, slug: 'about-us' }; },
      deletePage: async () => { calls.push('delete'); },
      revalidate: (path: string) => { calls.push(`revalidate:${path}`); },
      ...overrides,
    },
  };
}

test('save authenticates, rejects malformed IDs, and does not mutate', async () => {
  const context = deps();
  const result = await runSaveCmsPageAction('bad-id', validForm(), context.dependencies);
  assert.deepEqual(result, { ok: false, error: 'Invalid page ID', code: 'INVALID_INPUT' });
  assert.deepEqual(context.calls, ['auth']);
});

test('invalid JSON never reads or mutates page data', async () => {
  const context = deps();
  const form = validForm();
  form.set('contentJson', '{');
  const result = await runSaveCmsPageAction(null, form, context.dependencies);
  assert.equal(result.ok, false);
  assert.deepEqual(context.calls, ['auth']);
});

test('save maps duplicate slugs to a stable public result', async () => {
  const context = deps({ upsertPage: async () => { throw new ApiError('DUPLICATE_SLUG', 'database detail', 409); } });
  assert.deepEqual(await runSaveCmsPageAction(null, validForm(), context.dependencies), {
    ok: false, error: 'A CMS page with this slug already exists', code: 'DUPLICATE_SLUG',
  });
});

test('save orchestrates auth, prior lookup, mutation, and old/new root revalidation', async () => {
  const context = deps();
  assert.deepEqual(await runSaveCmsPageAction(pageId, validForm(), context.dependencies), {
    ok: true, data: { id: pageId },
  });
  assert.deepEqual(context.calls, [
    'auth', 'get', 'upsert', 'revalidate:/admin/pages', 'revalidate:/sitemap.xml',
    'revalidate:/old-page', 'revalidate:/about-us',
  ]);
});

test('delete authenticates, validates before reads/mutation, deletes, and revalidates the deleted slug', async () => {
  const invalid = deps();
  assert.deepEqual(await runDeleteCmsPageAction('bad-id', invalid.dependencies), {
    ok: false, error: 'Invalid page ID', code: 'INVALID_INPUT',
  });
  assert.deepEqual(invalid.calls, ['auth']);

  const context = deps();
  assert.deepEqual(await runDeleteCmsPageAction(pageId, context.dependencies), { ok: true, data: undefined });
  assert.deepEqual(context.calls, [
    'auth', 'get', 'delete', 'revalidate:/admin/pages', 'revalidate:/sitemap.xml',
    'revalidate:/old-page',
  ]);
});
