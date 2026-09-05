import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { CustomerCompanyAccess } from './customer-company-access';

type QueryResult<T> = { data: T | null; error: unknown };
type AssignmentRow = { id: string; pro_profile_id: string };
type ProfileRow = {
  id: string;
  tenant_id: string | null;
  role: string;
  status: string;
  full_name: string | null;
  title: string | null;
};

export type CustomerAssignedProStore = {
  activeAssignments: (tenantId: string, companyId: string) => Promise<QueryResult<AssignmentRow[]>>;
  releasedAssignments: (
    tenantId: string,
    companyId: string,
  ) => Promise<QueryResult<Array<{ id: string }>>>;
  assignedProfile: (tenantId: string, profileId: string) => Promise<QueryResult<ProfileRow>>;
};

export type CustomerAssignedProState =
  | {
      kind: 'active';
      value: {
        fullName: string | null;
        title: string | null;
        contact: { kind: 'unavailable' };
      };
    }
  | { kind: 'missing' | 'released' | 'error' };

export function createCustomerAssignedProSupabaseStore(
  client: Pick<SupabaseClient, 'from'>,
): CustomerAssignedProStore {
  return {
    activeAssignments: async (tenantId, companyId) =>
      await client
        .from('pro_company_assignments')
        .select('id, pro_profile_id')
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('assigned_at', { ascending: false })
        .order('id', { ascending: true })
        .limit(2),
    releasedAssignments: async (tenantId, companyId) =>
      await client
        .from('pro_company_assignments')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .eq('status', 'released')
        .order('released_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })
        .limit(1),
    assignedProfile: async (tenantId, profileId) =>
      await client
        .from('profiles')
        .select('id, tenant_id, role, status, full_name, title')
        .eq('tenant_id', tenantId)
        .eq('id', profileId)
        .eq('role', 'pro')
        .eq('status', 'active')
        .maybeSingle(),
  } as CustomerAssignedProStore;
}

export async function loadCustomerAssignedPro(
  access: Extract<CustomerCompanyAccess, { kind: 'authorized' }>,
  dependencies: { store?: CustomerAssignedProStore } = {},
): Promise<CustomerAssignedProState> {
  const store = dependencies.store ?? (await defaultStore());
  const tenantId = access.tenant.id;
  const companyId = access.company.id;
  try {
    const active = await store.activeAssignments(tenantId, companyId);
    if (active.error || !active.data) return { kind: 'error' };
    if (active.data.length > 1) return { kind: 'error' };
    const assignment = active.data[0];
    if (!assignment) {
      const released = await store.releasedAssignments(tenantId, companyId);
      if (released.error || !released.data) return { kind: 'error' };
      return { kind: released.data.length > 0 ? 'released' : 'missing' };
    }
    const profile = await store.assignedProfile(tenantId, assignment.pro_profile_id);
    if (
      profile.error ||
      !profile.data ||
      profile.data.id !== assignment.pro_profile_id ||
      profile.data.tenant_id !== tenantId ||
      profile.data.role !== 'pro' ||
      profile.data.status !== 'active'
    ) {
      return { kind: 'error' };
    }
    return {
      kind: 'active',
      value: {
        fullName: profile.data.full_name,
        title: profile.data.title,
        contact: { kind: 'unavailable' },
      },
    };
  } catch {
    return { kind: 'error' };
  }
}

async function defaultStore(): Promise<CustomerAssignedProStore> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createCustomerAssignedProSupabaseStore(createSupabaseServiceRoleClient());
}
