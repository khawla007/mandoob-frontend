import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UsersTable } from '@/components/admin/UsersTable';
import { UsersToolbar } from '@/components/admin/UsersToolbar';
import { UsersEmptyState } from '@/components/admin/UsersEmptyState';
import { ProRegistryEmptyState } from '@/components/admin/ProRegistryEmptyState';
import { UsersPagination } from '@/components/admin/UsersPagination';
import { ProRegistryAppliedFilters } from '@/components/admin/ProRegistryAppliedFilters';
import { ProRegistryPagination } from '@/components/admin/ProRegistryPagination';
import { ProRegistryTable } from '@/components/admin/ProRegistryTable';
import { ProRegistryToolbar } from '@/components/admin/ProRegistryToolbar';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { ROLES, type Role } from '@/lib/auth/roles';
import {
  listUsersWithProfiles,
  type ListUsersArgs,
  type ProfileStatus,
  type SortCol,
  type SortDir,
} from '@/lib/data/users';
import { listTenants, type TenantSummary } from '@/lib/data/tenants';
import { listProRegistry } from '@/lib/data/pro-registry';
import {
  buildProRegistryHref,
  canonicalProRegistryPage,
  parseProRegistryParams,
  type RawProRegistryParams,
} from './pro-registry-params';

export const dynamic = 'force-dynamic';

const STATUS_VALUES: (ProfileStatus | 'all')[] = [
  'active',
  'invited',
  'suspended',
  'disabled',
  'all',
];
const SORT_COLS: SortCol[] = ['created_at', 'full_name'];
const SORT_DIRS: SortDir[] = ['asc', 'desc'];

type SearchParams = {
  q?: string;
  role?: string | string[];
  roles?: string;
  status?: string;
  tenant?: string;
  sort?: string;
  cursor?: string;
  created?: string;
  accountStatus?: string;
  credentialState?: string;
  eligibility?: string;
  assignment?: string;
  expiryWindow?: string;
  direction?: string;
  page?: string;
};

async function ProRegistryMode({ raw, actorId }: { raw: RawProRegistryParams; actorId: string }) {
  const t = await getTranslations('admin.user.proRegistry');
  const { filters, invalid } = parseProRegistryParams(raw);
  const result = await listProRegistry(actorId, filters);
  const canonicalPage = canonicalProRegistryPage(filters.page, result.totalPages);
  if (canonicalPage !== filters.page) {
    redirect(buildProRegistryHref(filters, { page: canonicalPage }));
  }
  const filtersActive = Boolean(
    filters.q ||
    filters.accountStatus ||
    filters.credentialState ||
    filters.eligibility ||
    filters.assignment ||
    filters.expiryWindow,
  );
  return (
    <div className="space-y-6">
      {invalid && (
        <Alert>
          <AlertTitle>{t('invalidTitle')}</AlertTitle>
          <AlertDescription>{t('invalidDescription')}</AlertDescription>
        </Alert>
      )}
      {result.items.some((item) => item.emailUnavailable) ? (
        <Alert>
          <AlertDescription>{t('partialEmail')}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('resultCount', { count: result.total })}
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/users/new?role=pro">{t('create')}</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('directoryTitle')}</CardTitle>
          <CardDescription>{t('directoryDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProRegistryToolbar filters={filters} />
          <ProRegistryAppliedFilters filters={filters} />
          {result.items.length === 0 ? (
            <ProRegistryEmptyState filtersActive={filtersActive || invalid} />
          ) : (
            <>
              <ProRegistryTable rows={result.items} filters={filters} />
              <ProRegistryPagination filters={filters} totalPages={result.totalPages} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

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
  const t = await getTranslations('admin');
  const session = await requirePlatformOperator();
  const viewerRole = session.role as Role;
  if (sp.role === 'pro' || (Array.isArray(sp.role) && sp.role.includes('pro'))) {
    return <ProRegistryMode raw={sp as RawProRegistryParams} actorId={session.id} />;
  }
  const roles = parseRoles(sp.roles ?? (typeof sp.role === 'string' ? sp.role : undefined));
  const status = parseStatus(sp.status);
  const sort = parseSort(sp.sort);

  // Post role-rebase: both super_admin and admin are platform-scoped and see
  // all tenants. The tenant filter is honored for either role.
  const isPlatformAdmin = viewerRole === 'super_admin' || viewerRole === 'admin';
  const args: ListUsersArgs = {
    cursor: sp.cursor ?? null,
    roles,
    status,
    tenantId: isPlatformAdmin ? (sp.tenant ?? null) : null,
    q: sp.q,
    sort,
    viewer: { role: viewerRole, tenantId: session.tenantId },
  };

  const [{ rows, nextCursor, hasMore }, tenants] = await Promise.all([
    listUsersWithProfiles(args),
    isPlatformAdmin ? listTenants() : Promise.resolve<TenantSummary[]>([]),
  ]);

  const filtersActive = Boolean(
    sp.q || sp.roles || sp.role || (sp.status && sp.status !== 'all') || sp.tenant,
  );

  return (
    <div className="space-y-6">
      {sp.created && (
        <Alert>
          <AlertTitle>{t('user.createdAlertTitle')}</AlertTitle>
          <AlertDescription>{t('user.createdAlertDescription')}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('user.listTitle')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('user.listShowing', { count: rows.length, more: hasMore ? 'true' : 'false' })}
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/users/new">{t('user.createUser')}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('user.directoryTitle')}</CardTitle>
          <CardDescription>{t('user.directoryDescription')}</CardDescription>
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
