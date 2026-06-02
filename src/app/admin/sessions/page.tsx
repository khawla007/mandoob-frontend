import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
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
const WINDOW_OPTIONS: ReadonlyArray<SessionsWindow> = ['24h', '7d', '30d', 'all'];

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Post role-rebase: admin reads everything super_admin reads (sessions,
  // audit logs, cross-tenant user data). Mutations stay super_admin-only —
  // SessionsTable's revoke buttons gate on viewer identity per row.
  const session = await requireRole('super_admin', 'admin');
  const t = await getTranslations('admin');
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
        <h1 className="text-2xl font-semibold tracking-tight">{t('sessions.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('sessions.intro')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('sessions.filtersTitle')}</CardTitle>
          <CardDescription>{t('sessions.filtersDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 gap-3 md:grid-cols-4" action="/admin/sessions">
            <div className="md:col-span-2">
              <Label htmlFor="tenant">{t('sessions.tenant')}</Label>
              <select
                id="tenant"
                name="tenant"
                defaultValue={filters.tenant ?? ''}
                className="border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">{t('sessions.allTenants')}</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="role">{t('sessions.role')}</Label>
              <select
                id="role"
                name="role"
                defaultValue={filters.role ?? ''}
                className="border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">{t('sessions.allRoles')}</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`enums.role.${r}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="window">{t('sessions.window')}</Label>
              <select
                id="window"
                name="window"
                defaultValue={filters.window}
                className="border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm"
              >
                {WINDOW_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {t(`sessions.windowOptions.${o}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2 md:col-span-4">
              <Button type="submit">{t('sessions.apply')}</Button>
              <Button asChild variant="outline">
                <Link href="/admin/sessions">{t('sessions.reset')}</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('sessions.activeTitle')}</CardTitle>
          <CardDescription>
            {t('sessions.activeDescription', { count: rows.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SessionsTable rows={rows} viewerUserId={session.id} />
        </CardContent>
      </Card>
    </div>
  );
}
