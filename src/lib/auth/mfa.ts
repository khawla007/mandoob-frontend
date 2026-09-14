import 'server-only';
import { randomBytes } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { revokeAllSessions } from '@/lib/auth/revoke-sessions';
import {
  redeemRecoveryCodeWithDependencies,
  replaceRecoveryCodesWithDependencies,
  resetMfaForRecoveryWithDependencies,
} from './mfa-core';

export { cleanupUnverifiedTotpFactors, finalizeMfaEnrollmentWithDependencies } from './mfa-core';

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
  await replaceRecoveryCodesWithDependencies(userId, codes, {
    deleteExisting: async (targetUserId) => {
      const { error } = await admin
        .from('user_mfa_recovery_codes')
        .delete()
        .eq('user_id', targetUserId);
      if (error) throw error;
    },
    hash: argonHash,
    insert: async (rows) => {
      const { error } = await admin.from('user_mfa_recovery_codes').insert(rows);
      if (error) throw error;
    },
  });
}

export async function deleteRecoveryCodes(userId: string): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from('user_mfa_recovery_codes').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function deleteMfaFactorForUser(userId: string, factorId: string): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.auth.admin.mfa.deleteFactor({ userId, id: factorId });
  if (error) throw error;
}

export async function redeemRecoveryCode(userId: string, code: string): Promise<boolean> {
  const admin = createSupabaseServiceRoleClient();
  return redeemRecoveryCodeWithDependencies(userId, code, {
    listUnused: async (targetUserId) => {
      const { data: rows, error } = await admin
        .from('user_mfa_recovery_codes')
        .select('id, code_hash')
        .eq('user_id', targetUserId)
        .is('used_at', null);
      if (error || !rows) throw error ?? new Error('Recovery code lookup failed');
      return rows.map((row) => ({ id: row.id, codeHash: row.code_hash }));
    },
    verify: argonVerify,
    claim: async (id, usedAt) => {
      const { data, error } = await admin
        .from('user_mfa_recovery_codes')
        .update({ used_at: usedAt })
        .eq('id', id)
        .is('used_at', null)
        .select('id');
      return !error && data?.length === 1 && data[0]?.id === id;
    },
  });
}

export async function resetMfaForRecovery(userId: string): Promise<'complete' | 'repair_required'> {
  const admin = createSupabaseServiceRoleClient();
  return resetMfaForRecoveryWithDependencies(userId, {
    revokeSessions: revokeAllSessions,
    deleteRecoveryCodes: async (targetUserId) => {
      const { error } = await admin
        .from('user_mfa_recovery_codes')
        .delete()
        .eq('user_id', targetUserId);
      if (error) throw error;
    },
    listFactorIds: async (targetUserId) => {
      const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: targetUserId });
      if (error || !data) throw error ?? new Error('MFA factor lookup failed');
      return data.factors.map((factor) => factor.id);
    },
    deleteFactor: async (id, targetUserId) => {
      const { error } = await admin.auth.admin.mfa.deleteFactor({ userId: targetUserId, id });
      if (error) throw error;
    },
    clearEnrollment: async (targetUserId) => {
      const { data, error } = await admin
        .from('profiles')
        .update({ mfa_enrolled_at: null })
        .eq('id', targetUserId)
        .select('id');
      if (error || data?.length !== 1 || data[0]?.id !== targetUserId) {
        throw error ?? new Error('MFA enrollment state clear failed');
      }
    },
  });
}

export async function markMfaEnrolled(userId: string): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('profiles')
    .update({ mfa_enrolled_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id');
  if (error || data?.length !== 1 || data[0]?.id !== userId) {
    throw error ?? new Error('MFA enrollment state update failed');
  }
}

export async function clearMfaEnrollment(userId: string): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('profiles')
    .update({ mfa_enrolled_at: null })
    .eq('id', userId)
    .select('id');
  if (error || data?.length !== 1 || data[0]?.id !== userId) {
    throw error ?? new Error('MFA enrollment state clear failed');
  }
}
