import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { EmployeeReminderPreferenceForm } from '@/components/employee/EmployeeReminderPreferenceForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getEmployeeNotificationPreferences } from '@/lib/data/employee-portal';
import {
  authorizeEmployeePortalRead,
  employeePortalHref,
} from '@/lib/data/employee-portal-workspace';

export const dynamic = 'force-dynamic';

export default async function EmployeeSettingsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const access = await authorizeEmployeePortalRead(slug);
  const [prefs, t] = await Promise.all([
    getEmployeeNotificationPreferences(access.session.id, access.tenant.id),
    getTranslations('employee.settings'),
  ]);
  return (
    <div className="space-y-5">
      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{t('accountTitle')}</CardTitle>
          <CardDescription>{t('accountDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            className="text-primary text-sm font-semibold"
            href={employeePortalHref(access.tenant.slug, 'profile')}
          >
            {t('openProfile')}
          </Link>
        </CardContent>
      </Card>
      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{t('remindersTitle')}</CardTitle>
          <CardDescription>{t('remindersDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <EmployeeReminderPreferenceForm
            slug={access.tenant.slug}
            enabled={prefs.renewalRemindersEnabled}
          />
        </CardContent>
      </Card>
      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{t('privacyTitle')}</CardTitle>
          <CardDescription>{t('privacyDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            className="text-primary text-sm font-semibold"
            href={employeePortalHref(access.tenant.slug, 'security')}
          >
            {t('openSecurity')}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
