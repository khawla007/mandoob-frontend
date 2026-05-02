import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
};

export async function resolveTenantBySlug(slug: string): Promise<Tenant | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin
    .from('tenants')
    .select('id, slug, name, plan, status')
    .eq('slug', slug)
    .maybeSingle();
  return (data as Tenant | null) ?? null;
}

export function isTenantActive(status: string): boolean {
  return status === 'active';
}
