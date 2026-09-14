import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authorizeEmployeePortalRead } from '@/lib/data/employee-portal-workspace';

export const dynamic = 'force-dynamic';

export default async function EmployeeSettingsSecurityPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  await authorizeEmployeePortalRead(slug);
  const t = await getTranslations('employee.settings');
  return (
    <Card className="signal-panel">
      <CardHeader>
        <CardTitle>{t('securityTitle')}</CardTitle>
        <CardDescription>{t('securityDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link className="text-primary text-sm font-semibold" href="/account/security">
          {t('openAccountSecurity')}
        </Link>
      </CardContent>
    </Card>
  );
}
