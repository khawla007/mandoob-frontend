import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UsersTable } from '@/components/admin/UsersTable';
import { UsersToolbar } from '@/components/admin/UsersToolbar';
import { UsersEmptyState } from '@/components/admin/UsersEmptyState';
import { UsersPagination } from '@/components/admin/UsersPagination';
import { requireRole } from '@/lib/auth/require-role';
import { ROLES, type Role } from '@/lib/auth/roles';
import {
  listUsersWithProfiles,
  type ListUsersArgs,
  type ProfileStatus,
  type SortCol,
  type SortDir,
} from '@/lib/data/users';
import { listTenants, type TenantSummary } from '@/lib/data/tenants';

export const dynamic = 'force-dynamic';

const STATUS_VALUES: ('active' | 'invited' | 'disabled' | 'all')[] = [
  'active',
  'invited',
  'disabled',
  'all',
];
const SORT_COLS: SortCol[] = ['created_at', 'full_name'];
const SORT_DIRS: SortDir[] = ['asc', 'desc'];

type SearchParams = {
  q?: string;
  roles?: string;
  status?: string;
  tenant?: string;
  sort?: string;
  cursor?: string;
};

function parseRoles(raw: string | undefined): Role[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as Role[];
  const filtered = parts.filter((r) => (ROLES as readonly string[]).includes(r));
  return filtered.length ? filtered : undefined;
}

function parseStatus(raw: string | undefined): ProfileStatus | 'all' {
  return STATUS_VALUES.includes(raw as ProfileStatus | 'all')
    ? (raw as ProfileStatus | 'all')
    : 'all';
}

function parseSort(raw: string | undefined): { col: SortCol; dir: SortDir } {
  const fallback = { col: 'created_at' as SortCol, dir: 'desc' as SortDir };
  if (!raw) return fallback;
  const [col, dir] = raw.split(':');
  if (!SORT_COLS.includes(col as SortCol)) return fallback;
  if (!SORT_DIRS.includes(dir as SortDir)) return fallback;
  return { col: col as SortCol, dir: dir as SortDir };
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const session = await requireRole('super_admin', 'admin');
  const viewerRole = session.role as Role;
  const roles = parseRoles(sp.roles);
  const status = parseStatus(sp.status);
  const sort = parseSort(sp.sort);

  const args: ListUsersArgs = {
    cursor: sp.cursor ?? null,
    roles,
    status,
    tenantId: viewerRole === 'super_admin' ? (sp.tenant ?? null) : null,
    q: sp.q,
    sort,
    viewer: { role: viewerRole, tenantId: session.tenantId },
  };

  const [{ rows, nextCursor, hasMore }, tenants] = await Promise.all([
    listUsersWithProfiles(args),
    viewerRole === 'super_admin' ? listTenants() : Promise.resolve<TenantSummary[]>([]),
  ]);

  const filtersActive = Boolean(
    sp.q || sp.roles || (sp.status && sp.status !== 'all') || sp.tenant,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Showing {rows.length} {hasMore ? '(more available)' : ''}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Directory</CardTitle>
          <CardDescription>All Mandoob identities across tenants.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <UsersToolbar
            viewerRole={viewerRole}
            tenants={tenants}
            initialQ={sp.q ?? ''}
            initialRoles={roles ?? []}
            initialStatus={status}
            initialTenant={sp.tenant ?? null}
          />
          {rows.length === 0 ? (
            <UsersEmptyState filtersActive={filtersActive} />
          ) : (
            <>
              <div className="border-border/60 overflow-hidden rounded-lg border">
                <UsersTable rows={rows} sort={sort} />
              </div>
              <UsersPagination nextCursor={nextCursor} hasMore={hasMore} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
