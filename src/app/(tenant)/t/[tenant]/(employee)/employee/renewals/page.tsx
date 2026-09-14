import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { CalendarCheck2, CalendarClock, CircleAlert, Clock3 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardRouteState } from '@/components/shell/DashboardRouteStates';
import {
  authorizeEmployeePortalRead,
  employeePortalHref,
  loadEmployeeRenewals,
  type EmployeeDeadline,
} from '@/lib/data/employee-portal-workspace';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null, locale: string, fallback: string) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Dubai', dateStyle: 'long' }).format(
    new Date(`${value}T12:00:00.000Z`),
  );
}

export default async function EmployeeRenewalsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const access = await authorizeEmployeePortalRead(slug);
  const [workspace, t, tCommon, tDeadline, tActions, locale] = await Promise.all([
    loadEmployeeRenewals(access),
    getTranslations('employee.renewals'),
    getTranslations('employee.common'),
    getTranslations('employee.deadline'),
    getTranslations('employee.actions'),
    getLocale(),
  ]);
  const summary = [
    [t('overdue'), workspace.summaries.overdue, CircleAlert],
    [t('dueSoon'), workspace.summaries.dueSoon, Clock3],
    [t('upcoming'), workspace.summaries.upcoming, CalendarClock],
    [t('completed'), workspace.summaries.completed, CalendarCheck2],
  ] as const;
  const deadlineLabel = (deadline: EmployeeDeadline) =>
    tDeadline(deadline.kind, { count: Math.abs(deadline.daysOut ?? 0) });
  const renewalLabel = (renewal: (typeof workspace.value)[number]) => {
    if (renewal.source === 'identity-date' && renewal.type === 'visa') return t('visaFallback');
    if (renewal.source === 'identity-date' && renewal.type === 'eid') return t('eidFallback');
    return renewal.label.trim() || tCommon('notRecorded');
  };

  return (
    <div className="signal-dashboard space-y-5">
      <header className="signal-dashboard__heading">
        <p className="signal-dashboard__eyebrow">{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('title')}>
        {summary.map(([label, value, Icon]) => (
          <Card key={label} className="signal-panel">
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div>
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value ?? tCommon('unavailable')}</p>
              </div>
              <Icon aria-hidden="true" className="text-primary size-5" />
            </CardContent>
          </Card>
        ))}
      </section>
      {workspace.kind === 'error' ? (
        <DashboardRouteState
          state="error"
          variant="panel"
          title={t('errorTitle')}
          safeDescription={t('errorDescription')}
          safeHref={employeePortalHref(access.tenant.slug, 'dashboard')}
          safeHrefLabel={tActions('profile')}
        />
      ) : workspace.kind === 'empty' ? (
        <DashboardRouteState
          state="empty"
          variant="panel"
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Link
              className="text-primary text-sm font-semibold"
              href={employeePortalHref(access.tenant.slug, 'identity')}
            >
              {tActions('visa')}
            </Link>
          }
        />
      ) : (
        <Card className="signal-panel">
          <CardHeader>
            <CardTitle>{t('timeline')}</CardTitle>
            <CardDescription>{t('requirementsUnavailable')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="divide-y">
              {workspace.value.map((renewal, index) => (
                <li
                  key={`${renewal.type}-${index}`}
                  className="grid gap-3 py-4 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{renewalLabel(renewal)}</p>
                      <Badge
                        variant={
                          renewal.deadline.kind === 'overdue' ||
                          renewal.deadline.kind === 'status-conflict'
                            ? 'destructive'
                            : 'outline'
                        }
                      >
                        {deadlineLabel(renewal.deadline)}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {formatDate(renewal.dueDate, locale, tCommon('notRecorded'))}
                    </p>
                    {renewal.source === 'identity-date' ? (
                      <p className="text-muted-foreground mt-2 text-sm">{t('identityFallback')}</p>
                    ) : null}
                  </div>
                  {renewal.type === 'visa' || renewal.type === 'eid' ? (
                    <Link
                      className="text-primary self-start text-sm font-semibold"
                      href={employeePortalHref(
                        access.tenant.slug,
                        'identity',
                        renewal.type === 'eid' ? 'emirates-id' : 'visa',
                      )}
                    >
                      {tCommon('viewDetails')}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ol>
            {workspace.hasMore ? (
              <p role="status" className="text-muted-foreground mt-4 border-t pt-4 text-sm">
                {t('hasMore')}
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
