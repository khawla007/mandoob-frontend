import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { loadOperationalReport } from '@/lib/data/reporting-p3-12';

export const dynamic = 'force-dynamic';

export default async function AdminReportsPage() {
  const session = await requirePlatformOperator();
  const t = await getTranslations('admin.management.reports');
  const report = await loadOperationalReport(session.id).catch(() => null);
  const reportRows = report
    ? ([
        ['companies', report.counts.companies],
        ['activeEmployees', report.counts.activeEmployees],
        ['overdueRenewals', report.counts.overdueRenewals],
        ['scheduledMeetings', report.counts.scheduledMeetings],
        ['contactIntakes', report.counts.contactIntakes],
        ['submittedApplications', report.counts.submittedApplications],
        ['registrations', report.counts.registrations],
        ['postedFinanceJournals', report.counts.postedFinanceJournals],
      ] as const)
    : [];
  return (
    <div className="space-y-6">
      <DashboardPageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('intro')} />
      <Card>
        <CardHeader>
          <CardTitle>{t('catalog')}</CardTitle>
          <CardDescription>
            {report ? t('partialDescription') : t('errorDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {report ? (
            <>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {reportRows.map(([key, value]) => (
                  <div key={key} className="rounded-lg border p-3">
                    <dt className="text-muted-foreground text-sm">{t(`metrics.${key}`)}</dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-muted-foreground text-sm">
                {t('generatedAt', { value: report.generatedAt })}
              </p>
              <div
                role="status"
                className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
              >
                {t('unavailableSources', { value: report.unavailableSources.join(', ') })}
              </div>
              <Button asChild>
                <Link href="/admin/reports/export">{t('export')}</Link>
              </Button>
            </>
          ) : (
            <p role="alert" className="text-muted-foreground text-sm">
              {t('unavailableTitle')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
