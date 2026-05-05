import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { ProFirmRow } from '@/lib/data/pro-firms';
import type { TenantPlan, TenantStatus } from '@/lib/validation/tenant-onboarding';

export type TenantMember = {
  id: string;
  fullName: string | null;
  role: string | null;
  lastLoginAt: string | null;
};

export type ClientPreview = {
  id: string;
  companyName: string;
  status: string | null;
  createdAt: string;
};

export type AuditPreview = {
  id: string;
  createdAt: string;
  actorId: string | null;
  action: string;
  source: string | null;
  details: unknown;
};

export type ProFirmDetail = {
  tenant: ProFirmRow;
  members: TenantMember[];
  clientsSummary: { total: number; recent: ClientPreview[] };
  recentAudit: AuditPreview[];
};

export async function getProFirmDetail(id: string): Promise<ProFirmDetail | null> {
  const admin = createSupabaseServiceRoleClient();
  const [tenantRes, membersRes, clientsCountRes, recentClientsRes, auditRes] = await Promise.all([
    admin
      .from('tenants')
      .select('id, slug, name, plan, status, created_at')
      .eq('id', id)
      .maybeSingle(),
    admin
      .from('profiles')
      .select('id, full_name, role, last_login_at')
      .eq('tenant_id', id)
      .order('role', { ascending: true })
      .order('full_name', { ascending: true, nullsFirst: false }),
    admin.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    admin
      .from('clients')
      .select('id, company_name, status, created_at')
      .eq('tenant_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('tenant_audit_log')
      .select('id, created_at, actor_id, action, source, details')
      .eq('tenant_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  if (tenantRes.error || !tenantRes.data) return null;

  const t = tenantRes.data as {
    id: string;
    slug: string;
    name: string;
    plan: string;
    status: string;
    created_at: string;
  };

  return {
    tenant: {
      id: t.id,
      slug: t.slug,
      name: t.name,
      plan: t.plan as TenantPlan,
      status: t.status as TenantStatus,
      createdAt: t.created_at,
    },
    members: (
      (membersRes.data ?? []) as ReadonlyArray<{
        id: string;
        full_name: string | null;
        role: string | null;
        last_login_at: string | null;
      }>
    ).map((m) => ({
      id: m.id,
      fullName: m.full_name,
      role: m.role,
      lastLoginAt: m.last_login_at,
    })),
    clientsSummary: {
      total: clientsCountRes.count ?? 0,
      recent: (
        (recentClientsRes.data ?? []) as ReadonlyArray<{
          id: string;
          company_name: string;
          status: string | null;
          created_at: string;
        }>
      ).map((c) => ({
        id: c.id,
        companyName: c.company_name,
        status: c.status,
        createdAt: c.created_at,
      })),
    },
    recentAudit: (
      (auditRes.data ?? []) as ReadonlyArray<{
        id: number | string;
        created_at: string;
        actor_id: string | null;
        action: string;
        source: string | null;
        details: unknown;
      }>
    ).map((a) => ({
      id: String(a.id),
      createdAt: a.created_at,
      actorId: a.actor_id,
      action: a.action,
      source: a.source,
      details: a.details ?? null,
    })),
  };
}
