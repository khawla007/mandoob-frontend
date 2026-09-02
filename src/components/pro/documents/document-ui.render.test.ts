import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import React from 'react';
import test from 'node:test';

import { parseDocumentCenterSearch } from '@/app/(tenant)/t/[tenant]/(pro)/documents/page-logic';
import type { DocumentCenterSummary } from '@/lib/data/pro-document-center';
import type { DocumentFilterLabels } from './DocumentFilters';
import type { DocumentSummaryLabels } from './DocumentSummaryGrid';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('document UI markup contracts run under the client React export condition', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

renderTest('loading skeleton renders localized busy semantics and stable geometry', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  let loaded: typeof import('./DocumentCenterLoadingView') | undefined;
  try {
    loaded = await import('./DocumentCenterLoadingView');
  } catch {}
  assert.ok(loaded);
  if (!loaded) return;

  const html = renderToStaticMarkup(
    React.createElement(loaded.DocumentCenterLoadingView, { label: 'جارٍ تحميل المستندات' }),
  );
  assert.match(html, /aria-busy="true"/u);
  assert.match(html, /role="status"/u);
  assert.match(html, /جارٍ تحميل المستندات/u);
  assert.equal((html.match(/document-center__skeleton-summary/gu) ?? []).length, 6);
  assert.equal((html.match(/document-center__skeleton-table-row/gu) ?? []).length, 5);
  assert.match(html, /document-center__skeleton-company-context/u);
  assert.match(html, /document-center__skeleton-actions/u);
  assert.equal((html.match(/document-center__skeleton-action h-/gu) ?? []).length, 2);
  assert.match(html, /document-center__skeleton-filter/u);
  assert.match(html, /document-center__skeleton-table-head/u);
});

renderTest(
  'error view is semantic, localized, and invokes the supplied retry callback',
  async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    let loaded: typeof import('./DocumentCenterErrorView') | undefined;
    try {
      loaded = await import('./DocumentCenterErrorView');
    } catch {}
    assert.ok(loaded);
    if (!loaded) return;

    let resets = 0;
    const props = {
      title: 'تعذّر تحميل مركز المستندات',
      description: 'يرجى المحاولة مرة أخرى.',
      retry: 'إعادة المحاولة',
      onRetry: () => {
        resets += 1;
      },
    };
    const view = loaded.DocumentCenterErrorView(props);
    const html = renderToStaticMarkup(view);
    assert.match(html, /role="alert"/u);
    assert.match(html, /aria-labelledby="document-center-error-title"/u);
    assert.match(html, /تعذّر تحميل مركز المستندات/u);
    assert.match(html, /إعادة المحاولة/u);

    function invokeRetry(node: React.ReactNode): boolean {
      if (!React.isValidElement<{ children?: React.ReactNode; onClick?: () => void }>(node)) {
        return false;
      }
      if (typeof node.props.onClick === 'function') {
        node.props.onClick();
        return true;
      }
      return React.Children.toArray(node.props.children).some(invokeRetry);
    }

    assert.equal(invokeRetry(view), true);
    assert.equal(resets, 1);
  },
);

const summary: DocumentCenterSummary = {
  awaitingUpload: { ok: true, value: 1234 },
  awaitingReview: { ok: true, value: 2345 },
  approved: { ok: true, value: 3456 },
  rejected: { ok: true, value: 4567 },
  expiring: { ok: true, value: 5678 },
  overdue: { ok: true, value: 6789 },
};

const summaryLabels = Object.fromEntries(
  ['awaitingUpload', 'awaitingReview', 'approved', 'rejected', 'expiring', 'overdue'].map((key) => {
    const result = summary[key as keyof typeof summary];
    return [
      key,
      {
        title: `${key} title`,
        helper: `${key} helper`,
        failed: 'failed',
        retry: 'retry',
        aria: `${key}: ${Intl.NumberFormat('ar-AE').format(result.ok ? result.value : 0)}. ${key} helper`,
      },
    ];
  }),
) as DocumentSummaryLabels;

renderTest(
  'summary widgets reset stale filters, expose six distinct variants, and localize counts',
  async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { DocumentSummaryGrid } = await import('./DocumentSummaryGrid');
    const props: Parameters<typeof DocumentSummaryGrid>[0] & { locale: string } = {
      slug: 'acme',
      locale: 'ar-AE',
      query: parseDocumentCenterSearch({
        q: 'stale',
        view: 'submitted',
        type: 'passport',
        window: 'custom',
        from: '2026-08-01',
        to: '2026-08-31',
        sort: 'newest',
        document: '44444444-4444-4444-8444-444444444444',
      }),
      summary,
      labels: summaryLabels,
    };
    const html = renderToStaticMarkup(React.createElement(DocumentSummaryGrid, props));
    const hrefs = [...html.matchAll(/href="([^"]+)"/gu)].map((match) =>
      match[1].replaceAll('&amp;', '&'),
    );
    assert.deepEqual(hrefs, [
      '/t/acme/documents?view=requested',
      '/t/acme/documents?view=submitted',
      '/t/acme/documents?view=approved',
      '/t/acme/documents?view=rejected',
      '/t/acme/documents?view=expiring',
      '/t/acme/documents?view=overdue',
    ]);
    assert.doesNotMatch(html, /aria-current=/u);
    for (const variant of ['info', 'review', 'success', 'urgent', 'expiry', 'overdue']) {
      assert.equal(
        (html.match(new RegExp(`document-center__summary--${variant}`, 'gu')) ?? []).length,
        1,
      );
    }
    assert.match(html, new RegExp(Intl.NumberFormat('ar-AE').format(1234), 'u'));
    assert.match(
      html,
      new RegExp(
        `aria-label="awaitingUpload: ${Intl.NumberFormat('ar-AE').format(1234)}\\. awaitingUpload helper"`,
        'u',
      ),
    );
  },
);

renderTest(
  'one failed summary widget keeps the other localized widget results intact',
  async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { DocumentSummaryGrid } = await import('./DocumentSummaryGrid');
    const failedSummary: DocumentCenterSummary = {
      ...summary,
      awaitingReview: { ok: false },
    };
    const labels: DocumentSummaryLabels = {
      ...summaryLabels,
      awaitingReview: {
        title: 'review title',
        helper: 'review helper',
        failed: 'review failed',
        retry: 'review retry',
        aria: 'review: failed. review retry',
      },
    };
    const html = renderToStaticMarkup(
      React.createElement(DocumentSummaryGrid, {
        slug: 'acme',
        locale: 'ar-AE',
        query: parseDocumentCenterSearch({}),
        summary: failedSummary,
        labels,
      }),
    );
    assert.match(html, /review failed/u);
    assert.match(html, /review retry/u);
    assert.match(html, new RegExp(Intl.NumberFormat('ar-AE').format(1234), 'u'));
    assert.doesNotMatch(html, new RegExp(Intl.NumberFormat('ar-AE').format(2345), 'u'));
  },
);

renderTest('history feedback uses one announcement mechanism for each state', async () => {
  let loaded: typeof import('./VersionHistoryFeedback') | undefined;
  try {
    loaded = await import('./VersionHistoryFeedback');
  } catch {}
  assert.ok(loaded);
  if (!loaded) return;
  const { renderToStaticMarkup } = await import('react-dom/server');

  const loading = renderToStaticMarkup(
    React.createElement(
      loaded.VersionHistoryFeedback,
      {
        loading: true,
        error: null,
        empty: false,
        loadingLabel: 'Loading',
        emptyLabel: 'Empty',
      },
      React.createElement('ol', null, React.createElement('li', null, 'Version')),
    ),
  );
  assert.equal((loading.match(/role="status"/gu) ?? []).length, 1);
  assert.doesNotMatch(loading, /aria-live=/u);

  const failed = renderToStaticMarkup(
    React.createElement(
      loaded.VersionHistoryFeedback,
      {
        loading: false,
        error: 'Failed',
        empty: false,
        loadingLabel: 'Loading',
        emptyLabel: 'Empty',
      },
      React.createElement('ol', null),
    ),
  );
  assert.equal((failed.match(/role="alert"/gu) ?? []).length, 1);
  assert.doesNotMatch(failed, /aria-live=/u);

  const success = renderToStaticMarkup(
    React.createElement(
      loaded.VersionHistoryFeedback,
      {
        loading: false,
        error: null,
        empty: false,
        loadingLabel: 'Loading',
        emptyLabel: 'Empty',
      },
      React.createElement('ol', null, React.createElement('li', null, 'Version')),
    ),
  );
  assert.doesNotMatch(success, /aria-live=|role="(?:status|alert)"/u);
  assert.match(success, /<ol><li>Version<\/li><\/ol>/u);
});

const filterLabels: DocumentFilterLabels = {
  search: 'Search',
  searchPlaceholder: 'Find',
  view: 'View',
  type: 'Type',
  window: 'Window',
  from: 'From',
  to: 'To',
  sort: 'Sort',
  all: 'All',
  moreFilters: 'More',
  apply: 'Apply',
  reset: 'Reset',
  appliedFilters: 'Applied',
  views: {
    all: 'All',
    requested: 'Requested',
    submitted: 'Submitted',
    approved: 'Approved',
    rejected: 'Rejected',
    expiring: 'Expiring',
    overdue: 'Overdue',
  },
  windows: { all: 'All', overdue: 'Overdue', '7': '7', '30': '30', '90': '90' },
  sorts: {
    urgency: 'Urgency',
    newest: 'Newest',
    oldest: 'Oldest',
    due_date: 'Due date',
    expiry_date: 'Expiry date',
  },
  docTypes: {
    trade_license: 'Trade license',
    passport: 'Passport',
    visa: 'Visa',
    emirates_id: 'EID',
    ejari: 'Ejari',
    moa: 'MOA',
    shareholder_id: 'Shareholder ID',
    aoa: 'AOA',
    bank_reference_letter: 'Bank reference',
    noc: 'NOC',
    cv_resume: 'CV',
    office_lease: 'Office lease',
    medical_certificate: 'Medical certificate',
    insurance_policy: 'Insurance policy',
    other: 'Other',
  },
};

renderTest(
  'applied ISO date filters are formatted with the supplied locale in Dubai time',
  async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { DocumentFilters } = await import('./DocumentFilters');
    const props: Parameters<typeof DocumentFilters>[0] & { locale: string } = {
      locale: 'ar-AE',
      query: parseDocumentCenterSearch({
        window: 'all',
        from: '2026-08-13',
        to: '2026-08-14',
      }),
      labels: filterLabels,
      resetHref: '/t/acme/documents',
    };
    const html = renderToStaticMarkup(React.createElement(DocumentFilters, props));
    const formatter = new Intl.DateTimeFormat('ar-AE', {
      timeZone: 'Asia/Dubai',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    assert.match(html, new RegExp(formatter.format(new Date('2026-08-13T12:00:00.000Z')), 'u'));
    assert.doesNotMatch(html, />From: 2026-08-13</u);
    assert.equal((html.match(/<form\b/gu) ?? []).length, 1);
    assert.match(html, /<form[^>]*method="get"/u);
    assert.match(html, /<details open=""/u);
    for (const name of ['q', 'view', 'type', 'window', 'from', 'to', 'sort']) {
      assert.equal((html.match(new RegExp(`name="${name}"`, 'gu')) ?? []).length, 1);
    }
  },
);

renderTest(
  'pagination exposes localized result and current-page text without an overriding generic name',
  async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    let loaded: typeof import('./DocumentQueuePagination') | undefined;
    try {
      loaded = await import('./DocumentQueuePagination');
    } catch {
      // The first TDD run intentionally reaches this branch before implementation.
    }
    assert.ok(loaded);
    if (!loaded) return;
    const html = renderToStaticMarkup(
      React.createElement(loaded.DocumentQueuePagination, {
        slug: 'acme',
        query: parseDocumentCenterSearch({ page: '2' }),
        page: 2,
        totalPages: 25,
        labels: {
          result: '٥١–١٠٠ / ١٬٢٣٤',
          pageCount: '٢ / ٢٥',
          pagination: 'Pages',
          previous: 'Previous',
          next: 'Next',
        },
      }),
    );
    assert.match(html, /٢ \/ ٢٥/u);
    assert.match(html, /aria-current="page"/u);
    assert.doesNotMatch(html, /aria-label="Page"/u);
    assert.match(html, /١٬٢٣٤/u);
  },
);

renderTest('preset windows disable and omit inactive custom date state', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { DocumentFilters } = await import('./DocumentFilters');
  const html = renderToStaticMarkup(
    React.createElement(DocumentFilters, {
      locale: 'en-AE',
      query: parseDocumentCenterSearch({
        window: '30',
        from: '2026-08-13',
        to: '2026-08-14',
      }),
      labels: filterLabels,
      resetHref: '/t/acme/documents',
    }),
  );
  assert.match(html, /<input(?=[^>]*name="from")(?=[^>]*disabled="")[^>]*>/u);
  assert.match(html, /<input(?=[^>]*name="to")(?=[^>]*disabled="")[^>]*>/u);
  assert.doesNotMatch(html, /2026-08-13|2026-08-14/u);
});
