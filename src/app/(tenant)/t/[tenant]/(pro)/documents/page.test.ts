import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { ApiError } from '@/lib/errors';
import { authorizeDocumentCenterRead } from './page-authorization';
import { documentCenterHref, parseDocumentCenterSearch } from './page-logic';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const readOptional = (path: string) => {
  try {
    return read(path);
  } catch {
    return '';
  }
};
const page = read('./page.tsx');
const actions = read('../../../../../../components/pro/documents/DocumentActions.tsx');
const requestDialog = read('../../../../../../components/pro/documents/RequestDocumentDialog.tsx');
const history = read('../../../../../../components/pro/documents/VersionHistoryDialog.tsx');
const summary = read('../../../../../../components/pro/documents/DocumentSummaryGrid.tsx');
const queue = read('../../../../../../components/pro/documents/DocumentWorkQueue.tsx');
const batchRequest = readOptional(
  '../../../../../../components/pro/documents/DocumentBatchRequestUnavailable.tsx',
);
const loading = readOptional('./loading.tsx');
const errorBoundary = readOptional('./error.tsx');
const loadingView = read(
  '../../../../../../components/pro/documents/DocumentCenterLoadingView.tsx',
);
const errorView = read('../../../../../../components/pro/documents/DocumentCenterErrorView.tsx');
const styles = read('../../../../../../app/globals.css');

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

  const authorization = page.indexOf('requireProTenantRouteAccess(');
  const activeCheck = page.indexOf('requireActiveTenant(tenant.id)');
  assert.notEqual(authorization, -1);
  assert.ok(
    activeCheck > authorization,
    'active tenant validation must follow route authorization',
  );
  for (const serviceRead of [
    'listProDocumentCenter(',
    'getDocumentCenterSummary(',
    'readAssignedCompanyForPro(',
  ]) {
    assert.ok(activeCheck < page.indexOf(serviceRead), `${serviceRead} must follow active check`);
  }
});

test('independent server reads launch in one parallel boundary without a company selector waterfall', () => {
  assert.match(
    page,
    /Promise\.all\(\[[\s\S]*listProDocumentCenter\([\s\S]*getDocumentCenterSummary\([\s\S]*getTranslations\('proDocumentCenter'\)[\s\S]*getLocale\(\)[\s\S]*\]\)/u,
  );
  assert.doesNotMatch([actions, history, queue].join('\n'), /fetch\(/u);
});

test('canonicalization removes stale company URL state and targets a focused item on page one', () => {
  const focused = parseDocumentCenterSearch({
    company: '11111111-1111-4111-8111-111111111111',
    view: 'rejected',
    request: '22222222-2222-4222-8222-222222222222',
    page: '9',
  });
  assert.equal(focused.page, 1);
  assert.equal(
    documentCenterHref('acme', focused),
    '/t/acme/documents?view=rejected&request=22222222-2222-4222-8222-222222222222',
  );
  assert.equal('companyId' in focused, false);
  assert.match(page, /Math\.ceil\(workspace\.total \/ workspace\.pageSize\)/u);
  assert.match(page, /requestedPage !== workspace\.page/u);
  assert.match(page, /redirect\(documentCenterHref\(slug, query, workspace\.page\)\)/u);
});

test('filter controls remount from canonical URL state after summary navigation', () => {
  assert.match(page, /<DocumentFilters\s+key=\{documentCenterHref\(slug, query\)\}/u);
});

test('header support copy keeps WCAG AA contrast on the warm light canvas', () => {
  assert.match(page, /className="text-foreground\/70 font-mono text-xs/u);
  assert.match(page, /className="text-foreground\/70 mt-1 max-w-3xl text-sm"/u);
});

test('client action islands keep React 19 and server-action boundaries explicit', () => {
  for (const client of [actions, history]) {
    assert.match(client, /^'use client';/u);
    assert.doesNotMatch(client, /as never/u);
  }
  assert.match(requestDialog, /aria-live="polite"/u);
  assert.doesNotMatch(history, /aria-live=/u);
  assert.match(actions, /resolvePrimaryDocumentAction\(row\)/u);
  assert.match(actions, /data-primary=/u);
  assert.match(actions, /openDocumentVersionWithPopup/u);
  assert.doesNotMatch(actions, /await openDocumentVersionAction[\s\S]*window\.open/u);
  assert.doesNotMatch(
    actions,
    /reviewDocumentCenterAction|setDocumentExpiryAction|useActionState|<form action=/u,
  );
  assert.match(history, /loadVersionHistoryAction\(slug, documentId\)/u);
  assert.doesNotMatch(history, /versions !== null/u);
  assert.doesNotMatch(queue, /row=\{row\}/u);
});

test('summary constructs one locale number formatter before mapping widgets', () => {
  assert.equal((summary.match(/new Intl\.NumberFormat\(locale\)/gu) ?? []).length, 1);
  assert.match(
    summary,
    /const numberFormatter = new Intl\.NumberFormat\(locale\)[\s\S]*items\.map/u,
  );
  assert.match(summary, /numberFormatter\.format\(item\.result\.value\)/u);
});

test('queue hoists locale formatters outside per-row formatting helpers', () => {
  assert.match(queue, /const dateFormatter = new Intl\.DateTimeFormat\(locale/u);
  assert.match(queue, /const timestampFormatter = new Intl\.DateTimeFormat\(locale/u);
  assert.doesNotMatch(queue, /function formatDate[\s\S]{0,300}new Intl\.DateTimeFormat/u);
});

test('unavailable queue statuses use hidden text instead of prohibited generic aria labels', () => {
  assert.doesNotMatch(queue, /<span[^>]+aria-label=\{labels\.unavailable\}/u);
  assert.equal((queue.match(/className="sr-only">\{labels\.unavailable\}/gu) ?? []).length, 2);
});

test('route loading and error recovery are localized, semantic, and sanitized', () => {
  assert.doesNotMatch(loading, /'use client'/u);
  assert.match(loading, /useTranslations\('proDocumentCenter'\)/u);
  assert.match(loading, /t\('loading\.label'\)/u);
  assert.match(loading, /DocumentCenterLoadingView/u);
  assert.doesNotMatch(loading, />\s*[A-Za-z][^<{]*</u);
  assert.match(loadingView, /aria-busy="true"/u);
  assert.match(loadingView, /role="status"/u);
  assert.match(loadingView, /Array\.from\(\{ length: 6 \}/u);
  assert.match(loadingView, /document-center__skeleton-filter/u);
  assert.match(loadingView, /document-center__skeleton-table/u);
  assert.match(loadingView, /document-center__skeleton-company-context/u);
  assert.match(loadingView, /document-center__skeleton-actions/u);
  assert.equal((loadingView.match(/document-center__skeleton-action h-/gu) ?? []).length, 2);

  assert.match(errorBoundary, /^'use client';/u);
  assert.match(errorBoundary, /useTranslations\('proDocumentCenter'\)/u);
  assert.match(errorBoundary, /t\('pageError\.title'\)/u);
  assert.match(errorBoundary, /t\('pageError\.description'\)/u);
  assert.match(errorBoundary, /t\('pageError\.retry'\)/u);
  assert.match(errorBoundary, /DocumentCenterErrorView/u);
  assert.match(errorBoundary, /\{ unstable_retry \}/u);
  assert.match(errorBoundary, /onRetry=\{unstable_retry\}/u);
  assert.doesNotMatch(errorBoundary, /\breset\b/u);
  assert.match(errorView, /role="alert"/u);
  assert.match(errorView, /onClick=\{onRetry\}/u);
  assert.doesNotMatch(errorBoundary, /error\.(?:message|digest)|console\./u);
  assert.doesNotMatch(errorBoundary, />\s*[A-Za-z][^<{]*</u);
});

test('one-company Documents removes Company controls and presentation while keeping server scope', () => {
  assert.doesNotMatch(requestDialog, /DocumentCompanySearchField|name="company_id"/u);
  assert.doesNotMatch(page, /searchDocumentCenterCompanyOptions|getDocumentCenterCompanyOption/u);
  assert.doesNotMatch(queue, /labels\.company|row\.companyName|companyName/u);
  assert.match(page, /listProDocumentCenter\(tenant\.id, company\.id, query\)/u);
  assert.match(page, /getDocumentCenterSummary\(tenant\.id, company\.id, dubaiToday\(\)\)/u);
  assert.match(page, /heading\.companyContext/u);
});

test('batch requesting is explicitly unavailable until the accepted Phase 3 mutation exists', () => {
  assert.match(batchRequest, /disabled/u);
  assert.match(batchRequest, /labels\.title/u);
  assert.match(batchRequest, /labels\.description/u);
  assert.doesNotMatch(batchRequest, /<form|action=|useActionState|requestDocumentCenterAction/u);
});

test('route sends numeric counts through ICU instead of raw templates or preformatted values', () => {
  assert.doesNotMatch(page, /formattedWorkspaceTotal|t\.raw\('queue\./u);
  assert.match(page, /t\('heading\.subtitle',[\s\S]{0,160}count: workspace\.total/u);
  assert.match(page, /t\('queue\.result',[\s\S]{0,220}total: workspace\.total/u);
});

test('Document Center Signal Studio CSS stays scoped and encodes every summary signal', () => {
  const scopedStart = styles.indexOf('/* PRO Document Center');
  assert.notEqual(scopedStart, -1);
  const scoped = styles.slice(scopedStart);
  for (const variant of ['info', 'review', 'success', 'urgent', 'expiry', 'overdue']) {
    assert.match(scoped, new RegExp(`\\.document-center__summary--${variant}\\s*\\{`, 'u'));
    assert.match(
      scoped,
      new RegExp(
        `\\.document-center__summary--${variant} \\.document-center__summary-pattern\\s*\\{`,
        'u',
      ),
    );
  }
  assert.match(scoped, /\.document-center\s*\{/u);
  assert.match(scoped, /\.dark \.document-center/u);
  assert.match(scoped, /\.document-center__summary-pattern/u);
  assert.match(scoped, /pointer-events:\s*none/u);
  assert.match(scoped, /\.document-center__summary::after/u);
  assert.match(scoped, /:focus-visible/u);
  assert.match(
    scoped,
    /\.document-center__queue-scroll\s*\{[\s\S]*max-width:\s*100%[\s\S]*overflow-x:\s*auto/u,
  );
  assert.match(scoped, /inset-inline|margin-inline|padding-inline/u);
  assert.match(scoped, /\[dir=['"]rtl['"]\][^{]*\.document-center/u);
  assert.match(scoped, /@media \(max-width:\s*390px\)/u);
  assert.match(scoped, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.document-center/u);
  assert.match(scoped, /\.document-center__client-listbox/u);
  assert.match(scoped, /\.document-center__skeleton-table/u);
  assert.doesNotMatch(scoped, /background-clip:\s*text|border-inline-start/u);
});
