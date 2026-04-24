import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { UsersTable } from '@/components/admin/UsersTable';
import { UsersToolbar } from '@/components/admin/UsersToolbar';
import { listUsersWithProfiles, type Role } from '@/lib/data/users';

export const dynamic = 'force-dynamic';

const ROLE_VALUES: Role[] = ['super_admin', 'pro', 'customer', 'employee'];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const role = ROLE_VALUES.includes(sp.role as Role) ? (sp.role as Role) : undefined;
  const page = Math.max(1, Number(sp.page ?? '1') || 1);
  const { rows, total } = await listUsersWithProfiles({
    q: sp.q,
    role,
    page,
    perPage: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {total} total · showing {rows.length} on this page.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Directory</CardTitle>
          <CardDescription>All Mandoob identities across tenants.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <UsersToolbar />
          <div className="border-border/60 overflow-hidden rounded-lg border">
            <UsersTable rows={rows} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
