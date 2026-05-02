import 'server-only';
import { cache } from 'react';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type TenantSummary = { id: string; name: string; slug: string };

export const listTenants = cache(async (): Promise<TenantSummary[]> => {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('tenants')
    .select('id, name, slug')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TenantSummary[];
});
