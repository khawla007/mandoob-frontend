import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { TenantPlan, TenantStatus } from '@/lib/validation/tenant-onboarding';

export type ProFirmRow = {
  id: string;
  slug: string;
  name: string;
  plan: TenantPlan;
  status: TenantStatus;
  createdAt: string;
};

export type ListProFirmsArgs = {
  status?: TenantStatus | 'all';
  q?: string | null;
};

export async function listProFirms(args: ListProFirmsArgs = {}): Promise<ProFirmRow[]> {
  const admin = createSupabaseServiceRoleClient();
  let query = admin
    .from('tenants')
    .select('id, slug, name, plan, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (args.status && args.status !== 'all') {
    query = query.eq('status', args.status);
  }
  if (args.q && args.q.trim().length > 0) {
    const needle = args.q.trim();
    query = query.or(`name.ilike.%${needle}%,slug.ilike.%${needle}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('listProFirms failed', error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    plan: r.plan as TenantPlan,
    status: r.status as TenantStatus,
    createdAt: r.created_at as string,
  }));
}

export async function getProFirmById(id: string): Promise<ProFirmRow | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('tenants')
    .select('id, slug, name, plan, status, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id as string,
    slug: data.slug as string,
    name: data.name as string,
    plan: data.plan as TenantPlan,
    status: data.status as TenantStatus,
    createdAt: data.created_at as string,
  };
}
