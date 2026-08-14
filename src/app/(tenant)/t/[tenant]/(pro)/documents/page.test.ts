import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { ApiError } from '@/lib/errors';
import { authorizeDocumentCenterRead } from './page-authorization';
import { documentCenterHref, parseDocumentCenterSearch } from './page-logic';

const root = process.cwd();
const source = (path: string) => {
  const absolute = join(root, path);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
};
const page = source('src/app/(tenant)/t/[tenant]/(pro)/documents/page.tsx');
const summary = source('src/components/pro/documents/DocumentSummaryGrid.tsx');
const filters = source('src/components/pro/documents/DocumentFilters.tsx');
const queue = source('src/components/pro/documents/DocumentWorkQueue.tsx');
const actions = source('src/components/pro/documents/DocumentActions.tsx');
const history = source('src/components/pro/documents/VersionHistoryDialog.tsx');

test('page awaits Next 16 route inputs, parses once, and forces dynamic rendering', () => {
  assert.match(page, /export const dynamic = 'force-dynamic'/);
  assert.match(page, /params:\s*Promise<\{ tenant: string \}>/);
  assert.match(page, /searchParams:\s*Promise<DocumentCenterSearchParams>/);
  assert.match(page, /await Promise\.all\(\[params, searchParams\]\)/);
  assert.equal((page.match(/parseDocumentCenterSearch\(/g) ?? []).length, 1);
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
        requirePro: async () => ({ tenantId: '22222222-2222-4222-8222-222222222222' }),
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
  for (const read of [
    'listProDocumentCenter(',
    'getDocumentCenterSummary(',
    'listClientsForTenant(',
  ]) {
    assert.ok(authorization < page.indexOf(read), `${read} must follow authorization`);
  }
  assert.match(page, /if \(!tenant\) notFound\(\)/);
});

test('independent initial data and localization reads launch together on the server', () => {
  assert.match(
    page,
    /Promise\.all\(\[[\s\S]*listProDocumentCenter\([\s\S]*getDocumentCenterSummary\([\s\S]*listClientsForTenant\([\s\S]*getTranslations\('proDocumentCenter'\)[\s\S]*getLocale\(\)[\s\S]*\]\)/,
  );
  assert.doesNotMatch([summary, filters, queue, actions, history].join('\n'), /useEffect|fetch\(/);
});

test('pagination is exact, bounded, filter-preserving, and canonicalizes effective or focused pages', () => {
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
  assert.match(page, /workspace\.pageSize/);
  assert.match(page, /Math\.ceil\(workspace\.total \/ workspace\.pageSize\)/);
  assert.match(page, /requestedPage !== workspace\.page/);
  assert.match(page, /redirect\(documentCenterHref\(slug, query, workspace\.page\)\)/);
  assert.match(queue, /documentCenterHref\(slug, query, page - 1\)/);
  assert.match(queue, /documentCenterHref\(slug, query, page \+ 1\)/);
});

test('six native summary links consume exact views and preserve independent success or error states', () => {
  assert.equal((summary.match(/<Link\b/g) ?? []).length, 1);
  for (const view of ['requested', 'submitted', 'approved', 'rejected', 'expiring', 'overdue']) {
    assert.ok(summary.includes(`view: '${view}'`), view);
  }
  assert.match(summary, /item\.result\.ok/);
  assert.match(summary, /item\.labels\.failed/);
  assert.match(summary, /item\.labels\.retry/);
  assert.match(summary, /aria-hidden="true"/);
  assert.match(summary, /pointer-events-none/);
  assert.match(summary, /aria-current/);
  for (const variant of ['info', 'orange', 'success', 'urgent', 'warning']) {
    assert.match(summary, new RegExp(`document-center__summary--\\$\\{item\\.variant\\}`), variant);
  }
});

test('one URL-first GET form owns every filter and exposes mobile disclosure, applied state, and reset', () => {
  assert.equal((filters.match(/<form\b/g) ?? []).length, 1);
  assert.match(filters, /method="get"/);
  for (const name of ['q', 'view', 'client', 'type', 'window', 'from', 'to', 'sort']) {
    assert.equal((filters.match(new RegExp(`name="${name}"`, 'g')) ?? []).length, 1, name);
  }
  assert.match(filters, /<details/);
  assert.match(filters, /labels\.appliedFilters/);
  assert.match(filters, /href=\{resetHref\}/);
  assert.doesNotMatch(filters, /name="(?:request|document)"/);
  assert.doesNotMatch(filters, /useSearchParams|URLSearchParams/);
});

test('queue is a semantic non-clickable-row table in one deliberate overflow container', () => {
  assert.equal((queue.match(/overflow-x-auto/g) ?? []).length, 1);
  assert.match(queue, /document-center__queue-scroll/);
  assert.match(queue, /<table/);
  for (const label of [
    'client',
    'documentType',
    'requestStatus',
    'reviewStatus',
    'due',
    'expiry',
    'upload',
    'file',
    'actors',
    'action',
  ]) {
    assert.match(queue, new RegExp(`labels\\.${label}`), label);
  }
  assert.match(queue, /scope="col"/);
  assert.match(queue, /key=\{`\$\{row\.entityKind\}:\$\{row\.entityId\}`\}/);
  assert.match(queue, /id=\{`document-center-row-\$\{row\.entityKind\}-\$\{row\.entityId\}`\}/);
  assert.match(queue, /aria-current=\{focused \? 'true' : undefined\}/);
  assert.doesNotMatch(queue, /<tr[^>]+onClick|<Link[^>]+><tr/);
  assert.match(queue, /function StatusIcon/);
  assert.doesNotMatch(queue, /const Icon = statusIcon/);
});

test('client actions use React 19 action state and accessible dialogs without unsafe casts', () => {
  for (const client of [actions, history]) {
    assert.match(client, /^'use client';/);
    assert.match(client, /aria-live="polite"/);
    assert.doesNotMatch(client, /as never/);
  }
  assert.match(actions, /useActionState/);
  assert.match(actions, /disabled=\{pending\}/);
  assert.match(actions, /requestDocumentCenterAction\.bind\(null, slug\)/);
  assert.match(actions, /reviewDocumentCenterAction\.bind\(null, slug\)/);
  assert.match(actions, /setDocumentExpiryAction\.bind\(null, slug\)/);
  assert.match(actions, /openDocumentVersionAction\(slug, versionId\)/);
  assert.match(actions, /window\.open\(result\.data\.url, '_blank', 'noopener,noreferrer'\)/);
  assert.match(history, /loadVersionHistoryAction\(slug, documentId\)/);
  assert.match(history, /openDocumentVersionAction\(slug, version\.versionId\)/);
  for (const dialogSource of [actions, history]) {
    assert.match(dialogSource, /DialogTitle/);
    assert.match(dialogSource, /DialogDescription/);
    assert.match(dialogSource, /closeLabel=\{labels\.close\}/);
  }
});

test('server queue serializes only the row fields needed by the action island', () => {
  assert.match(actions, /type DocumentActionRow = Pick</);
  assert.doesNotMatch(actions, /tenantId|clientCompany|requesterName|reviewerName|totalCount/);
  assert.match(queue, /row=\{\{[\s\S]*entityKind: row\.entityKind/);
  assert.doesNotMatch(queue, /row=\{row\}/);
});

test('expiry set and clear controls use separate valid forms', () => {
  assert.match(actions, /id=\{expiryFormId\}/);
  assert.match(actions, /form=\{expiryFormId\}/);
  assert.doesNotMatch(
    actions,
    /<form action=\{expiryFormAction\}[\s\S]*<form action=\{clearFormAction\}[\s\S]*<\/form>[\s\S]*<\/form>/,
  );
});

test('queue and version history format operational values with explicit locale and Dubai time', () => {
  for (const component of [queue, history]) {
    assert.match(component, /Intl\.DateTimeFormat\(locale/);
    assert.match(component, /timeZone:\s*'Asia\/Dubai'/);
    assert.match(component, /Intl\.NumberFormat\(locale/);
  }
  assert.match(queue, /labels\.dubaiTime/);
  assert.match(queue, /text-start/);
  assert.doesNotMatch(queue, /text-left|text-right|ml-|mr-|pl-|pr-/);
});

test('page and components receive localized copy instead of hardcoded visible English', () => {
  assert.match(page, /getTranslations\('proDocumentCenter'\)/);
  assert.match(page, /t\('heading\.title'\)/);
  assert.match(page, /t\.raw\(/);
  const all = [page, summary, filters, queue, actions, history].join('\n');
  assert.doesNotMatch(
    all,
    />\s*(?:Request document|Documents|Client|Status|Due|Expiry|Upload|Open|Approve|Reject|History|Close|Retry|Reset|No documents)\s*</,
  );
});

test('empty queue states distinguish no firm data from no filter matches with relevant actions', () => {
  assert.match(queue, /hasActiveFilters/);
  assert.match(queue, /labels\.emptyFilteredTitle/);
  assert.match(queue, /labels\.emptyFirmTitle/);
  assert.match(queue, /resetHref/);
  assert.match(queue, /DocumentActions/);
});
