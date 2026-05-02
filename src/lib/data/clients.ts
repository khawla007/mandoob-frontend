import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type ClientLookupRow = {
  id: string;
  company_name: string;
  status: string;
};

export type ListClientsArgs = {
  tenantId: string;
  q?: string;
  limit?: number;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function listClientsForTenant(args: ListClientsArgs): Promise<ClientLookupRow[]> {
  const admin = createSupabaseServiceRoleClient();
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  let query = admin
    .from('clients')
    .select('id, company_name, status')
    .eq('tenant_id', args.tenantId)
    .order('company_name', { ascending: true })
    .limit(limit);

  if (args.q && args.q.trim()) {
    const needle = args.q.trim().replace(/[%_]/g, (m) => `\\${m}`);
    query = query.ilike('company_name', `%${needle}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ClientLookupRow[];
}
