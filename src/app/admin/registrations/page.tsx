import { getTranslations } from 'next-intl/server';

import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import {
  REGISTRATION_STAGE_CODES,
  REGISTRATION_STAGE_STATUSES,
} from '@/lib/registration/contracts';
import { parseAdminRegistrationQuery } from '@/lib/registration/admin-query';
import { loadRegistrationIndex } from '@/lib/registration/unavailable-adapter';

export const dynamic = 'force-dynamic';

export default async function AdminRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformOperator();
  const [t, raw, state] = await Promise.all([
    getTranslations('registration'),
    searchParams,
    loadRegistrationIndex(),
  ]);
  const query = parseAdminRegistrationQuery(raw);
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
      <Card className="signal-panel">
        <CardContent className="py-12 text-center">
          <strong className="block">{t('states.unavailable')}</strong>
          <p role="status" className="text-muted-foreground mx-auto mt-2 max-w-2xl text-sm">
            {t('states.indexUnavailable')}
          </p>
        </CardContent>
      </Card>
      <nav aria-label={t('pagination.label')} className="flex items-center justify-between gap-3">
        <span aria-disabled="true" className="text-muted-foreground px-3 py-2 text-sm">
          {t('pagination.previous')}
        </span>
        <span className="text-sm tabular-nums">{t('pagination.page', { page: query.page })}</span>
        <span aria-disabled="true" className="text-muted-foreground px-3 py-2 text-sm">
          {t('pagination.next')}
        </span>
      </nav>
    </div>
  );
}
