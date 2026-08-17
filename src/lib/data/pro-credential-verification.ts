import 'server-only';

import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type VerificationDependencies = {
  verify(input: { actorId: string; targetId: string; expectedUpdatedAt: string }): Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
  reportError?(context: string): void;
};

function productionDependencies(): VerificationDependencies {
  const admin = createSupabaseServiceRoleClient();
  return {
    async verify({ actorId, targetId, expectedUpdatedAt }) {
      return await admin.rpc('verify_pro_credentials_atomic', {
        p_actor_id: actorId,
        p_target_id: targetId,
        p_expected_updated_at: expectedUpdatedAt,
      });
    },
    reportError: (context) => console.error(context, { kind: 'unexpected_rpc_error' }),
  };
}

export async function verifyProCredentials(
  targetId: string,
  actorId: string,
  expectedUpdatedAt: string,
  deps: VerificationDependencies = productionDependencies(),
): Promise<{ verifiedAt: string; verifiedByProfileId: string; changed: boolean }> {
  const input = z
    .object({
      targetId: z.string().uuid(),
      actorId: z.string().uuid(),
      expectedUpdatedAt: z.string().datetime({ offset: true }),
    })
    .parse({ targetId, actorId, expectedUpdatedAt });
  const { data, error } = await deps.verify(input);
  if (error) {
    const message = error.message ?? '';
    if (message.includes('PRO_LICENSE_MISSING')) {
      throw new ApiError('PRO_LICENSE_MISSING', 'A valid PRO license is required', 409);
    }
    if (message.includes('PRO_NOT_READY')) {
      throw new ApiError('PRO_NOT_READY', 'The PRO must be active before verification', 409);
    }
    if (message.includes('STALE_CREDENTIALS')) {
      throw new ApiError('STALE_CREDENTIALS', 'PRO credentials changed; reload and retry', 409);
    }
    if (message.includes('OPERATOR_FORBIDDEN')) {
      throw new ApiError('FORBIDDEN', 'Operator is not authorized', 403);
    }
    deps.reportError?.('verify PRO credentials RPC failed');
    throw new ApiError('INTERNAL', 'Could not verify PRO credentials', 500);
  }
  const result = data as Record<string, unknown> | null;
  if (
    result?.credentials_verified !== true ||
    typeof result.verified_at !== 'string' ||
    !z.string().uuid().safeParse(result.verified_by_profile_id).success ||
    typeof result.changed !== 'boolean'
  ) {
    throw new ApiError('INTERNAL', 'Could not verify PRO credentials', 500);
  }
  return {
    verifiedAt: result.verified_at,
    verifiedByProfileId: result.verified_by_profile_id as string,
    changed: result.changed,
  };
}
