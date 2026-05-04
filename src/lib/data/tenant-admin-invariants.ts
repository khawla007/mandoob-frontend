import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export { assertLastAdminInvariant } from './tenant-admin-invariants.pure';

export async function countActiveAdminsExcluding(
  tenantId: string,
  excludeId: string,
): Promise<number> {
  const admin = createSupabaseServiceRoleClient();
  const { count, error } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .eq('status', 'active')
    .neq('id', excludeId);
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return count ?? 0;
}
