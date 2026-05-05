import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { SessionsTable } from '@/components/admin/SessionsTable';
import { requireRole } from '@/lib/auth/require-role';
import { listActiveSessions, type SessionsWindow } from '@/lib/data/sessions-overview';
import { listProFirms } from '@/lib/data/pro-firms';
import { sessionsFiltersSchema } from '@/lib/validation/observability';

export const dynamic = 'force-dynamic';

type SearchParams = { tenant?: string; role?: string; window?: string };

const ROLE_OPTIONS = ['super_admin', 'admin', 'pro', 'customer', 'employee'] as const;
const WINDOW_OPTIONS: ReadonlyArray<{ value: SessionsWindow; label: string }> = [
  { value: '24h', label: 'Past 24 hours' },
  { value: '7d', label: 'Past 7 days' },
  { value: '30d', label: 'Past 30 days' },
  { value: 'all', label: 'All time' },
];

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireRole('super_admin');
  const sp = await searchParams;
  const filters = sessionsFiltersSchema.parse({
    tenant: sp.tenant || undefined,
    role: sp.role || undefined,
    window: sp.window || undefined,
  });

  const [rows, tenants] = await Promise.all([
    listActiveSessions({
      tenant: filters.tenant,
      role: filters.role,
      window: filters.window,
    }),
    listProFirms({}),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Active sessions across all tenants. Revoke a single session or all of a user&apos;s
          sessions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
          <CardDescription>Tenant, role, signed-in window.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 gap-3 md:grid-cols-4" action="/admin/sessions">
            <div className="md:col-span-2">
              <Label htmlFor="tenant">Tenant</Label>
              <select
                id="tenant"
                name="tenant"
                defaultValue={filters.tenant ?? ''}
                className="border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">All tenants</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                name="role"
                defaultValue={filters.role ?? ''}
                className="border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">All roles</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="window">Window</Label>
              <select
                id="window"
                name="window"
                defaultValue={filters.window}
                className="border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm"
              >
                {WINDOW_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2 md:col-span-4">
              <Button type="submit">Apply</Button>
              <Button asChild variant="outline">
                <Link href="/admin/sessions">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active sessions</CardTitle>
          <CardDescription>
            Showing {rows.length} session(s). Capped at 200 per query.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SessionsTable rows={rows} viewerUserId={session.id} />
        </CardContent>
      </Card>
    </div>
  );
}
