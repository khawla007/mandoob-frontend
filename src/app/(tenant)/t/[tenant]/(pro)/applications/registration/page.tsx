import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import { RegistrationWorkspace } from '@/components/registration/RegistrationWorkspace';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { registrationWorkspaceLabels } from '@/lib/registration/labels';
import { loadRegistrationPresentation } from '@/lib/registration/unavailable-adapter';

export const dynamic = 'force-dynamic';
export default async function ProRegistrationPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();
  const [t, locale, state] = await Promise.all([
    getTranslations('registration'),
    getLocale(),
    loadRegistrationPresentation(),
  ]);
  const completedSections = Object.values(company.sectionProgress).filter(
    (status) => status === 'complete',
  ).length;
  return (
    <div className="space-y-6">
      <DashboardPageHeader
        eyebrow={t('pro.eyebrow')}
        title={t('pro.title')}
        description={t('pro.description')}
        secondaryAction={<Badge variant="outline">{company.companyName}</Badge>}
      />
      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{t('context.title')}</CardTitle>
          <CardDescription>{t('context.proDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div data-legal-progress>
              <dt className="text-muted-foreground text-xs">{t('context.legal')}</dt>
              <dd className="mt-1 font-medium">
                {t('context.legalProgress', {
                  complete: completedSections,
                  total: Object.keys(company.sectionProgress).length,
                })}
              </dd>
            </div>
            <div data-onboarding-lifecycle>
              <dt className="text-muted-foreground text-xs">{t('context.onboarding')}</dt>
              <dd className="mt-1 font-medium">
                {t(`context.onboardingStatuses.${company.onboardingStatus}`)}
              </dd>
            </div>
            <div data-activation-readiness>
              <dt className="text-muted-foreground text-xs">{t('context.readiness')}</dt>
              <dd className="mt-1 font-medium">
                {company.readinessState === 'data'
                  ? t('context.readinessItems', { count: company.readinessCodes.length })
                  : t('states.unavailable')}
              </dd>
            </div>
            <div data-operational-lifecycle>
              <dt className="text-muted-foreground text-xs">{t('context.operational')}</dt>
              <dd className="mt-1 font-medium">
                {t(`context.operationalStatuses.${company.status}`)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <RegistrationWorkspace
        state={state}
        role="pro"
        locale={locale}
        labels={registrationWorkspaceLabels(t as unknown as (key: string) => string)}
      />
    </div>
  );
}
