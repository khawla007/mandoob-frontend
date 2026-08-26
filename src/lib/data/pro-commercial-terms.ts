import 'server-only';

import { z } from 'zod';

import { createBlindIndex } from '@/lib/crypto/pii';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { proCommercialTermSchema } from '@/lib/validation/pro-lifecycle';

type RpcResult = { data: unknown; error: { message?: string } | null };
type TermsClient = { rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> };
type TermsDeps = { supabase?: TermsClient };

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const termSchema = z
  .object({
    termId: uuid,
    termKind: z.enum(['pricing', 'compensation']),
    model: z.enum(['per_registration', 'retainer']),
    currency: z.literal('AED'),
    amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    retainerInterval: z.enum(['monthly', 'annual']).nullable(),
    scope: z.literal('all_registrations'),
    effectiveFrom: date,
    effectiveTo: date.nullable(),
    status: z.enum(['draft', 'active', 'ended']),
    version: z.number().int().nonnegative(),
  })
  .strict();
const transitionSchema = z
  .object({
    termId: uuid,
    termKind: z.enum(['pricing', 'compensation']),
    status: z.enum(['active', 'ended']),
    effectiveTo: date.optional(),
    version: z.number().int().nonnegative(),
  })
  .strict();

export type ProCommercialTerm = z.infer<typeof termSchema>;
export type ProCommercialTermTransition = z.infer<typeof transitionSchema>;

const OPERATION_HASH_DOMAIN = 'pro-lifecycle-operation:v1';
const ERRORS = new Set([
  'NOT_FOUND',
  'STALE_TERM_VERSION',
  'INVALID_TERM_TRANSITION',
  'TERM_DATE_OVERLAP',
  'OPERATION_REUSED',
]);

function db(deps: TermsDeps): TermsClient {
  return deps.supabase ?? (createSupabaseServiceRoleClient() as unknown as TermsClient);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function hash(name: string, payload: unknown): string {
  return createBlindIndex(OPERATION_HASH_DOMAIN, canonicalJson({ operation: name, payload }));
}

function failure(message?: string): ApiError {
  const code = message?.trim();
  return code && ERRORS.has(code)
    ? new ApiError(code, 'Unable to update PRO commercial terms', code === 'NOT_FOUND' ? 404 : 409)
    : new ApiError('INTERNAL', 'Unable to load PRO commercial terms', 500);
}

export async function readProCommercialTerms(
  actorId: string,
  proProfileId: string,
  deps: TermsDeps = {},
): Promise<ProCommercialTerm[]> {
  const { data, error } = await db(deps).rpc('read_pro_commercial_terms', {
    p_actor_id: uuid.parse(actorId),
    p_pro_profile_id: uuid.parse(proProfileId),
  });
  if (error) throw failure();
  const parsed = z.array(termSchema).safeParse(data);
  if (!parsed.success) throw failure();
  return parsed.data;
}

export async function createProCommercialTermDraft(
  actorId: string,
  proProfileId: string,
  input: z.input<typeof proCommercialTermSchema>,
  deps: TermsDeps = {},
): Promise<ProCommercialTerm> {
  const parsed = proCommercialTermSchema.parse(input);
  const payload = { proProfileId: uuid.parse(proProfileId), ...parsed };
  const { data, error } = await db(deps).rpc('create_pro_commercial_term_draft', {
    p_actor_id: uuid.parse(actorId),
    p_pro_profile_id: payload.proProfileId,
    p_operation_id: parsed.operationId,
    p_payload_hash: hash('create_pro_commercial_term_draft', payload),
    p_term_kind: parsed.termKind,
    p_model: parsed.model,
    p_amount_minor: parsed.amountMinor,
    p_retainer_interval: parsed.retainerInterval,
    p_effective_from: parsed.effectiveFrom,
    p_effective_to: parsed.effectiveTo,
  });
  if (error) throw failure(error.message);
  const result = termSchema.safeParse(data);
  if (!result.success) throw failure();
  return result.data;
}

async function transition(
  name: 'activate_pro_commercial_term' | 'end_pro_commercial_term',
  actorId: string,
  termId: string,
  expectedVersion: number,
  operationId: string,
  effectiveTo: string | null,
  deps: TermsDeps,
): Promise<ProCommercialTermTransition> {
  const payload = {
    termId: uuid.parse(termId),
    expectedVersion: z.number().int().nonnegative().parse(expectedVersion),
    ...(effectiveTo === null ? {} : { effectiveTo: date.parse(effectiveTo) }),
  };
  const { data, error } = await db(deps).rpc(name, {
    p_actor_id: uuid.parse(actorId),
    p_term_id: payload.termId,
    p_expected_version: payload.expectedVersion,
    p_operation_id: uuid.parse(operationId),
    p_payload_hash: hash(name, payload),
    ...(effectiveTo === null ? {} : { p_effective_to: effectiveTo }),
  });
  if (error) throw failure(error.message);
  const parsed = transitionSchema.safeParse(data);
  if (!parsed.success) throw failure();
  return parsed.data;
}

export function activateProCommercialTerm(
  actorId: string,
  termId: string,
  expectedVersion: number,
  operationId: string,
  deps: TermsDeps = {},
) {
  return transition(
    'activate_pro_commercial_term',
    actorId,
    termId,
    expectedVersion,
    operationId,
    null,
    deps,
  );
}

export function endProCommercialTerm(
  actorId: string,
  termId: string,
  expectedVersion: number,
  operationId: string,
  effectiveTo: string,
  deps: TermsDeps = {},
) {
  return transition(
    'end_pro_commercial_term',
    actorId,
    termId,
    expectedVersion,
    operationId,
    effectiveTo,
    deps,
  );
}

export function formatAedMinor(amountMinor: number, locale: string): string {
  const parsed = z.number().int().safe().parse(amountMinor);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'AED',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed / 100);
}
