import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  Bell,
  Building2,
  CalendarClock,
  FileText,
  IdCard,
  Settings,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  EMPLOYEE_SIGNAL_ORDER,
  authorizeEmployeePortalRead,
  classifyEmployeeDeadline,
  employeePortalHref,
  loadEmployeeOverview,
  type EmployeeDeadline,
} from '@/lib/data/employee-portal-workspace';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null, locale: string, fallback: string) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Dubai', dateStyle: 'medium' }).format(
    new Date(`${value}T12:00:00.000Z`),
  );
}

function deadlineText(
  deadline: EmployeeDeadline,
  t: Awaited<ReturnType<typeof getTranslations<'employee.deadline'>>>,
) {
  return t(deadline.kind, { count: Math.abs(deadline.daysOut ?? 0) });
}

function tone(deadline: EmployeeDeadline): 'destructive' | 'secondary' | 'outline' {
  if (deadline.kind === 'overdue' || deadline.kind === 'status-conflict') return 'destructive';
  if (deadline.kind === 'due-today' || deadline.kind === 'due-soon') return 'secondary';
  return 'outline';
}

export default async function EmployeeDashboardPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const access = await authorizeEmployeePortalRead(slug);
  const [overview, t, tCommon, tDeadline, tActions, tDocuments, locale] = await Promise.all([
    loadEmployeeOverview(access),
    getTranslations('employee.dashboard'),
    getTranslations('employee.common'),
    getTranslations('employee.deadline'),
    getTranslations('employee.actions'),
    getTranslations('employee.documents'),
    getLocale(),
  ]);
  const href = (route: Parameters<typeof employeePortalHref>[1], anchor?: string) =>
    employeePortalHref(access.tenant.slug, route, anchor);
  const visaDeadline = classifyEmployeeDeadline(access.employee.visaExpiry, 'identity-date');
  const eidDeadline = classifyEmployeeDeadline(access.employee.eidExpiry, 'identity-date');
  const documents = 'requests' in overview.documents ? overview.documents : null;
  const renewals = 'summaries' in overview.renewals ? overview.renewals : null;
  const nearestRenewal = renewals?.nearest;
  const assignedPro = overview.assignment.kind === 'active' ? overview.assignment.value : null;
  const generatedLabel = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Dubai',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(overview.generatedAt));

  const signalValue = (signal: (typeof EMPLOYEE_SIGNAL_ORDER)[number]) => {
    if (signal === 'visa') return deadlineText(visaDeadline, tDeadline);
    if (signal === 'emirates-id') return deadlineText(eidDeadline, tDeadline);
    if (signal === 'renewal')
      return renewals?.kind === 'error'
        ? tCommon('sourceError')
        : nearestRenewal
          ? deadlineText(nearestRenewal.deadline, tDeadline)
          : t('signals.renewalEmpty');
    if (!documents || documents.awaitingActionCount === null) return tCommon('sourceError');
    return documents.awaitingActionCount === 0
      ? t('signals.noneAwaiting')
      : t('signals.awaiting', { count: documents.awaitingActionCount });
  };
  const signalHref = (signal: (typeof EMPLOYEE_SIGNAL_ORDER)[number]) => {
    if (signal === 'visa') return href('identity', 'visa');
    if (signal === 'emirates-id') return href('identity', 'emirates-id');
    return signal === 'renewal' ? href('renewals') : href('documents');
  };
  const assignmentText =
    overview.assignment.kind === 'missing'
      ? t('assignmentMissing')
      : overview.assignment.kind === 'released'
        ? t('assignmentReleased')
        : overview.assignment.kind === 'unavailable'
          ? t('assignmentUnavailable')
          : overview.assignment.kind === 'error'
            ? t('assignmentError')
            : (assignedPro?.name ?? tCommon('notRecorded'));
  const reviewLabel = (status: string | null) => {
    if (status === 'pending' || status === 'approved' || status === 'rejected') {
      return tDocuments(`review.${status}`);
    }
    return status ? tDocuments('review.submitted') : tDocuments('review.missing');
  };

  return (
    <div className="signal-dashboard space-y-5">
      <header
        data-region="employee-masthead"
        className="signal-panel grid gap-5 overflow-hidden p-5 lg:grid-cols-[minmax(0,1fr)_19rem]"
      >
        <div className="min-w-0 self-center">
          <p className="signal-dashboard__eyebrow">{t('eyebrow')}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {access.employee.name ? t('titleNamed', { name: access.employee.name }) : t('title')}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">{t('subtitle')}</p>
          <p className="text-muted-foreground mt-3 font-mono text-xs">
            {tCommon('generated', { date: generatedLabel })}
          </p>
        </div>
        <section aria-labelledby="quick-info-title" className="bg-muted/45 rounded-xl border p-4">
          <h2 id="quick-info-title" className="text-sm font-semibold">
            {t('quickInfo')}
          </h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground flex items-center gap-2 text-xs">
                <Building2 aria-hidden="true" className="size-4" /> {tCommon('company')}
              </dt>
              <dd className="mt-1 font-medium">
                {access.company?.kind === 'active'
                  ? (access.company.name ?? t('companyMissing'))
                  : access.company?.kind === 'inactive'
                    ? t('companyInactive')
                    : t('companyMissing')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground flex items-center gap-2 text-xs">
                <UserRound aria-hidden="true" className="size-4" /> {tCommon('assignedPro')}
              </dt>
              <dd className="mt-1 font-medium">{assignmentText}</dd>
            </div>
          </dl>
        </section>
      </header>

      <section data-region="employee-signal-strip" aria-label={t('quickInfo')}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {EMPLOYEE_SIGNAL_ORDER.map((signal, index) => {
            const icons = [ShieldCheck, IdCard, CalendarClock, FileText];
            const Icon = icons[index]!;
            return (
              <Link
                key={signal}
                href={signalHref(signal)}
                className="signal-panel group min-w-0 p-4 transition-transform motion-safe:hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-xs font-medium">
                      {t(`signals.${signal}`)}
                    </p>
                    <p className="mt-2 text-lg leading-6 font-semibold">{signalValue(signal)}</p>
                  </div>
                  <span className="bg-primary/10 text-primary rounded-lg p-2">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section data-region="employee-identity-panels" aria-labelledby="identity-panels-title">
        <h2 id="identity-panels-title" className="sr-only">
          {t('identityPanels')}
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            {
              kind: 'visa',
              title: t('visaTitle'),
              masked: access.employee.visaMasked,
              expiry: access.employee.visaExpiry,
              deadline: visaDeadline,
            },
            {
              kind: 'emirates-id',
              title: t('eidTitle'),
              masked: access.employee.emiratesIdMasked,
              expiry: access.employee.eidExpiry,
              deadline: eidDeadline,
            },
          ].map((item) => (
            <Card key={item.kind} className="signal-panel min-w-0 overflow-hidden">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{item.title}</CardTitle>
                  <Link
                    className="text-primary text-sm font-semibold"
                    href={href('identity', item.kind)}
                  >
                    {tCommon('viewDetails')}
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground text-xs">{tCommon('identifier')}</p>
                  <p className="mt-1 font-mono text-lg font-semibold">
                    {item.masked ?? tCommon('notRecorded')}
                  </p>
                  <Badge className="mt-3" variant="outline">
                    {tCommon('lifecycleUnavailable')}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{tCommon('expiry')}</p>
                  <p className="mt-1 font-medium">
                    {formatDate(item.expiry, locale, tCommon('notRecorded'))}
                  </p>
                  <Badge className="mt-3" variant={tone(item.deadline)}>
                    {deadlineText(item.deadline, tDeadline)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card data-region="employee-documents-panel" className="signal-panel min-w-0">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{t('documentsTitle')}</CardTitle>
                <CardDescription>{t('documentsDescription')}</CardDescription>
              </div>
              <Link className="text-primary text-sm font-semibold" href={href('documents')}>
                {tCommon('viewAll')}
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {!documents ? (
              <p role="status" className="text-muted-foreground text-sm">
                {tCommon('sourceError')}
              </p>
            ) : documents.documents.kind === 'ready' ? (
              <ul className="divide-y">
                {documents.documents.value.slice(0, 4).map((document, index) => (
                  <li
                    key={`${document.docType}-${index}`}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">{document.label}</span>
                    <Badge variant="outline">{reviewLabel(document.reviewStatus)}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status" className="text-muted-foreground text-sm">
                {documents.documents.kind === 'error'
                  ? tCommon('sourceError')
                  : t('documentsEmpty')}
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-region="employee-renewals-panel" className="signal-panel min-w-0">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{t('renewalsTitle')}</CardTitle>
                <CardDescription>{t('renewalsDescription')}</CardDescription>
              </div>
              <Link className="text-primary text-sm font-semibold" href={href('renewals')}>
                {tCommon('viewAll')}
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {renewals?.kind === 'ready' ? (
              <ul className="divide-y">
                {renewals.value.slice(0, 4).map((renewal, index) => (
                  <li key={`${renewal.type}-${index}`} className="py-3 first:pt-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium">{renewal.label}</span>
                      <Badge variant={tone(renewal.deadline)}>
                        {deadlineText(renewal.deadline, tDeadline)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status" className="text-muted-foreground text-sm">
                {overview.renewals.kind === 'error' ? tCommon('sourceError') : t('renewalsEmpty')}
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-region="employee-notifications-panel" className="signal-panel min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell aria-hidden="true" className="size-5" /> {t('notificationsTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              role="status"
              className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm leading-6"
            >
              {t('notificationsUnavailable')}
            </p>
          </CardContent>
        </Card>
      </div>

      <section
        data-region="employee-quick-actions"
        className="signal-panel p-5"
        aria-labelledby="quick-actions-title"
      >
        <h2 id="quick-actions-title" className="text-sm font-semibold">
          {t('quickActions')}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            [tActions('profile'), href('profile'), UserRound],
            [tActions('visa'), href('identity', 'visa'), ShieldCheck],
            [tActions('eid'), href('identity', 'emirates-id'), IdCard],
            [tActions('documents'), href('documents'), FileText],
            [tActions('renewals'), href('renewals'), CalendarClock],
            [tActions('settings'), href('settings'), Settings],
          ].map(([label, destination, Icon]) => (
            <Link
              key={String(destination)}
              href={String(destination)}
              className="bg-muted/35 hover:bg-muted flex min-h-12 items-center gap-3 rounded-lg border p-3 text-sm font-medium"
            >
              <Icon aria-hidden="true" className="text-primary size-4" /> {String(label)}
            </Link>
          ))}
        </div>
      </section>

      <aside
        data-region="employee-pro-help"
        className="signal-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h2 className="font-semibold">{t('helpTitle')}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t('helpDescription')}</p>
          {assignedPro ? (
            <p className="mt-2 text-sm font-medium">
              {assignedPro.name ?? tCommon('notRecorded')} · {tCommon('contactUnavailable')}
            </p>
          ) : null}
        </div>
        <Link className="text-primary text-sm font-semibold" href={href('profile')}>
          {t('openProfile')}
        </Link>
      </aside>
    </div>
  );
}
