import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type ResolvedProfile = {
  id: string;
  fullName: string | null;
  role: string | null;
  tenantId: string | null;
  tenantName: string | null;
};

export async function resolveProfilesByIds(
  ids: ReadonlyArray<string>,
): Promise<Map<string, ResolvedProfile>> {
  const out = new Map<string, ResolvedProfile>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return out;

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, role, tenant_id, tenants(name)')
    .in('id', unique);
  if (error) {
    console.error('resolveProfilesByIds failed', error);
    return out;
  }
  for (const row of data ?? []) {
    const tenantJoin = (row as unknown as { tenants?: { name: string } | null }).tenants;
    out.set(row.id as string, {
      id: row.id as string,
      fullName: (row.full_name as string | null) ?? null,
      role: (row.role as string | null) ?? null,
      tenantId: (row.tenant_id as string | null) ?? null,
      tenantName: tenantJoin?.name ?? null,
    });
  }
  return out;
}
