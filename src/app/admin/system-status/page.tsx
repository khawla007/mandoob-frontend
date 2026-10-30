import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { loadSystemReadiness } from '@/lib/data/reporting-p3-12';

export const dynamic = 'force-dynamic';

export default async function AdminSystemStatusPage() {
  const session = await requirePlatformOperator();
  const t = await getTranslations('admin.management.systemStatus');
  const readiness = await loadSystemReadiness(session.id).catch(() => null);
  return (
    <div className="admin-management-signal admin-operational-workspace space-y-6 [&_section.grid>div]:rounded-[14px] [&_section.grid>div]:p-5">
      <DashboardPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('intro')}
        className="admin-operational-heading"
      />
      <Card>
        <CardHeader>
          <CardTitle>{t('status')}</CardTitle>
          <CardDescription>
            {readiness
              ? t('generatedAt', { value: readiness.generatedAt })
              : t('unavailableDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {readiness ? (
            readiness.components.map((component) => (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                key={component.id}
              >
                <span className="font-medium">{t(`components.${component.id}`)}</span>
                <span className="text-muted-foreground">
                  {component.state}
                  {typeof component.pending === 'number'
                    ? ` · ${t('pending', { count: component.pending })}`
                    : ''}
                </span>
              </div>
            ))
          ) : (
            <p role="alert">{t('unavailableTitle')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
