import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { ClientStatus } from '@/lib/validation/client';

export type ClientDetail = {
  id: string;
  tenant_id: string;
  company_name: string;
  status: ClientStatus;
  jurisdiction: string | null;
  trade_license_no: string | null;
  license_expiry: string | null;
  shareholders: unknown[];
  registered_activities: unknown[];
  contact_phone: string | null;
  created_at: string;
  updated_at: string;
};

export async function getClientForTenant(
  tenantId: string,
  clientId: string,
): Promise<ClientDetail | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('clients')
    .select(
      'id, tenant_id, company_name, status, jurisdiction, trade_license_no, license_expiry, shareholders, registered_activities, created_at, updated_at',
    )
    .eq('id', clientId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !data) return null;

  const { data: customerLink } = await admin
    .from('customer_profiles')
    .select('profile_id')
    .eq('linked_client_id', clientId)
    .limit(1)
    .maybeSingle();
  let contactPhone: string | null = null;
  if (customerLink?.profile_id) {
    const { data: profile } = await admin
      .from('profiles')
      .select('phone')
      .eq('id', customerLink.profile_id)
      .maybeSingle();
    contactPhone = (profile?.phone as string | null) ?? null;
  }

  return {
    id: data.id as string,
    tenant_id: data.tenant_id as string,
    company_name: data.company_name as string,
    status: data.status as ClientStatus,
    jurisdiction: (data.jurisdiction as string | null) ?? null,
    trade_license_no: (data.trade_license_no as string | null) ?? null,
    license_expiry: (data.license_expiry as string | null) ?? null,
    shareholders: (data.shareholders as unknown[]) ?? [],
    registered_activities: (data.registered_activities as unknown[]) ?? [],
    contact_phone: contactPhone,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
  };
}
