import 'server-only';
import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  assignCompanyProSchema,
  reassignCompanyProSchema,
  releaseCompanyProSchema,
  type AssignCompanyProInput,
  type ReassignCompanyProInput,
  type ReleaseCompanyProInput,
} from '@/lib/validation/company-assignment';
import { mapCompanyAssignmentError } from './company-assignment-errors';

type DbError = { message?: string; code?: string } | null;
type DbResult = { data: unknown; error: DbError };
type Query = {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  is(column: string, value: unknown): Query;
  or(filters: string): Query;
  order(column: string, options: { ascending: boolean }): Query;
  limit(count: number): Query;
  maybeSingle(): Promise<DbResult>;
  then(resolve: (result: DbResult) => void): void;
};
type AssignmentClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<DbResult>;
  from(table: string): Query;
};
type AssignmentDeps = { supabase?: AssignmentClient };

export type CompanyAssignment = {
  id: string;
  tenantId: string;
  companyId: string;
  proProfileId: string;
  proFullName: string | null;
  status: 'active' | 'released';
  assignedAt: string;
  assignedBy: string;
  releasedAt: string | null;
  releasedBy: string | null;
  releaseReason: string | null;
};

export type AssignablePro = {
  id: string;
  fullName: string | null;
  designation: string | null;
  department: string | null;
};

export type CompanyAssignmentMutationResult = {
  assignmentId: string;
  pricingTermId: string;
  compensationTermId: string;
};

type AssignmentRow = {
  id: string;
  tenant_id: string;
  company_id: string;
  pro_profile_id: string;
  status: 'active' | 'released';
  assigned_at: string;
  assigned_by: string;
  released_at: string | null;
  released_by: string | null;
  release_reason: string | null;
  profiles?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null;
};

const ASSIGNMENT_COLUMNS =
  'id, tenant_id, company_id, pro_profile_id, status, assigned_at, assigned_by, released_at, released_by, release_reason, profiles!pro_company_assignments_pro_profile_id_fkey(full_name)';
const actorIdSchema = z.string().uuid();
const recordIdSchema = z.string().uuid();
const mutationResultSchema = z
  .object({
    assignmentId: recordIdSchema,
    pricingTermId: recordIdSchema,
    compensationTermId: recordIdSchema,
  })
  .strict();
const historyCursorSchema = z.object({
  assigned_at: z.string().datetime({ offset: true }),
  id: recordIdSchema,
});
const ASSIGNMENT_HISTORY_PAGE_SIZE = 500;

function client(deps: AssignmentDeps = {}): AssignmentClient {
  return deps.supabase ?? (createSupabaseServiceRoleClient() as unknown as AssignmentClient);
}

function publicMutationError(error: DbError): ApiError {
  const mapped = mapCompanyAssignmentError(error);
  return new ApiError(mapped.code, 'Unable to update company assignment', mapped.status);
}

function internalReadError(): ApiError {
  return new ApiError('INTERNAL', 'Unable to load company assignments', 500);
}

function requireRpcId(data: unknown, error: DbError): string {
  if (error) throw publicMutationError(error);
  const parsed = recordIdSchema.safeParse(data);
  if (!parsed.success) throw publicMutationError(null);
  return parsed.data;
}

function requireRpcAssignmentResult(
  data: unknown,
  error: DbError,
): CompanyAssignmentMutationResult {
  if (error) throw publicMutationError(error);
  const parsed = mutationResultSchema.safeParse(data);
  if (!parsed.success) throw publicMutationError(null);
  return parsed.data;
}

function requireReadId(value: string): string {
  const parsed = recordIdSchema.safeParse(value);
  if (!parsed.success) throw internalReadError();
  return parsed.data;
}

function requireHistoryCursor(row: AssignmentRow): { assignedAt: string; id: string } {
  const parsed = historyCursorSchema.safeParse(row);
  if (!parsed.success) throw internalReadError();
  return { assignedAt: parsed.data.assigned_at, id: parsed.data.id };
}

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function toAssignment(row: AssignmentRow): CompanyAssignment {
  const profile = relatedOne(row.profiles);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    companyId: row.company_id,
    proProfileId: row.pro_profile_id,
    proFullName: profile?.full_name ?? null,
    status: row.status,
    assignedAt: row.assigned_at,
    assignedBy: row.assigned_by,
    releasedAt: row.released_at,
    releasedBy: row.released_by,
    releaseReason: row.release_reason,
  };
}

export async function assignProToCompany(
  input: AssignCompanyProInput,
  actorId: string,
  deps: AssignmentDeps = {},
): Promise<CompanyAssignmentMutationResult> {
  // actorId is a trusted server-derived value. Upcoming actions must source it
  // from requirePlatformOperator(), never from form data.
  const parsed = assignCompanyProSchema.parse(input);
  const parsedActorId = actorIdSchema.parse(actorId);
  const { data, error } = await client(deps).rpc('assign_pro_to_company', {
    p_company_id: parsed.companyId,
    p_pro_profile_id: parsed.proProfileId,
    p_actor_profile_id: parsedActorId,
  });
  return requireRpcAssignmentResult(data, error);
}

export async function releaseCompanyPro(
  input: ReleaseCompanyProInput,
  actorId: string,
  deps: AssignmentDeps = {},
): Promise<void> {
  // actorId is server-derived; it is intentionally separate from form input.
  const parsed = releaseCompanyProSchema.parse(input);
  const parsedActorId = actorIdSchema.parse(actorId);
  const { data, error } = await client(deps).rpc('release_company_pro', {
    p_company_id: parsed.companyId,
    p_expected_assignment_id: parsed.assignmentId,
    p_reason: parsed.reason,
    p_actor_profile_id: parsedActorId,
  });
  requireRpcId(data, error);
}

export async function reassignCompanyPro(
  input: ReassignCompanyProInput,
  actorId: string,
  deps: AssignmentDeps = {},
): Promise<CompanyAssignmentMutationResult> {
  // actorId is server-derived; it is intentionally separate from form input.
  const parsed = reassignCompanyProSchema.parse(input);
  const parsedActorId = actorIdSchema.parse(actorId);
  const { data, error } = await client(deps).rpc('reassign_company_pro', {
    p_company_id: parsed.companyId,
    p_expected_assignment_id: parsed.assignmentId,
    p_replacement_pro_profile_id: parsed.replacementProProfileId,
    p_reason: parsed.reason,
    p_actor_profile_id: parsedActorId,
  });
  return requireRpcAssignmentResult(data, error);
}

export async function readCurrentCompanyAssignment(
  companyId: string,
  deps: AssignmentDeps = {},
): Promise<CompanyAssignment | null> {
  const parsedCompanyId = requireReadId(companyId);
  const { data, error } = await client(deps)
    .from('pro_company_assignments')
    .select(ASSIGNMENT_COLUMNS)
    .eq('company_id', parsedCompanyId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw internalReadError();
  return data ? toAssignment(data as AssignmentRow) : null;
}

export async function listCompanyAssignmentHistory(
  companyId: string,
  deps: AssignmentDeps = {},
): Promise<CompanyAssignment[]> {
  const parsedCompanyId = requireReadId(companyId);
  const admin = client(deps);
  const history: CompanyAssignment[] = [];
  const seenCursors = new Set<string>();
  let cursor: { assignedAt: string; id: string } | null = null;

  for (;;) {
    let query = admin
      .from('pro_company_assignments')
      .select(ASSIGNMENT_COLUMNS)
      .eq('company_id', parsedCompanyId);
    if (cursor) {
      query = query.or(
        `assigned_at.lt.${cursor.assignedAt},and(assigned_at.eq.${cursor.assignedAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query
      .order('assigned_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(ASSIGNMENT_HISTORY_PAGE_SIZE);
    if (error) throw internalReadError();

    const page = (data as AssignmentRow[] | null) ?? [];
    const nextCursor =
      page.length === ASSIGNMENT_HISTORY_PAGE_SIZE
        ? requireHistoryCursor(page[page.length - 1]!)
        : null;
    history.push(...page.map(toAssignment));
    if (!nextCursor) return history;

    const cursorKey = `${nextCursor.assignedAt}\u0000${nextCursor.id}`;
    if (seenCursors.has(cursorKey)) throw internalReadError();
    seenCursors.add(cursorKey);
    cursor = nextCursor;
  }
}
