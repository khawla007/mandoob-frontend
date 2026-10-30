import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import {
  REGISTRATION_STAGE_CODES,
  REGISTRATION_STAGE_STATUSES,
  formatDubaiRegistrationTimestamp,
} from '@/lib/registration/contracts';
import { parseAdminRegistrationQuery } from '@/lib/registration/admin-query';
import { loadAdminRegistrationIndex } from '@/lib/registration/db-adapter';
import {
  adminRegistrationPagination,
  buildAdminRegistrationIndexQuery,
} from '@/lib/registration/admin-index-query';

export const dynamic = 'force-dynamic';

export default async function AdminRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // requirePlatformOperator enforces admin/super_admin + MFA + AAL2 (fail closed).
  const session = await requirePlatformOperator();
  const [t, locale, raw] = await Promise.all([
    getTranslations('registration'),
    getLocale(),
    searchParams,
  ]);
  const query = parseAdminRegistrationQuery(raw);
  const state = await loadAdminRegistrationIndex(
    { role: 'operator', actorId: session.id, actorAal: session.aal },
    buildAdminRegistrationIndexQuery(query),
  );

  const { previous, next: hasNext } = adminRegistrationPagination(
    query,
    state.kind === 'ready'
      ? { total: state.total, page: state.page, pageSize: state.pageSize }
      : null,
  );

  return (
    <div
      className="admin-management-signal admin-operational-workspace registration-management-workspace space-y-6"
      data-registration-index-source={state.kind}
    >
      <DashboardPageHeader
        eyebrow={t('admin.eyebrow')}
        title={t('admin.title')}
        description={t('admin.description')}
        className="admin-operational-heading"
      />
      <Card className="signal-panel">
        <CardContent className="pt-6">
          <form method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="grid gap-1.5 text-sm font-medium">
              {t('filters.company')}
              <Input name="company" defaultValue={query.company ?? ''} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('filters.pro')}
              <Input name="pro" defaultValue={query.pro ?? ''} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('filters.stage')}
              <select
                name="stage"
                defaultValue={query.stage}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                <option value="all">{t('filters.all')}</option>
                {REGISTRATION_STAGE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {t(`stages.${code}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              {t('filters.status')}
              <select
                name="status"
                defaultValue={query.status}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                <option value="all">{t('filters.all')}</option>
                {REGISTRATION_STAGE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`statuses.${status}`)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <Button type="submit">{t('filters.apply')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {state.kind === 'ready' ? (
        <Card className="signal-panel">
          <CardContent className="pt-6">
            <p role="status" className="text-muted-foreground mb-4 text-sm">
              {t('list.results', { count: state.total })}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground border-b text-xs">
                  <tr>
                    <th className="py-2 pr-4 font-medium">{t('list.company')}</th>
                    <th className="py-2 pr-4 font-medium">{t('list.pro')}</th>
                    <th className="py-2 pr-4 font-medium">{t('list.stage')}</th>
                    <th className="py-2 pr-4 font-medium">{t('list.status')}</th>
                    <th className="py-2 pr-4 font-medium">{t('list.progress')}</th>
                    <th className="py-2 pr-4 font-medium">{t('list.updated')}</th>
                    <th className="py-2 pr-0 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {state.value.map((row) => (
                    <tr key={row.registrationId} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{row.companyName ?? '—'}</td>
                      <td className="py-3 pr-4">{row.proName ?? '—'}</td>
                      <td className="py-3 pr-4">{t(`stages.${row.currentStage}`)}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline">{t(`statuses.${row.currentStageStatus}`)}</Badge>
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {t('workspace.stageCount', {
                          completed: row.completedStages,
                          total: row.totalStages,
                        })}
                      </td>
                      <td className="text-muted-foreground py-3 pr-4">
                        {row.updatedAt
                          ? (formatDubaiRegistrationTimestamp(row.updatedAt, locale) ?? '—')
                          : '—'}
                      </td>
                      <td className="py-3 pr-0 text-right">
                        <Link
                          className="text-primary text-sm font-medium hover:underline"
                          href={`/admin/registrations/${row.registrationId}`}
                        >
                          {t('list.view')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="signal-panel">
          <CardContent className="py-12 text-center">
            <strong className="block">
              {state.kind === 'empty' ? t('states.empty') : t('states.unavailable')}
            </strong>
            <p role="status" className="text-muted-foreground mx-auto mt-2 max-w-2xl text-sm">
              {state.kind === 'error' ? t('states.indexError') : t('states.indexUnavailable')}
            </p>
          </CardContent>
        </Card>
      )}

      <nav aria-label={t('pagination.label')} className="flex items-center justify-between gap-3">
        {previous ? (
          <Link
            className="text-primary px-3 py-2 text-sm font-medium hover:underline"
            href={previous}
          >
            {t('pagination.previous')}
          </Link>
        ) : (
          <span aria-disabled="true" className="text-muted-foreground px-3 py-2 text-sm">
            {t('pagination.previous')}
          </span>
        )}
        <span className="text-sm tabular-nums">{t('pagination.page', { page: query.page })}</span>
        {hasNext ? (
          <Link
            className="text-primary px-3 py-2 text-sm font-medium hover:underline"
            href={hasNext}
          >
            {t('pagination.next')}
          </Link>
        ) : (
          <span aria-disabled="true" className="text-muted-foreground px-3 py-2 text-sm">
            {t('pagination.next')}
          </span>
        )}
      </nav>
    </div>
  );
}
