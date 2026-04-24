import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type Role = 'super_admin' | 'pro' | 'customer' | 'employee';
export type ProfileStatus = 'active' | 'invited' | 'disabled';

export type UserRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: Role | null;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  status: ProfileStatus | null;
  createdAt: string;
  lastSignInAt: string | null;
};

export type ListUsersArgs = {
  page?: number;
  perPage?: number;
  role?: Role;
  tenantId?: string;
  q?: string;
};

export async function listUsersWithProfiles(args: ListUsersArgs = {}): Promise<{
  rows: UserRow[];
  total: number;
}> {
  const { page = 1, perPage = 50, role, tenantId, q } = args;
  const admin = createSupabaseServiceRoleClient();

  const { data: authList, error: authErr } = await admin.auth.admin.listUsers({
    page,
    perPage,
  });
  if (authErr) throw authErr;

  const ids = authList.users.map((u) => u.id);
  if (ids.length === 0) return { rows: [], total: authList.total ?? 0 };

  const { data: profiles, error: profilesErr } = await admin
    .from('profiles')
    .select('id, tenant_id, role, status, full_name')
    .in('id', ids);
  if (profilesErr) throw profilesErr;

  const tenantIds = Array.from(
    new Set(profiles?.map((p) => p.tenant_id).filter((v): v is string => !!v) ?? []),
  );
  const { data: tenants } = tenantIds.length
    ? await admin.from('tenants').select('id, slug, name').in('id', tenantIds)
    : { data: [] as { id: string; slug: string; name: string }[] };

  const profileById = new Map(profiles?.map((p) => [p.id, p]) ?? []);
  const tenantById = new Map(tenants?.map((t) => [t.id, t]) ?? []);

  let rows: UserRow[] = authList.users.map((u) => {
    const p = profileById.get(u.id);
    const t = p?.tenant_id ? tenantById.get(p.tenant_id) : undefined;
    return {
      id: u.id,
      email: u.email ?? null,
      fullName: (p?.full_name as string | null) ?? null,
      role: (p?.role as Role | null) ?? null,
      tenantId: (p?.tenant_id as string | null) ?? null,
      tenantSlug: t?.slug ?? null,
      tenantName: t?.name ?? null,
      status: (p?.status as ProfileStatus | null) ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
    };
  });

  if (role) rows = rows.filter((r) => r.role === role);
  if (tenantId) rows = rows.filter((r) => r.tenantId === tenantId);
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter(
      (r) => r.email?.toLowerCase().includes(needle) || r.fullName?.toLowerCase().includes(needle),
    );
  }

  return { rows, total: authList.total ?? rows.length };
}
