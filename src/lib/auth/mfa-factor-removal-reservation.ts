import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export async function reserveMfaFactorRemoval(
  userId: string,
  factorId: string,
  operationId: string,
): Promise<boolean> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc(
    'reserve_mfa_factor_removal',
    {
      p_user_id: userId,
      p_factor_id: factorId,
      p_operation_id: operationId,
    },
  );
  if (error) throw new Error('mfa_factor_reservation_failed');
  return data === true;
}

export async function releaseMfaFactorRemovalReservation(
  userId: string,
  factorId: string,
  operationId: string,
): Promise<void> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc(
    'release_mfa_factor_removal',
    {
      p_user_id: userId,
      p_factor_id: factorId,
      p_operation_id: operationId,
    },
  );
  if (error || data !== true) throw new Error('mfa_factor_reservation_release_failed');
}
