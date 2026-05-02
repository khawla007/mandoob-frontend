import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type ActiveTenantRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
};

export async function requireActiveTenant(tenantId: string): Promise<ActiveTenantRow> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('tenants')
    .select('id, slug, name, status')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) throw new ApiError('INTERNAL', 'Failed to load tenant', 500);
  if (!data) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (data.status !== 'active') {
    throw new ApiError('TENANT_INACTIVE', 'This workspace is suspended. Contact support.', 403, {
      status: data.status,
    });
  }
  return data as ActiveTenantRow;
}
