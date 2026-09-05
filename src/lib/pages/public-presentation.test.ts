import assert from 'node:assert/strict';
import test from 'node:test';

import type { CmsPage } from '@/lib/data/pages';
import { resolveGenericPageState, resolveLegalPageState } from './public-presentation';

function page(overrides: Partial<CmsPage> = {}): CmsPage {
  return {
    id: 'page-1',
    slug: 'privacy',
    title: 'Privacy',
    contentJson: {},
    contentHtml: '<p>Body</p>',
    heroSettings: {
      backgroundColor: '#ffffff',
      overlayColor: '#000000',
      overlayOpacity: 0,
      headingAlignment: 'center',
      textAlignment: 'center',
      buttonAlignment: 'center',
    },
    backgroundImageMediaId: null,
    status: 'published',
    publishedAt: '2026-01-01T00:00:00.000Z',
    scheduledFor: null,
    metaTitle: null,
    metaDescription: null,
    canonicalUrl: null,
    noindex: false,
    schemaMarkup: null,
    scriptHead: null,
    scriptBodyStart: null,
    scriptBodyEnd: null,
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('legal state keeps allowlisted success/null/failure distinct', async () => {
  const now = new Date('2026-02-01T00:00:00.000Z');
  assert.equal((await resolveLegalPageState('privacy', async () => page(), now)).status, 'ready');
  assert.equal((await resolveLegalPageState('privacy', async () => null, now)).status, 'missing');
  assert.equal((await resolveLegalPageState('about', async () => page(), now)).status, 'missing');
  assert.deepEqual(
    await resolveLegalPageState(
      'privacy',
      async () => {
        throw new Error('database secret');
      },
      now,
    ),
    { status: 'unavailable' },
  );
});

test('generic state preserves reserved/public visibility and maps malformed failures to unavailable', async () => {
  const now = new Date('2026-02-01T00:00:00.000Z');
  assert.equal(
    (await resolveGenericPageState('hello', async () => page({ slug: 'hello' }), now)).status,
    'ready',
  );
  assert.equal((await resolveGenericPageState('admin', async () => page(), now)).status, 'missing');
  assert.equal(
    (await resolveGenericPageState('hello', async () => page({ status: 'draft' }), now)).status,
    'missing',
  );
  assert.equal(
    (
      await resolveGenericPageState(
        'hello',
        async () => {
          throw new Error('malformed row');
        },
        now,
      )
    ).status,
    'unavailable',
  );
});
