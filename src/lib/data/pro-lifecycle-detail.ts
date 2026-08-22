import 'server-only';

import { z } from 'zod';

import { ApiError } from '@/lib/errors';
import {
  PRO_ASSIGNMENT_ELIGIBILITY_CODES,
  PRO_CREDENTIAL_STATES,
} from '@/lib/pro-lifecycle/contracts';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  proDecisionReasonCodeSchema,
  proDecisionReasonSchema,
  proTimelineCursorSchema,
} from '@/lib/validation/pro-lifecycle';

type RpcResult = { data: unknown; error: { message?: string } | null };
type DetailClient = { rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> };
type DetailDeps = { supabase?: DetailClient };

const uuid = z.string().uuid();
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const credentialSchema = z
  .object({
    credentialId: uuid,
    type: z.literal('pro_license'),
    maskedIdentifier: z
      .string()
      .regex(/^•••• [A-Z0-9]{4}$/u)
      .nullable(),
    issuingAuthority: z.string().nullable(),
    issueDate: calendarDate.nullable(),
    expiryDate: calendarDate.nullable(),
    state: z.enum(PRO_CREDENTIAL_STATES),
    version: z.number().int().nonnegative(),
    evidenceCount: z.number().int().nonnegative(),
    submittedAt: z.string().datetime({ offset: true }).nullable(),
    supersedesCredentialId: uuid.nullable(),
  })
  .strict();
const evidenceSchema = z
  .object({
    evidenceId: uuid,
    credentialId: uuid,
    mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
    sizeBytes: z.number().int().positive(),
    originalNameSafe: z.string().min(1).max(255),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
const eligibilitySchema = z
  .object({
    eligible: z.boolean(),
    codes: z.array(z.enum(PRO_ASSIGNMENT_ELIGIBILITY_CODES)),
    verifiedCredentialId: uuid.nullable(),
    pricingTermId: uuid.nullable(),
    compensationTermId: uuid.nullable(),
  })
  .strict();
const assignmentSchema = z
  .object({
    assignmentId: uuid,
    tenantId: uuid,
    companyId: uuid,
    companyName: z.string().nullable(),
    assignedAt: z.string().datetime({ offset: true }),
  })
  .strict();
const termSchema = z
  .object({
    termId: uuid,
    termKind: z.enum(['pricing', 'compensation']),
    model: z.enum(['per_registration', 'retainer']),
    currency: z.literal('AED'),
    amountMinor: z.number().int().positive(),
    retainerInterval: z.enum(['monthly', 'annual']).nullable(),
    scope: z.literal('all_registrations'),
    effectiveFrom: calendarDate,
    effectiveTo: calendarDate.nullable(),
    status: z.enum(['draft', 'active', 'ended']),
    version: z.number().int().nonnegative(),
  })
  .strict();
const timelineItemSchema = z
  .object({
    eventAt: z.string().datetime({ offset: true }),
    eventId: uuid,
    eventKind: z.enum([
      'credential_submitted',
      'credential_review_started',
      'credential_verified',
      'credential_rejected',
      'credential_expired',
      'credential_revoked',
      'credential_superseded',
      'assignment_assigned',
      'assignment_released',
    ]),
    summaryCode: z.string().regex(/^[A-Z_]+$/u),
    reasonCode: proDecisionReasonCodeSchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    reason: proDecisionReasonSchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    actorDisplayName: z.string().nullable(),
    companyDisplayName: z.string().nullable(),
  })
  .strict();
const detailSchema = z
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
    credentials: z.array(credentialSchema),
    evidence: z.array(evidenceSchema),
    eligibility: eligibilitySchema,
    assignment: assignmentSchema.nullable(),
    commercialTerms: z.array(termSchema),
    timeline: z
      .object({
        items: z.array(timelineItemSchema).max(25),
        nextCursor: proTimelineCursorSchema.nullable(),
      })
      .strict(),
  })
  .strict();

export type ProLifecycleDetail = z.infer<typeof detailSchema>;

function db(deps: DetailDeps): DetailClient {
  return deps.supabase ?? (createSupabaseServiceRoleClient() as unknown as DetailClient);
}

export async function readProLifecycleDetail(
  actorId: string,
  proProfileId: string,
  deps: DetailDeps = {},
): Promise<ProLifecycleDetail> {
  const { data, error } = await db(deps).rpc('read_pro_lifecycle_detail', {
    p_actor_id: uuid.parse(actorId),
    p_pro_profile_id: uuid.parse(proProfileId),
    p_timeline_limit: 25,
  });
  if (error) {
    const code = error.message?.trim();
    if (code === 'NOT_FOUND' || code === 'FORBIDDEN') {
      throw new ApiError('NOT_FOUND', 'PRO not found', 404);
    }
    throw new ApiError('INTERNAL', 'Unable to load PRO lifecycle detail', 500);
  }
  const parsed = detailSchema.safeParse(data);
  if (!parsed.success || parsed.data.profile.id !== proProfileId) {
    throw new ApiError('INTERNAL', 'Unable to load PRO lifecycle detail', 500);
  }
  return parsed.data;
}
