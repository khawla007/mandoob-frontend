import 'server-only';
import { randomBytes } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    // 10-char base32-ish code, grouped as XXXXX-XXXXX for readability.
    const raw = randomBytes(8).toString('base64url').slice(0, 10).toLowerCase();
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}

export async function persistRecoveryCodes(userId: string, codes: string[]): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  // Invalidate previous codes by delete-then-insert.
  await admin.from('user_mfa_recovery_codes').delete().eq('user_id', userId);
  const rows = await Promise.all(
    codes.map(async (code) => ({
      user_id: userId,
      code_hash: await argonHash(code),
    })),
  );
  const { error } = await admin.from('user_mfa_recovery_codes').insert(rows);
  if (error) throw error;
}

export async function redeemRecoveryCode(userId: string, code: string): Promise<boolean> {
  const admin = createSupabaseServiceRoleClient();
  const { data: rows, error } = await admin
    .from('user_mfa_recovery_codes')
    .select('id, code_hash, used_at')
    .eq('user_id', userId)
    .is('used_at', null);
  if (error || !rows) return false;
  for (const row of rows) {
    if (await argonVerify(row.code_hash as string, code)) {
      await admin
        .from('user_mfa_recovery_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', row.id);
      return true;
    }
  }
  return false;
}

export async function markMfaEnrolled(userId: string): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  await admin
    .from('profiles')
    .update({ mfa_enrolled_at: new Date().toISOString() })
    .eq('id', userId);
}
