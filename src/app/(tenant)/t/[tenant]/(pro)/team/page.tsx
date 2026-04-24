import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TeamTable } from '@/components/pro/TeamTable';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { listTenantMembers } from '@/lib/data/tenant-metrics';

export const dynamic = 'force-dynamic';

export default async function TeamPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const rows = await listTenantMembers(tenant.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Members and pending invitations for {tenant.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Members ({rows.length})</CardTitle>
          <CardDescription>PRO agents, customers, and employees in this workspace.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <TeamTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
