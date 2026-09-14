import { getLocale, getTranslations } from 'next-intl/server';

import { RegistrationWorkspace } from '@/components/registration/RegistrationWorkspace';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import { loadCustomerCompanyDisplay } from '@/lib/data/customer-company-display-loader';
import { registrationWorkspaceLabels } from '@/lib/registration/labels';
import { loadRegistrationPresentation } from '@/lib/registration/unavailable-adapter';

export const dynamic = 'force-dynamic';

export default async function CustomerRegistrationPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const access = await authorizeCustomerLinkedCompanyRead(slug);
  const [t, locale, state] = await Promise.all([
    getTranslations('registration'),
    getLocale(),
    loadRegistrationPresentation(),
  ]);
  const company = access.kind === 'authorized' ? await loadCustomerCompanyDisplay(access) : null;
  const context =
    access.kind === 'authorized' ? access.company.companyName : t('customer.companyUnavailable');
  const onboardingKind = company?.onboarding.kind ?? 'unavailable';
  return (
    <div className="space-y-6" data-company-onboarding-source={onboardingKind}>
      <DashboardPageHeader
        eyebrow={t('customer.eyebrow')}
        title={t('customer.title')}
        description={t('customer.description')}
        secondaryAction={<Badge variant="outline">{context}</Badge>}
      />
      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{t('context.title')}</CardTitle>
          <CardDescription>{t('context.customerDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div data-onboarding-lifecycle>
              <dt className="text-muted-foreground text-xs">{t('context.onboarding')}</dt>
              <dd className="mt-1 font-medium">
                {company?.onboarding.kind === 'ready'
                  ? t(`context.onboardingStatuses.${company.onboarding.value}` as never)
                  : t('states.unavailable')}
              </dd>
            </div>
            <div data-activation-readiness>
              <dt className="text-muted-foreground text-xs">{t('context.readiness')}</dt>
              <dd className="mt-1 font-medium">{t('states.unavailable')}</dd>
            </div>
            <div data-operational-lifecycle>
              <dt className="text-muted-foreground text-xs">{t('context.operational')}</dt>
              <dd className="mt-1 font-medium">
                {company?.lifecycle.kind === 'ready'
                  ? t(`context.operationalStatuses.${company.lifecycle.value}` as never)
                  : t('states.unavailable')}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <RegistrationWorkspace
        state={state}
        role="customer"
        locale={locale}
        labels={registrationWorkspaceLabels(t as unknown as (key: string) => string)}
      />
    </div>
  );
}
