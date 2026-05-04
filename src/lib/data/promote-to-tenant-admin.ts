import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

/**
 * Flip a freshly-provisioned PRO user from role 'pro' to 'admin' for their
 * tenant. Used by `provisionTenant` immediately after `adminCreateUser` so the
 * first invitee becomes the firm's admin without bypassing the
 * super_admin-only check inside `adminCreateUser`. Idempotent if already admin.
 */
export async function promoteToTenantAdmin(userId: string, tenantId: string): Promise<void> {
  const admin = createSupabaseServiceRoleClient();

  const { data: existing, error: readErr } = await admin
    .from('profiles')
    .select('id, role, tenant_id')
    .eq('id', userId)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!existing) throw new ApiError('NOT_FOUND', 'profile not found', 404);
  if (existing.tenant_id !== tenantId) {
    throw new ApiError('FORBIDDEN', 'profile does not belong to tenant', 403);
  }
  if (existing.role === 'admin') return;
  if (existing.role !== 'pro') {
    throw new ApiError(
      'INVALID_ROLE_TRANSITION',
      `cannot promote from ${existing.role} to admin`,
      400,
    );
  }

  const { error: updErr } = await admin
    .from('profiles')
    .update({ role: 'admin', updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (updErr) throw new ApiError('INTERNAL', updErr.message, 500);

  const { error: authUpdErr } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { mandoob_role: 'admin', tenant_id: tenantId },
  });
  if (authUpdErr) {
    throw new ApiError('INTERNAL', `auth metadata update: ${authUpdErr.message}`, 500);
  }
}
