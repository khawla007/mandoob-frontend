import 'server-only';

import { z } from 'zod';

import { ApiError } from '@/lib/errors';
import { PRO_ASSIGNMENT_ELIGIBILITY_CODES } from '@/lib/pro-lifecycle/contracts';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type RpcResult = { data: unknown; error: { message?: string } | null };
type IdentityClient = { rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> };
type IdentityDeps = { supabase?: IdentityClient };

const uuid = z.string().uuid();
const identitySchema = z
  .object({
    profile: z
      .object({
        id: uuid,
        fullName: z.string().nullable(),
        email: z.string().email().nullable(),
        emailUnavailable: z.boolean(),
        accountStatus: z.enum(['active', 'invited', 'disabled', 'suspended']),
        designation: z.string().nullable(),
        department: z.string().nullable(),
        serviceAreas: z.array(z.string()),
        bio: z.string().nullable(),
        createdAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    eligibility: z
      .object({
        eligible: z.boolean(),
        codes: z.array(z.enum(PRO_ASSIGNMENT_ELIGIBILITY_CODES)),
        verifiedCredentialId: uuid.nullable(),
        pricingTermId: uuid.nullable(),
        compensationTermId: uuid.nullable(),
      })
      .strict(),
    assignment: z
      .object({
        assignmentId: uuid,
        tenantId: uuid,
        companyId: uuid,
        companyName: z.string().nullable(),
        assignedAt: z.string().datetime({ offset: true }),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((identity, context) => {
    if (identity.profile.emailUnavailable !== (identity.profile.email === null)) {
      context.addIssue({
        code: 'custom',
        path: ['profile', 'emailUnavailable'],
        message: 'Invalid email state',
      });
    }
  });

export type ProLifecycleIdentity = z.infer<typeof identitySchema>;

function client(deps: IdentityDeps): IdentityClient {
  return deps.supabase ?? (createSupabaseServiceRoleClient() as unknown as IdentityClient);
}

function notFound(): ApiError {
  return new ApiError('NOT_FOUND', 'PRO not found', 404);
}

function internal(): ApiError {
  return new ApiError('INTERNAL', 'Unable to load PRO identity', 500);
}

export async function readProLifecycleIdentity(
  actorId: string,
  proProfileId: string,
  deps: IdentityDeps = {},
): Promise<ProLifecycleIdentity> {
  const target = uuid.parse(proProfileId);
  const { data, error } = await client(deps).rpc('read_pro_lifecycle_identity', {
    p_actor_id: uuid.parse(actorId),
    p_pro_profile_id: target,
  });
  if (error) {
    const code = error.message?.trim();
    if (code === 'NOT_FOUND' || code === 'FORBIDDEN') throw notFound();
    throw internal();
  }
  const parsed = identitySchema.safeParse(data);
  if (!parsed.success || parsed.data.profile.id !== target) throw internal();
  return parsed.data;
}
