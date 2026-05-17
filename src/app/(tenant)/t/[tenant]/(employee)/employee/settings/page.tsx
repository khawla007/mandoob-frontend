import { notFound } from 'next/navigation';
import { ProfileTab } from '@/components/account/ProfileTab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { requireRole } from '@/lib/auth/require-role';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { getEmployeeNotificationPreferences } from '@/lib/data/employee-portal';
import { updateEmployeeReminderPreferenceAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function EmployeeSettingsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const session = await requireRole('employee');
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant || tenant.id !== session.tenantId) notFound();

  const prefs = await getEmployeeNotificationPreferences(session.id, tenant.id);
  const action = updateEmployeeReminderPreferenceAction.bind(null, tenant.slug);

  return (
    <div className="space-y-6">
      <ProfileTab />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Renewal reminders</CardTitle>
          <CardDescription>Visa and Emirates ID reminders for your own employee file.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Checkbox
                id="renewal_reminders_enabled"
                name="renewal_reminders_enabled"
                defaultChecked={prefs.renewalRemindersEnabled}
              />
              <div className="grid gap-1">
                <Label htmlFor="renewal_reminders_enabled">Send renewal reminders</Label>
                <p className="text-muted-foreground text-sm">
                  Stored for employee renewal notification delivery.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={prefs.renewalRemindersEnabled ? 'default' : 'secondary'}>
                {prefs.renewalRemindersEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
