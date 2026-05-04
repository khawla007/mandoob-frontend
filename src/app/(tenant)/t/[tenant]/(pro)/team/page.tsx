import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TeamTable } from '@/components/pro/TeamTable';
import { InviteColleagueDialog } from '@/components/pro/InviteColleagueDialog';
import { TeamRowActions } from '@/components/pro/TeamRowActions';
import { requireRole } from '@/lib/auth/require-role';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { listTenantMembers } from '@/lib/data/tenant-metrics';

export const dynamic = 'force-dynamic';

export default async function TeamPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const session = await requireRole('pro', 'admin', 'super_admin');
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const rows = await listTenantMembers(tenant.id);
  const isAdmin = session.role === 'admin' || session.role === 'super_admin';

  const activeAdmins = rows.filter((m) => m.role === 'admin' && m.status === 'active');
  const lastActiveAdminId = activeAdmins.length === 1 ? activeAdmins[0].id : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Members and pending invitations for {tenant.name}.
          </p>
        </div>
        {isAdmin && <InviteColleagueDialog slug={slug} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Members ({rows.length})</CardTitle>
          <CardDescription>PRO agents, customers, and employees in this workspace.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <TeamTable
            rows={rows}
            rowActions={
              isAdmin
                ? (row) =>
                    row.role === 'pro' || row.role === 'admin' ? (
                      <TeamRowActions
                        slug={slug}
                        targetId={row.id}
                        targetRole={row.role}
                        targetStatus={row.status ?? 'active'}
                        callerId={session.id}
                        isLastActiveAdmin={row.id === lastActiveAdminId}
                      />
                    ) : null
                : undefined
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
