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

test('trust presentation removes provider internals and unsupported assurance claims without mutating CMS data', async () => {
  const contentHtml =
    '<p>per-tenant isolation via Postgres row-level security</p><h2>Certifications</h2><p>PDPL aligned · ISO 27001 · TLS 1.3 · SOC 2 in progress.</p>';
  const contentJson = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'per-tenant isolation via Postgres row-level security' }],
      },
    ],
  };
  const source = page({ slug: 'trust', contentHtml, contentJson });

  const state = await resolveLegalPageState('trust', async () => source);

  assert.equal(state.status, 'ready');
  if (state.status !== 'ready') return;
  assert.doesNotMatch(state.data.contentHtml, /Postgres|ISO 27001|SOC 2|Certifications/u);
  assert.match(state.data.contentHtml, /per-tenant isolation controls/u);
  assert.match(state.data.contentHtml, /Security assurance/u);
  assert.match(state.data.contentHtml, /security@mandoob\.ae/u);
  assert.doesNotMatch(JSON.stringify(state.data.contentJson), /Postgres/u);
  assert.equal(source.contentHtml, contentHtml);
  assert.deepEqual(source.contentJson, contentJson);
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
