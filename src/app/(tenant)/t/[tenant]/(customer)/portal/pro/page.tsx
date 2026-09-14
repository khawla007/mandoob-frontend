import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import { loadCustomerAssignedPro } from '@/lib/data/customer-assigned-pro-loader';

export const dynamic = 'force-dynamic';

export default async function CustomerAssignedProPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const access = await authorizeCustomerLinkedCompanyRead(slug);
  const t = await getTranslations('customer.assignedPro');
  const assignment = access.kind === 'authorized' ? await loadCustomerAssignedPro(access) : null;

  return (
    <div className="signal-dashboard space-y-4">
      <header className="signal-dashboard__heading">
        <p className="signal-dashboard__eyebrow">{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </header>
      <Card className="signal-panel max-w-3xl">
        <CardHeader>
          <CardTitle>{t('card.title')}</CardTitle>
          <CardDescription>{t('card.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!assignment ? (
            <p role="status" className="text-muted-foreground">
              {t('states.unavailableContext')}
            </p>
          ) : assignment.kind !== 'active' ? (
            <p role="status" className="text-muted-foreground">
              {t(`states.${assignment.kind}`)}
            </p>
          ) : (
            <div className="space-y-4">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground text-xs">{t('fields.name')}</dt>
                  <dd className="mt-1 font-medium">
                    {assignment.value.fullName ?? t('notProvided')}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">{t('fields.title')}</dt>
                  <dd className="mt-1 font-medium">{assignment.value.title ?? t('notProvided')}</dd>
                </div>
              </dl>
              <p
                role="status"
                className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm"
              >
                {t('contactUnavailable')}
              </p>
            </div>
          )}
          <Link className="text-primary mt-4 inline-block text-sm font-semibold" href="/account">
            {t('account')}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
