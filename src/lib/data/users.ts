import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { ROLES, type Role } from '@/lib/auth/roles';

export { type Role } from '@/lib/auth/roles';
export type ProfileStatus = 'active' | 'invited' | 'disabled';
export type SortCol = 'created_at' | 'full_name';
export type SortDir = 'asc' | 'desc';

export type UserRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: Role | null;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  status: ProfileStatus | null;
  avatarUrl: string | null;
  createdAt: string;
  lastSignInAt: string | null;
};

export type ListUsersArgs = {
  cursor?: string | null;
  perPage?: number;
  roles?: Role[];
  status?: ProfileStatus | 'all';
  tenantId?: string | null;
  q?: string;
  sort?: { col: SortCol; dir: SortDir };
  viewer: { role: Role; tenantId: string | null };
};

export type ListUsersResult = {
  rows: UserRow[];
  nextCursor: string | null;
  hasMore: boolean;
};

const DEFAULT_PER_PAGE = 50;
const EMAIL_SEARCH_CEILING = 200;

type CursorPayload = { createdAt: string; id: string };

function encodeCursor(p: CursorPayload): string {
  return Buffer.from(`${p.createdAt}|${p.id}`).toString('base64url');
}

function decodeCursor(raw: string | null | undefined): CursorPayload | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const [createdAt, id] = decoded.split('|');
    if (!createdAt || !id || !isUuid(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

function escapeOrValue(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export async function listUsersWithProfiles(args: ListUsersArgs): Promise<ListUsersResult> {
  const admin = createSupabaseServiceRoleClient();
  const perPage = args.perPage ?? DEFAULT_PER_PAGE;
  const sort = args.sort ?? { col: 'created_at' as SortCol, dir: 'desc' as SortDir };
  const ascending = sort.dir === 'asc';

  const allowedRoles =
    args.viewer.role === 'pro'
      ? ROLES.filter((r) => r !== 'super_admin' && r !== 'admin')
      : [...ROLES];
  const requestedRoles = (args.roles ?? []).filter((r) => allowedRoles.includes(r));
  const effectiveRoles = requestedRoles.length ? requestedRoles : null;

  let emailMatchIds: string[] | null = null;
  if (args.q && args.q.trim()) {
    const needle = args.q.trim().toLowerCase();
    const { data: authPage, error: authErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: EMAIL_SEARCH_CEILING,
    });
    if (authErr) throw authErr;
    emailMatchIds = (authPage?.users ?? [])
      .filter((u) => (u.email ?? '').toLowerCase().includes(needle))
      .map((u) => u.id);
  }

  let query = admin
    .from('profiles')
    .select('id, full_name, role, tenant_id, status, avatar_url, created_at, tenants(slug, name)');

  if (effectiveRoles) query = query.in('role', effectiveRoles);
  if (args.status && args.status !== 'all') query = query.eq('status', args.status);
  if (args.viewer.role === 'pro') {
    if (!args.viewer.tenantId) return { rows: [], nextCursor: null, hasMore: false };
    query = query.eq('tenant_id', args.viewer.tenantId);
  } else if (args.tenantId) {
    query = query.eq('tenant_id', args.tenantId);
  }

  if (args.q && args.q.trim()) {
    const safeNeedle = escapeOrValue(`%${args.q.trim()}%`);
    const ids = (emailMatchIds ?? []).filter(isUuid).join(',');
    if (ids.length) {
      query = query.or(`full_name.ilike.${safeNeedle},id.in.(${ids})`);
    } else {
      query = query.ilike('full_name', `%${args.q.trim()}%`);
    }
  }

  if (sort.col === 'created_at') {
    query = query.order('created_at', { ascending }).order('id', { ascending });
    const cursor = decodeCursor(args.cursor);
    if (cursor) {
      const op = ascending ? 'gt' : 'lt';
      query = query.or(
        `created_at.${op}.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.${op}.${cursor.id})`,
      );
    }
    query = query.limit(perPage + 1);
  } else {
    // sort.col === 'full_name' (last_sign_in_at not sortable in this deliverable — lives on auth.users)
    query = query.order('full_name', { ascending, nullsFirst: false }).range(0, perPage - 1);
  }

  const { data: profiles, error: profilesErr } = await query;
  if (profilesErr) throw profilesErr;

  const slice = sort.col === 'created_at' ? profiles!.slice(0, perPage) : (profiles ?? []);
  const hasMore = sort.col === 'created_at' ? profiles!.length > perPage : false;

  const authResults = await Promise.all(
    slice.map((p) =>
      admin.auth.admin
        .getUserById(p.id as string)
        .catch(() => ({ data: { user: null }, error: null }) as const),
    ),
  );

  const rows: UserRow[] = slice.map((p, i) => {
    const auth = authResults[i].data?.user ?? null;
    const tenantJoin = (p as unknown as { tenants?: { slug: string; name: string } | null })
      .tenants;
    return {
      id: p.id as string,
      email: auth?.email ?? null,
      fullName: (p.full_name as string | null) ?? null,
      role: (p.role as Role | null) ?? null,
      tenantId: (p.tenant_id as string | null) ?? null,
      tenantSlug: tenantJoin?.slug ?? null,
      tenantName: tenantJoin?.name ?? null,
      status: (p.status as ProfileStatus | null) ?? null,
      avatarUrl: (p.avatar_url as string | null) ?? null,
      createdAt: p.created_at as string,
      lastSignInAt: auth?.last_sign_in_at ?? null,
    };
  });

  const last = rows[rows.length - 1];
  const nextCursor =
    sort.col === 'created_at' && hasMore && last
      ? encodeCursor({ createdAt: last.createdAt, id: last.id })
      : null;

  return { rows, nextCursor, hasMore };
}
