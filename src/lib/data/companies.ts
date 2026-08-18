import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type CompanyLookupRow = {
  id: string;
  company_name: string;
  status: string;
};

export type ListCompaniesArgs = {
  tenantId: string;
  q?: string;
  limit?: number;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function listCompaniesForTenant(args: ListCompaniesArgs): Promise<CompanyLookupRow[]> {
  const admin = createSupabaseServiceRoleClient();
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  let query = admin
    .from('company_profiles')
    .select('id, company_name, status')
    .eq('tenant_id', args.tenantId)
    .order('company_name', { ascending: true })
    .limit(limit);

  if (args.q && args.q.trim()) {
    const needle = args.q.trim().replace(/[%_]/g, (match) => `\\${match}`);
    query = query.ilike('company_name', `%${needle}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CompanyLookupRow[];
}
