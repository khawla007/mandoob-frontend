import { notFound } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/require-role';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { getEmployeeIdentity, type ExpiryBucket } from '@/lib/data/employee-portal';

export const dynamic = 'force-dynamic';

function bucketVariant(bucket: ExpiryBucket): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (bucket === 'expired' || bucket === 'critical') return 'destructive';
  if (bucket === 'soon') return 'secondary';
  if (bucket === 'missing') return 'outline';
  return 'default';
}

function masked(value: string | null) {
  if (!value) return 'Not recorded';
  if (value.length <= 4) return value;
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function Row({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="flex items-center gap-2 text-sm font-medium">
        <span>{value}</span>
        {badge}
      </dd>
    </div>
  );
}

export default async function EmployeeIdentityPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const session = await requireRole('employee');
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant || tenant.id !== session.tenantId) notFound();

  const identity = await getEmployeeIdentity(session.id, tenant.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visa & Emirates ID</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Read-only identity records maintained by your PRO firm.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="size-5" />
            Identity file
          </CardTitle>
          <CardDescription>
            Sensitive numbers are masked here. Ask your PRO firm to correct official document values.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl>
            <Row label="Employee" value={identity.employeeName} />
            <Row label="Company" value={identity.clientName ?? 'Not linked'} />
            <Row label="Nationality" value={identity.nationality ?? 'Not recorded'} />
            <Row label="Passport number" value={masked(identity.passportNo)} />
            <Row
              label="Visa number"
              value={masked(identity.visaNo)}
              badge={<Badge variant={bucketVariant(identity.visaBucket)}>{identity.visaExpiry ?? 'Missing'}</Badge>}
            />
            <Row
              label="Emirates ID"
              value={masked(identity.emiratesId)}
              badge={<Badge variant={bucketVariant(identity.eidBucket)}>{identity.eidExpiry ?? 'Missing'}</Badge>}
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
