import 'server-only';

import { z } from 'zod';

import { ApiError } from '@/lib/errors';
import { PRO_ASSIGNMENT_ELIGIBILITY_CODES } from '@/lib/pro-lifecycle/contracts';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type RpcResult = { data: unknown; error: { message?: string } | null };
type EligibilityClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
};
type EligibilityDeps = { supabase?: EligibilityClient };

const uuid = z.string().uuid();
const eligibilitySchema = z
  .object({
    eligible: z.boolean(),
    codes: z.array(z.enum(PRO_ASSIGNMENT_ELIGIBILITY_CODES)),
    verifiedCredentialId: uuid.nullable(),
    pricingTermId: uuid.nullable(),
    compensationTermId: uuid.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const indexes = value.codes.map((code) => PRO_ASSIGNMENT_ELIGIBILITY_CODES.indexOf(code));
    if (indexes.some((index, position) => position > 0 && index <= indexes[position - 1]!)) {
      context.addIssue({
        code: 'custom',
        path: ['codes'],
        message: 'Eligibility codes are not canonical',
      });
    }
    if (value.eligible !== (value.codes.length === 0)) {
      context.addIssue({
        code: 'custom',
        path: ['eligible'],
        message: 'Eligibility state is inconsistent',
      });
    }
  });
const eligibleProSchema = z
  .object({
    proProfileId: uuid,
    fullName: z.string().nullable(),
    eligibility: eligibilitySchema,
  })
  .strict();

export type ProAssignmentEligibility = z.infer<typeof eligibilitySchema>;
export type EligiblePro = z.infer<typeof eligibleProSchema>;

function db(deps: EligibilityDeps): EligibilityClient {
  return deps.supabase ?? (createSupabaseServiceRoleClient() as unknown as EligibilityClient);
}

function internal(): ApiError {
  return new ApiError('INTERNAL', 'Unable to evaluate PRO eligibility', 500);
}

export function parseProAssignmentEligibility(value: unknown): ProAssignmentEligibility {
  const parsed = eligibilitySchema.safeParse(value);
  if (!parsed.success) throw new Error('Invalid PRO eligibility result');
  return parsed.data;
}

export async function evaluateProAssignmentEligibility(
  proProfileId: string,
  companyId: string | null,
  deps: EligibilityDeps = {},
): Promise<ProAssignmentEligibility> {
  const parsedProId = uuid.parse(proProfileId);
  const parsedCompanyId = companyId === null ? null : uuid.parse(companyId);
  const { data, error } = await db(deps).rpc('evaluate_pro_assignment_eligibility', {
    p_pro_profile_id: parsedProId,
    p_company_id: parsedCompanyId,
  });
  if (error) throw internal();
  try {
    return parseProAssignmentEligibility(data);
  } catch {
    throw internal();
  }
}

export async function listEligibleProsForCompany(
  companyId: string,
  query: string,
  limit: number,
  actorId: string,
  deps: EligibilityDeps = {},
): Promise<EligiblePro[]> {
  const parsedLimit = z
    .number()
    .int()
    .min(1, 'Invalid limit')
    .max(100, 'Invalid limit')
    .parse(limit);
  const parsedQuery = z.string().trim().max(160).parse(query);
  const { data, error } = await db(deps).rpc('list_eligible_pros_for_company', {
    p_actor_id: uuid.parse(actorId),
    p_company_id: uuid.parse(companyId),
    p_query: parsedQuery || null,
    p_limit: parsedLimit,
  });
  if (error) throw internal();
  const parsed = z.array(eligibleProSchema).safeParse(data);
  if (!parsed.success) throw internal();
  return parsed.data;
}
