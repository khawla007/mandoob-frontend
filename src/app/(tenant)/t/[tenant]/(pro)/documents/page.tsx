import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import {
  DocumentActions,
  type DocumentActionLabels,
} from '@/components/pro/documents/DocumentActions';
import {
  DocumentFilters,
  type DocumentFilterLabels,
} from '@/components/pro/documents/DocumentFilters';
import {
  DocumentSummaryGrid,
  type DocumentSummaryLabels,
} from '@/components/pro/documents/DocumentSummaryGrid';
import {
  DocumentWorkQueue,
  type DocumentQueueLabels,
} from '@/components/pro/documents/DocumentWorkQueue';
import { DocumentBatchRequestUnavailable } from '@/components/pro/documents/DocumentBatchRequestUnavailable';
import {
  dubaiToday,
  getDocumentCenterSummary,
  listProDocumentCenter,
} from '@/lib/data/pro-document-center';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { DOC_TYPES, type DocType } from '@/lib/validation/document';
import {
  documentCenterSorts,
  documentCenterViews,
  documentCenterWindows,
} from '@/lib/validation/pro-document-center';
import {
  documentCenterHref,
  legacyCompanyRedirectHref,
  parseDocumentCenterSearch,
  type DocumentCenterSearchParams,
} from './page-logic';

export const dynamic = 'force-dynamic';

const requestStatuses = ['pending', 'fulfilled', 'cancelled'] as const;
const reviewStatuses = ['pending', 'approved', 'rejected'] as const;
const summaryKeys = [
  'awaitingUpload',
  'awaitingReview',
  'approved',
  'rejected',
  'expiring',
  'overdue',
] as const;

export default async function ProDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<DocumentCenterSearchParams>;
}) {
  const [{ tenant: slug }, search] = await Promise.all([params, searchParams]);
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();

  const query = parseDocumentCenterSearch(search);
  const legacyCompanyRedirect = legacyCompanyRedirectHref(slug, search, query);
  if (legacyCompanyRedirect) redirect(legacyCompanyRedirect);
  const requestedPage = query.page;
  const [workspace, summary, t, locale] = await Promise.all([
    listProDocumentCenter(tenant.id, company.id, query),
    getDocumentCenterSummary(tenant.id, company.id, dubaiToday()),
    getTranslations('proDocumentCenter'),
    getLocale(),
  ]);
  const totalPages = Math.max(1, Math.ceil(workspace.total / workspace.pageSize));
  if (requestedPage !== workspace.page) {
    redirect(documentCenterHref(slug, query, workspace.page));
  }
  const docTypes = Object.fromEntries(
    DOC_TYPES.map((type) => [type, t(`docTypes.${type}`)]),
  ) as Record<DocType, string>;
  const errorLabels: Record<string, string> = {
    'documents.errors.validation': t('errors.validation'),
    'documents.errors.unauthorized': t('errors.unauthorized'),
    'documents.errors.forbidden': t('errors.forbidden'),
    'documents.errors.notFound': t('errors.notFound'),
    'documents.errors.tenantInactive': t('errors.tenantInactive'),
    'documents.errors.expiryExternallyManaged': t('errors.expiryExternallyManaged'),
    'documents.errors.openFailed': t('errors.openFailed'),
    'documents.errors.phase3Unavailable': t('errors.phase3Unavailable'),
    'documents.errors.unexpected': t('errors.unexpected'),
    unexpected: t('errors.unexpected'),
  };
  const unitLabels = {
    bytes: t('units.bytes'),
    kb: t('units.kb'),
    mb: t('units.mb'),
    gb: t('units.gb'),
  };
  const actionLabels: DocumentActionLabels = {
    close: t('actions.close'),
    cancel: t('actions.cancel'),
    profile: t('actions.companyProfile'),
    open: t('actions.open'),
    opening: t('actions.opening'),
    popupBlocked: t('actions.popupBlocked'),
    success: t('actions.success'),
    unavailable: {
      review: t('actions.reviewUnavailable'),
      expiry: t('actions.expiryUnavailable'),
      description: t('actions.phase3Unavailable'),
    },
    request: {
      trigger: t('request.trigger'),
      title: t('request.title'),
      description: t('request.description'),
      type: t('request.type'),
      label: t('request.label'),
      due: t('request.due'),
      notes: t('request.notes'),
      submit: t('request.submit'),
      pending: t('request.pending'),
    },
    review: {
      approve: t('review.approve'),
      reject: t('review.reject'),
      rejecting: t('review.rejecting'),
      rejectTitle: t('review.rejectTitle'),
      rejectDescription: t('review.rejectDescription'),
      note: t('review.note'),
      approvePending: t('review.approvePending'),
      rejectPending: t('review.rejectPending'),
    },
    expiry: {
      trigger: t('expiry.trigger'),
      title: t('expiry.title'),
      description: t('expiry.description'),
      date: t('expiry.date'),
      save: t('expiry.save'),
      clear: t('expiry.clear'),
      pending: t('expiry.pending'),
      externallyManaged: t('expiry.externallyManaged'),
      sources: {
        company_license: t('expiry.sources.companyLicense'),
        employee_visa: t('expiry.sources.employeeVisa'),
        employee_emirates_id: t('expiry.sources.employeeEmiratesId'),
      },
    },
    docTypes,
    errors: errorLabels,
    history: {
      trigger: t('history.trigger'),
      title: t('history.title'),
      description: t('history.description'),
      close: t('actions.close'),
      loading: t('history.loading'),
      empty: t('history.empty'),
      current: t('history.current'),
      version: t('history.version'),
      uploaded: t('history.uploaded'),
      uploadedBy: t('history.uploadedBy'),
      review: t('history.review'),
      reviewedBy: t('history.reviewedBy'),
      note: t('history.note'),
      file: t('history.file'),
      open: t('actions.open'),
      opening: t('actions.opening'),
      popupBlocked: t('actions.popupBlocked'),
      unknownActor: t('queue.unknownActor'),
      dubaiTime: t('queue.dubaiTime'),
      units: unitLabels,
      statuses: Object.fromEntries(
        reviewStatuses.map((status) => [status, t(`reviewStatuses.${status}`)]),
      ) as DocumentActionLabels['history']['statuses'],
      errors: errorLabels,
    },
  };
  const summaryLabels = Object.fromEntries(
    summaryKeys.map((key) => {
      const result = summary[key];
      const failed = t(`summary.${key}.failed`);
      const retry = t(`summary.${key}.retry`);
      return [
        key,
        {
          title: t(`summary.${key}.title`),
          helper: t(`summary.${key}.helper`),
          failed,
          retry,
          aria: t(`summary.${key}.aria`, {
            count: result.ok ? result.value : failed,
            helper: result.ok ? t(`summary.${key}.helper`) : retry,
          }),
        },
      ];
    }),
  ) as DocumentSummaryLabels;
  const filterLabels: DocumentFilterLabels = {
    search: t('filters.search'),
    searchPlaceholder: t('filters.searchPlaceholder'),
    view: t('filters.view'),
    type: t('filters.type'),
    window: t('filters.window'),
    from: t('filters.from'),
    to: t('filters.to'),
    sort: t('filters.sort'),
    all: t('filters.all'),
    moreFilters: t('filters.more'),
    apply: t('filters.apply'),
    reset: t('filters.reset'),
    appliedFilters: t('filters.applied'),
    views: Object.fromEntries(
      documentCenterViews.map((view) => [view, t(`views.${view}`)]),
    ) as DocumentFilterLabels['views'],
    windows: Object.fromEntries(
      documentCenterWindows.map((window) => [window, t(`windows.${window}`)]),
    ) as DocumentFilterLabels['windows'],
    sorts: Object.fromEntries(
      documentCenterSorts.map((sort) => [sort, t(`sorts.${sort}`)]),
    ) as DocumentFilterLabels['sorts'],
    docTypes,
  };
  const visibleFrom = (workspace.page - 1) * workspace.pageSize + 1;
  const visibleTo = Math.min(workspace.page * workspace.pageSize, workspace.total);
  const queueLabels: DocumentQueueLabels = {
    region: t('queue.region'),
    documentType: t('queue.documentType'),
    requestStatus: t('queue.requestStatus'),
    reviewStatus: t('queue.reviewStatus'),
    due: t('queue.due'),
    expiry: t('queue.expiry'),
    upload: t('queue.upload'),
    file: t('queue.file'),
    actors: t('queue.actors'),
    action: t('queue.action'),
    employee: t('queue.employee'),
    requester: t('queue.requester'),
    reviewer: t('queue.reviewer'),
    unavailable: t('queue.unavailable'),
    unknownActor: t('queue.unknownActor'),
    dubaiTime: t('queue.dubaiTime'),
    emptyFirmTitle: t('queue.emptyFirmTitle'),
    emptyFirmDescription: t('queue.emptyFirmDescription'),
    emptyFilteredTitle: t('queue.emptyFilteredTitle'),
    emptyFilteredDescription: t('queue.emptyFilteredDescription'),
    reset: t('filters.reset'),
    pagination: t('queue.pagination'),
    previous: t('queue.previous'),
    next: t('queue.next'),
    result: t('queue.result', {
      from: visibleFrom,
      to: visibleTo,
      total: workspace.total,
    }),
    pageCount: t('queue.pageCount', { current: workspace.page, total: totalPages }),
    requestStatuses: Object.fromEntries(
      requestStatuses.map((status) => [status, t(`requestStatuses.${status}`)]),
    ) as DocumentQueueLabels['requestStatuses'],
    reviewStatuses: Object.fromEntries(
      reviewStatuses.map((status) => [status, t(`reviewStatuses.${status}`)]),
    ) as DocumentQueueLabels['reviewStatuses'],
    docTypes,
    units: unitLabels,
  };
  const resetHref = `/t/${encodeURIComponent(slug)}/documents`;

  return (
    <div className="document-center grid min-w-0 gap-6">
      <header className="document-center__heading flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-foreground/70 font-mono text-xs font-medium tracking-wider uppercase">
            {t('heading.eyebrow')}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('heading.title')}</h1>
          <p className="text-foreground/70 mt-1 max-w-3xl text-sm">
            {t('heading.subtitle', { tenant: tenant.name, count: workspace.total })}
          </p>
          <p className="text-muted-foreground mt-2 text-xs font-medium">
            {t('heading.companyContext', { company: company.companyName })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DocumentActions kind="request" slug={slug} labels={actionLabels} />
          <DocumentBatchRequestUnavailable
            labels={{ title: t('batch.title'), description: t('batch.description') }}
          />
        </div>
      </header>

      <DocumentSummaryGrid
        slug={slug}
        query={query}
        summary={summary}
        labels={summaryLabels}
        locale={locale}
      />

      <section className="signal-panel document-center__workspace grid min-w-0 gap-5 rounded-2xl border p-4 sm:p-5">
        <DocumentFilters
          key={documentCenterHref(slug, query)}
          query={query}
          labels={filterLabels}
          resetHref={resetHref}
          locale={locale}
        />
        <DocumentWorkQueue
          rows={workspace.rows}
          page={workspace.page}
          totalPages={totalPages}
          slug={slug}
          query={query}
          locale={locale}
          labels={queueLabels}
          actionLabels={actionLabels}
          resetHref={resetHref}
        />
      </section>
    </div>
  );
}
