import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { ApiError } from '@/lib/errors';
import { authorizeDocumentCenterRead } from './page-authorization';
import { documentCenterHref, parseDocumentCenterSearch } from './page-logic';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = read('./page.tsx');
const actions = read('../../../../../../components/pro/documents/DocumentActions.tsx');
const history = read('../../../../../../components/pro/documents/VersionHistoryDialog.tsx');
const queue = read('../../../../../../components/pro/documents/DocumentWorkQueue.tsx');

test('page awaits Next 16 route inputs, parses once, and forces dynamic rendering', () => {
  assert.match(page, /export const dynamic = 'force-dynamic'/u);
  assert.match(page, /params:\s*Promise<\{ tenant: string \}>/u);
  assert.match(page, /searchParams:\s*Promise<DocumentCenterSearchParams>/u);
  assert.match(page, /await Promise\.all\(\[params, searchParams\]\)/u);
  assert.equal((page.match(/parseDocumentCenterSearch\(/gu) ?? []).length, 1);
});

test('page completes exact PRO authorization before every service-role workspace read', async () => {
  const calls: string[] = [];
  const tenant = await authorizeDocumentCenterRead('acme', {
    requirePro: async () => {
      calls.push('auth');
      return { tenantId: '11111111-1111-4111-8111-111111111111' };
    },
    resolveTenant: async () => {
      calls.push('tenant');
      return { id: '11111111-1111-4111-8111-111111111111', name: 'Acme' };
    },
    requireActive: async () => {
      calls.push('active');
    },
  });
  calls.push('read');
  assert.equal(tenant?.name, 'Acme');
  assert.deepEqual(calls, ['auth', 'tenant', 'active', 'read']);

  await assert.rejects(
    () =>
      authorizeDocumentCenterRead('other', {
        requirePro: async () => ({
          tenantId: '22222222-2222-4222-8222-222222222222',
        }),
        resolveTenant: async () => ({
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Acme',
        }),
        requireActive: async () => undefined,
      }),
    (error) => error instanceof ApiError && error.code === 'FORBIDDEN',
  );

  const authorization = page.indexOf('authorizeDocumentCenterRead(');
  assert.notEqual(authorization, -1);
  for (const serviceRead of [
    'listProDocumentCenter(',
    'getDocumentCenterSummary(',
    'listDocumentCenterClientOptions(',
  ]) {
    assert.ok(authorization < page.indexOf(serviceRead), `${serviceRead} must follow auth`);
  }
  assert.match(page, /if \(!tenant\) notFound\(\)/u);
});

test('independent server reads launch in one parallel boundary with no client initial waterfall', () => {
  assert.match(
    page,
    /Promise\.all\(\[[\s\S]*listProDocumentCenter\([\s\S]*getDocumentCenterSummary\([\s\S]*listDocumentCenterClientOptions\([\s\S]*getTranslations\('proDocumentCenter'\)[\s\S]*getLocale\(\)[\s\S]*\]\)/u,
  );
  assert.doesNotMatch([actions, history, queue].join('\n'), /useEffect|fetch\(/u);
});

test('canonicalization preserves validated filters and targets a focused item on page one', () => {
  const focused = parseDocumentCenterSearch({
    client: '11111111-1111-4111-8111-111111111111',
    view: 'rejected',
    request: '22222222-2222-4222-8222-222222222222',
    page: '9',
  });
  assert.equal(focused.page, 1);
  assert.equal(
    documentCenterHref('acme', focused),
    '/t/acme/documents?view=rejected&client=11111111-1111-4111-8111-111111111111&request=22222222-2222-4222-8222-222222222222',
  );
  assert.match(page, /Math\.ceil\(workspace\.total \/ workspace\.pageSize\)/u);
  assert.match(page, /requestedPage !== workspace\.page/u);
  assert.match(page, /redirect\(documentCenterHref\(slug, query, workspace\.page\)\)/u);
});

test('client action islands keep React 19 and server-action boundaries explicit', () => {
  for (const client of [actions, history]) {
    assert.match(client, /^'use client';/u);
    assert.match(client, /aria-live="polite"/u);
    assert.doesNotMatch(client, /as never/u);
  }
  assert.match(actions, /useActionState/u);
  assert.match(actions, /resolvePrimaryDocumentAction\(row\)/u);
  assert.match(actions, /data-primary=/u);
  assert.match(actions, /window\.open\(result\.data\.url, '_blank', 'noopener,noreferrer'\)/u);
  assert.match(history, /loadVersionHistoryAction\(slug, documentId\)/u);
  assert.doesNotMatch(queue, /row=\{row\}/u);
});
