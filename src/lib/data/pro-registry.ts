import 'server-only';

import { z } from 'zod';

import type { ProRegistryFilters } from '@/app/admin/users/pro-registry-params';
import { ApiError } from '@/lib/errors';
import {
  PRO_ASSIGNMENT_ELIGIBILITY_CODES,
  PRO_CREDENTIAL_STATES,
} from '@/lib/pro-lifecycle/contracts';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type RpcResult = { data: unknown; error: { message?: string } | null };
type RegistryClient = { rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> };
type RegistryDeps = { supabase?: RegistryClient };

const uuid = z.string().uuid();
const rowSchema = z
  .object({
    id: uuid,
    fullName: z.string().nullable(),
    email: z.string().email().nullable(),
    emailUnavailable: z.boolean(),
    accountStatus: z.enum(['active', 'invited', 'disabled', 'suspended']),
    credentialState: z.enum(PRO_CREDENTIAL_STATES).nullable(),
    credentialExpiry: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
    eligible: z.boolean(),
    eligibilityCodes: z.array(z.enum(PRO_ASSIGNMENT_ELIGIBILITY_CODES)),
    assigned: z.boolean(),
    companyId: uuid.nullable(),
    companyName: z.string().nullable(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((row, context) => {
    if (row.emailUnavailable !== (row.email === null)) {
      context.addIssue({
        code: 'custom',
        path: ['emailUnavailable'],
        message: 'Invalid email state',
      });
    }
    if (row.assigned !== (row.companyId !== null)) {
      context.addIssue({ code: 'custom', path: ['assigned'], message: 'Invalid assignment state' });
    }
    if (row.eligible !== (row.eligibilityCodes.length === 0)) {
      context.addIssue({
        code: 'custom',
        path: ['eligible'],
        message: 'Invalid eligibility state',
      });
    }
  });

const resultSchema = z
  .object({
    items: z.array(rowSchema).max(25),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    pageSize: z.literal(25),
    totalPages: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.totalPages !== Math.ceil(result.total / result.pageSize)) {
      context.addIssue({ code: 'custom', path: ['totalPages'], message: 'Invalid total pages' });
    }
    if (result.total > 0 && result.page <= result.totalPages && result.items.length === 0) {
      context.addIssue({ code: 'custom', path: ['items'], message: 'Missing page items' });
    }
    if (result.items.length > result.total) {
      context.addIssue({ code: 'custom', path: ['items'], message: 'Too many page items' });
    }
  });

export type ProRegistryRow = z.infer<typeof rowSchema>;
export type ProRegistryResult = z.infer<typeof resultSchema>;

function db(deps: RegistryDeps): RegistryClient {
  return deps.supabase ?? (createSupabaseServiceRoleClient() as unknown as RegistryClient);
}

function internal(): ApiError {
  return new ApiError('INTERNAL', 'Unable to load PRO registry', 500);
}

async function readRegistryPage(
  client: RegistryClient,
  actorId: string,
  filters: ProRegistryFilters,
  page: number,
): Promise<ProRegistryResult> {
  const { data, error } = await client.rpc('read_pro_registry', {
    p_actor_id: actorId,
    p_query: filters.q ?? null,
    p_account_status: filters.accountStatus ?? null,
    p_credential_state: filters.credentialState ?? null,
    p_eligibility: filters.eligibility ?? null,
    p_assignment: filters.assignment ?? null,
    p_expiry_window: filters.expiryWindow ?? null,
    p_sort: filters.sort,
    p_direction: filters.direction,
    p_page: page,
    p_page_size: 25,
  });
  if (error) throw internal();
  const parsed = resultSchema.safeParse(data);
  if (!parsed.success || parsed.data.page !== page) throw internal();
  return parsed.data;
}

export async function listProRegistry(
  actorId: string,
  filters: ProRegistryFilters,
  deps: RegistryDeps = {},
): Promise<ProRegistryResult> {
  const client = db(deps);
  const actor = uuid.parse(actorId);
  const first = await readRegistryPage(client, actor, filters, filters.page);
  if (first.totalPages > 0 && filters.page > first.totalPages) {
    return readRegistryPage(client, actor, filters, first.totalPages);
  }
  return first;
}
