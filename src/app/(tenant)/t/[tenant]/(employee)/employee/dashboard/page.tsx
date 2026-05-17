import { notFound } from 'next/navigation';
import { Bell, Building2, FileText, IdCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/require-role';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { getEmployeePortalSummary, type ExpiryBucket } from '@/lib/data/employee-portal';

export const dynamic = 'force-dynamic';

function bucketVariant(bucket: ExpiryBucket): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (bucket === 'expired' || bucket === 'critical') return 'destructive';
  if (bucket === 'soon') return 'secondary';
  if (bucket === 'missing') return 'outline';
  return 'default';
}

function expiryText(daysOut: number | null) {
  if (daysOut === null) return 'Not recorded';
  if (daysOut < 0) return `${Math.abs(daysOut)} days overdue`;
  if (daysOut === 0) return 'Expires today';
  return `${daysOut} days left`;
}

export default async function EmployeeDashboardPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const session = await requireRole('employee');
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant || tenant.id !== session.tenantId) notFound();

  const summary = await getEmployeePortalSummary(session.id, tenant.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {summary.employeeName}
          {summary.clientName ? ` at ${summary.clientName}` : ''}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Company file</CardTitle>
            <Building2 className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{summary.clientName ?? 'Not linked'}</p>
            <p className="text-muted-foreground mt-1 text-xs">Employee self-service record</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Visa</CardTitle>
            <IdCard className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-lg font-semibold">{expiryText(summary.visaDaysOut)}</p>
            <Badge variant={bucketVariant(summary.visaBucket)}>{summary.visaExpiry ?? 'Missing'}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Emirates ID</CardTitle>
            <IdCard className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-lg font-semibold">{expiryText(summary.eidDaysOut)}</p>
            <Badge variant={bucketVariant(summary.eidBucket)}>{summary.eidExpiry ?? 'Missing'}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium">Documents</CardTitle>
            <FileText className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {summary.approvedDocumentCount}/{summary.documentCount} approved
            </p>
            <p className="text-muted-foreground mt-1 text-xs">Linked to your employee record</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Renewal reminders</CardTitle>
          <Bell className="text-muted-foreground size-4" />
        </CardHeader>
        <CardContent>
          <Badge variant={summary.renewalRemindersEnabled ? 'default' : 'secondary'}>
            {summary.renewalRemindersEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
          <p className="text-muted-foreground mt-2 text-sm">
            Your preference is stored for employee renewal notification delivery.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
