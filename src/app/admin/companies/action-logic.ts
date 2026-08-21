import { z, ZodError } from 'zod';

import { ApiError } from '@/lib/errors';
import type { CompanyAssignmentMutationResult } from '@/lib/data/company-assignments';
import {
  TENANT_PLANS,
  tenantSlugSchema,
  type TenantPlan,
} from '@/lib/validation/tenant-onboarding';
import {
  assignCompanyProSchema,
  reassignCompanyProSchema,
  releaseCompanyProSchema,
  type AssignCompanyProInput,
  type ReassignCompanyProInput,
  type ReleaseCompanyProInput,
} from '@/lib/validation/company-assignment';

export type CompanyActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      code: string;
      fieldErrors?: Record<string, 'invalid' | 'mismatch'>;
    };

export type CompanyAdminActor = {
  id: string;
  role: 'admin' | 'super_admin';
};

export type CompanyActionRecord = {
  id: string;
  tenantId: string;
  tenantSlug: string;
  companyName: string;
};

export type CompanyAssignmentActionData = {
  assignmentId: string;
  outcome: 'assigned' | 'reassigned';
};

export type CompanyReleaseActionData = { outcome: 'released' };

type ProvisionInput = { companyName: string; slug: string; plan: TenantPlan };

export type CompanyActionDependencies = {
  requireActor(): Promise<CompanyAdminActor>;
  provisionCompany(
    input: ProvisionInput,
    actorId: string,
  ): Promise<{ tenantId: string; companyId: string }>;
  getCompany(companyId: string): Promise<CompanyActionRecord | null>;
  assign(input: AssignCompanyProInput, actorId: string): Promise<CompanyAssignmentMutationResult>;
  release(input: ReleaseCompanyProInput, actorId: string): Promise<void>;
  reassign(
    input: ReassignCompanyProInput,
    actorId: string,
  ): Promise<CompanyAssignmentMutationResult>;
  revalidate(path: string): void;
  reportError?(context: string, error: unknown): void;
};

const createCompanySchema = z
  .object({
    companyName: z.string().trim().min(3).max(200),
    slug: tenantSlugSchema,
    plan: z.enum(TENANT_PLANS),
  })
  .strict();

const releaseFormSchema = releaseCompanyProSchema.extend({
  companyNameConfirmation: z.string().trim().min(1).max(200),
});

function stringValue(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}

function parseCreate(data: FormData): ProvisionInput {
  return createCompanySchema.parse({
    companyName: stringValue(data, 'companyName'),
    slug: stringValue(data, 'slug'),
    plan: stringValue(data, 'plan'),
  });
}

function parseAssign(data: FormData): AssignCompanyProInput {
  return assignCompanyProSchema.parse({
    companyId: stringValue(data, 'companyId'),
    proProfileId: stringValue(data, 'proProfileId'),
  });
}

function parseRelease(data: FormData) {
  return releaseFormSchema.parse({
    companyId: stringValue(data, 'companyId'),
    assignmentId: stringValue(data, 'assignmentId'),
    companyNameConfirmation: stringValue(data, 'companyNameConfirmation'),
    reason: stringValue(data, 'reason'),
  });
}

function parseReassign(data: FormData): ReassignCompanyProInput {
  return reassignCompanyProSchema.parse({
    companyId: stringValue(data, 'companyId'),
    assignmentId: stringValue(data, 'assignmentId'),
    replacementProProfileId: stringValue(data, 'replacementProProfileId'),
    reason: stringValue(data, 'reason'),
  });
}

function invalid(error: string, zodError: ZodError): CompanyActionResult<never> {
  const fieldErrors: Record<string, 'invalid'> = {};
  for (const issue of zodError.issues) {
    const field = issue.path[0];
    if (typeof field === 'string') fieldErrors[field] = 'invalid';
  }
  return { ok: false, error, code: 'VALIDATION_FAILED', fieldErrors };
}

function failure(
  error: unknown,
  fallback: string,
  deps: CompanyActionDependencies,
): CompanyActionResult<never> {
  if (error instanceof ZodError) return invalid(fallback, error);
  if (error instanceof ApiError) {
    const publicCodes = new Set([
      'PRO_ALREADY_ASSIGNED',
      'COMPANY_ALREADY_ASSIGNED',
      'PRO_NOT_VERIFIED',
      'PRO_INACTIVE',
      'PRO_PRICING_NOT_CONFIGURED',
      'PRO_COMPENSATION_NOT_CONFIGURED',
      'COMPANY_NOT_READY',
      'COMPANY_INACTIVE',
      'ASSIGNMENT_NOT_FOUND',
      'STALE_ASSIGNMENT',
      'ASSIGNMENT_CONFLICT',
    ]);
    if (publicCodes.has(error.code)) {
      return { ok: false, error: 'Unable to update company assignment', code: error.code };
    }
    if (error.code === 'VALIDATION_FAILED') {
      return { ok: false, error: 'Invalid company input', code: error.code };
    }
  }
  deps.reportError?.(fallback, error);
  return { ok: false, error: fallback, code: 'INTERNAL' };
}

function revalidateCompany(company: CompanyActionRecord, deps: CompanyActionDependencies): void {
  deps.revalidate('/admin/companies');
  deps.revalidate(`/admin/companies/${company.id}`);
  deps.revalidate(`/admin/companies/${company.id}/onboarding`);
  deps.revalidate('/admin/users');
  deps.revalidate(`/t/${company.tenantSlug}`);
  deps.revalidate(`/t/${company.tenantSlug}/company`);
  deps.revalidate(`/t/${company.tenantSlug}/company/setup`);
  deps.revalidate(`/t/${company.tenantSlug}/dashboard`);
}

async function requireCompany(
  companyId: string,
  deps: CompanyActionDependencies,
): Promise<CompanyActionRecord> {
  const company = await deps.getCompany(companyId);
  if (!company) throw new ApiError('NOT_FOUND', 'Company not found', 404);
  return company;
}

export async function runCreateCompanyAction(
  formData: FormData,
  deps: CompanyActionDependencies,
): Promise<CompanyActionResult<{ tenantId: string; companyId: string }>> {
  try {
    const actor = await deps.requireActor();
    const parsed = parseCreate(formData);
    const result = await deps.provisionCompany(parsed, actor.id);
    revalidateCompany(
      {
        id: result.companyId,
        tenantId: result.tenantId,
        tenantSlug: parsed.slug,
        companyName: parsed.companyName,
      },
      deps,
    );
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, 'Unable to create company workspace', deps);
  }
}

export async function runAssignCompanyProAction(
  formData: FormData,
  deps: CompanyActionDependencies,
): Promise<CompanyActionResult<CompanyAssignmentActionData>> {
  try {
    const actor = await deps.requireActor();
    const input = parseAssign(formData);
    const company = await requireCompany(input.companyId, deps);
    const { assignmentId } = await deps.assign(input, actor.id);
    revalidateCompany(company, deps);
    return { ok: true, data: { assignmentId, outcome: 'assigned' } };
  } catch (error) {
    return failure(error, 'Invalid company assignment input', deps);
  }
}

export async function runReleaseCompanyProAction(
  formData: FormData,
  deps: CompanyActionDependencies,
): Promise<CompanyActionResult<CompanyReleaseActionData>> {
  try {
    const actor = await deps.requireActor();
    const input = parseRelease(formData);
    const company = await requireCompany(input.companyId, deps);
    if (input.companyNameConfirmation !== company.companyName) {
      return {
        ok: false,
        error: 'Company name confirmation does not match',
        code: 'CONFIRMATION_MISMATCH',
        fieldErrors: { companyNameConfirmation: 'mismatch' },
      };
    }
    await deps.release(
      { companyId: input.companyId, assignmentId: input.assignmentId, reason: input.reason },
      actor.id,
    );
    revalidateCompany(company, deps);
    return { ok: true, data: { outcome: 'released' } };
  } catch (error) {
    return failure(error, 'Invalid company release input', deps);
  }
}

export async function runReassignCompanyProAction(
  formData: FormData,
  deps: CompanyActionDependencies,
): Promise<CompanyActionResult<CompanyAssignmentActionData>> {
  try {
    const actor = await deps.requireActor();
    const input = parseReassign(formData);
    const company = await requireCompany(input.companyId, deps);
    const { assignmentId } = await deps.reassign(input, actor.id);
    revalidateCompany(company, deps);
    return { ok: true, data: { assignmentId, outcome: 'reassigned' } };
  } catch (error) {
    return failure(error, 'Unable to update company assignment', deps);
  }
}
