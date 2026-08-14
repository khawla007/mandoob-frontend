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

const summaryLabels = Object.fromEntries(
  ['awaitingUpload', 'awaitingReview', 'approved', 'rejected', 'expiring', 'overdue'].map((key) => [
    key,
    { title: `${key} title`, helper: `${key} helper`, failed: 'failed', retry: 'retry' },
  ]),
) as DocumentSummaryLabels;

const summary: DocumentCenterSummary = {
  awaitingUpload: { ok: true, value: 1234 },
  awaitingReview: { ok: true, value: 2345 },
  approved: { ok: true, value: 3456 },
  rejected: { ok: true, value: 4567 },
  expiring: { ok: true, value: 5678 },
  overdue: { ok: true, value: 6789 },
};

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
        client: '11111111-1111-4111-8111-111111111111',
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

const filterLabels: DocumentFilterLabels = {
  search: 'Search',
  searchPlaceholder: 'Find',
  view: 'View',
  client: 'Client',
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
        window: '30',
        from: '2026-08-13',
        to: '2026-08-14',
      }),
      clients: [],
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
    for (const name of ['q', 'view', 'client', 'type', 'window', 'from', 'to', 'sort']) {
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
        total: 1234,
        pageSize: 50,
        locale: 'ar-AE',
        labels: {
          result: '{from}–{to} / {total}',
          pageCount: '{current} / {total}',
          pagination: 'Pages',
          previous: 'Previous',
          next: 'Next',
        },
      }),
    );
    const number = new Intl.NumberFormat('ar-AE');
    assert.match(html, new RegExp(`${number.format(2)} / ${number.format(25)}`, 'u'));
    assert.match(html, /aria-current="page"/u);
    assert.doesNotMatch(html, /aria-label="Page"/u);
    assert.match(html, new RegExp(number.format(1234), 'u'));
  },
);
