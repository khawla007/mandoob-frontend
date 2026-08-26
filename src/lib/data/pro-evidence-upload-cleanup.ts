import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { isOwnedProCredentialEvidencePath } from '@/lib/storage/pro-credential-path';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

const uuid = z.string().uuid();
const claimSchema = z
  .object({
    reservationId: uuid,
    recoveryOperationId: uuid,
    proProfileId: uuid,
    credentialId: uuid,
    evidenceId: uuid,
    storagePath: z.string().min(1),
  })
  .strict();
const claimsSchema = z.array(claimSchema).max(25);
const finalizeSchema = z
  .object({ status: z.enum(['quiescing', 'cleaned', 'referenced']) })
  .strict();

type Claim = z.infer<typeof claimSchema>;
type FinalizeResult = z.infer<typeof finalizeSchema>;
type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

async function claimBatch(workerId: string, limit: number): Promise<Claim[]> {
  const client = createSupabaseServiceRoleClient() as unknown as RpcClient;
  const { data, error } = await client.rpc('claim_pro_credential_evidence_upload_cleanup', {
    p_recovery_operation_id: workerId,
    p_limit: limit,
  });
  if (error) throw new Error('cleanup_claim_failed');
  return claimsSchema.parse(data);
}

async function finalizeClaim(reservationId: string, workerId: string): Promise<FinalizeResult> {
  const client = createSupabaseServiceRoleClient() as unknown as RpcClient;
  const { data, error } = await client.rpc('finalize_pro_credential_evidence_upload_cleanup', {
    p_reservation_id: reservationId,
    p_recovery_operation_id: workerId,
  });
  if (error) throw new Error('cleanup_finalize_failed');
  return finalizeSchema.parse(data);
}

async function erase(path: string): Promise<void> {
  const { error } = await createSupabaseServiceRoleClient()
    .storage.from('tenant-documents')
    .remove([path]);
  if (error) throw new Error('storage_cleanup_failed');
}

async function bounded<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('cleanup_timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type CleanupDeps = {
  workerId?: () => string;
  batchSize?: number;
  claim?: (workerId: string, limit: number) => Promise<Claim[]>;
  erase?: (path: string) => Promise<void>;
  finalize?: (reservationId: string, workerId: string) => Promise<FinalizeResult>;
  timeoutMs?: number;
};

export async function cleanupAbandonedProCredentialEvidenceUploads(deps: CleanupDeps = {}) {
  const workerId = uuid.parse((deps.workerId ?? randomUUID)());
  const batchSize = z
    .number()
    .int()
    .min(1)
    .max(25)
    .parse(deps.batchSize ?? 25);
  const timeoutMs = z
    .number()
    .int()
    .min(1)
    .max(30_000)
    .parse(deps.timeoutMs ?? 10_000);
  const claims = await (deps.claim ?? claimBatch)(workerId, batchSize);
  const result = {
    claimed: claims.length,
    quiescing: 0,
    cleaned: 0,
    referenced: 0,
    retryable: 0,
  };
  for (const raw of claims) {
    try {
      const claim = claimSchema.parse(raw);
      if (
        claim.recoveryOperationId !== workerId ||
        !isOwnedProCredentialEvidencePath(
          claim.storagePath,
          claim.proProfileId,
          claim.credentialId,
          claim.evidenceId,
        )
      )
        throw new Error('invalid_cleanup_claim');
      await bounded((deps.erase ?? erase)(claim.storagePath), timeoutMs);
      const finalized = await (deps.finalize ?? finalizeClaim)(claim.reservationId, workerId);
      result[finalized.status] += 1;
    } catch {
      result.retryable += 1;
    }
  }
  return result;
}
