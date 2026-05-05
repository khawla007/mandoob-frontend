import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { ClientStatus } from '@/lib/validation/client';

export type ProClientRow = {
  id: string;
  company_name: string;
  status: ClientStatus;
  jurisdiction: string | null;
  trade_license_no: string | null;
  license_expiry: string | null;
  updated_at: string;
};

export type ListProClientsArgs = {
  tenantId: string;
  status?: ClientStatus | 'all';
  q?: string | null;
};

export async function listClientsForPro(args: ListProClientsArgs): Promise<ProClientRow[]> {
  const admin = createSupabaseServiceRoleClient();
  let query = admin
    .from('clients')
    .select('id, company_name, status, jurisdiction, trade_license_no, license_expiry, updated_at')
    .eq('tenant_id', args.tenantId)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (args.status && args.status !== 'all') {
    query = query.eq('status', args.status);
  }
  if (args.q && args.q.trim().length > 0) {
    const needle = args.q.trim().replace(/[%_]/g, (m) => `\\${m}`);
    query = query.ilike('company_name', `%${needle}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('listClientsForPro failed', error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    company_name: r.company_name as string,
    status: r.status as ClientStatus,
    jurisdiction: (r.jurisdiction as string | null) ?? null,
    trade_license_no: (r.trade_license_no as string | null) ?? null,
    license_expiry: (r.license_expiry as string | null) ?? null,
    updated_at: r.updated_at as string,
  }));
}
