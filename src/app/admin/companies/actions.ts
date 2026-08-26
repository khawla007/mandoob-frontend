'use server';

import 'server-only';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { logSafeActionError } from '@/lib/actions/server-action-security';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import {
  assignProToCompany,
  readCurrentCompanyAssignment,
  reassignCompanyPro,
  releaseCompanyPro,
} from '@/lib/data/company-assignments';
import { getCompanyById } from '@/lib/data/pro-firms';
import { provisionTenant } from '@/lib/data/provision-tenant';
import {
  runAssignCompanyProAction,
  runCreateCompanyAction,
  runReassignCompanyProAction,
  runReleaseCompanyProAction,
  type CompanyActionDependencies,
  type CompanyActionResult,
  type CompanyAssignmentActionData,
  type CompanyReleaseActionData,
} from './action-logic';

const dependencies: CompanyActionDependencies = {
  async requireActor() {
    const session = await requirePlatformOperator();
    return {
      id: session.id,
      role: session.role as 'admin' | 'super_admin',
      aal: session.aal,
    };
  },
  async getAssignmentTarget(companyId, assignmentId, actorId) {
    const assignment = await readCurrentCompanyAssignment(companyId, actorId);
    return assignment?.id === assignmentId ? { id: assignment.id } : null;
  },
  async limitAssignment(actorId, companyId) {
    const { consumeSensitiveRateLimit, SENSITIVE_RATE_LIMITS } = await import('@/lib/rate-limit');
    return consumeSensitiveRateLimit({
      key: `company-pro-assignment:${actorId}:${companyId}`,
      routeLabel: 'company-pro-assignment',
      correlationId: randomUUID(),
      ...SENSITIVE_RATE_LIMITS.credentialMutation,
    });
  },
  provisionCompany: provisionTenant,
  async getCompany(companyId) {
    const company = await getCompanyById(companyId);
    return company
      ? {
          id: company.id,
          tenantId: company.tenantId,
          tenantSlug: company.tenantSlug,
          companyName: company.companyName,
        }
      : null;
  },
  assign: assignProToCompany,
  release: releaseCompanyPro,
  reassign: reassignCompanyPro,
  revalidate: revalidatePath,
  reportError: logSafeActionError,
};

export async function createCompanyAction(
  _previous: CompanyActionResult<{ tenantId: string; companyId: string }> | null,
  formData: FormData,
): Promise<CompanyActionResult<{ tenantId: string; companyId: string }>> {
  return runCreateCompanyAction(formData, dependencies);
}

export async function assignCompanyProAction(
  _previous: CompanyActionResult<CompanyAssignmentActionData> | null,
  formData: FormData,
): Promise<CompanyActionResult<CompanyAssignmentActionData>> {
  return runAssignCompanyProAction(formData, dependencies);
}

export async function releaseCompanyProAction(
  _previous: CompanyActionResult<CompanyReleaseActionData> | null,
  formData: FormData,
): Promise<CompanyActionResult<CompanyReleaseActionData>> {
  return runReleaseCompanyProAction(formData, dependencies);
}

export async function reassignCompanyProAction(
  _previous: CompanyActionResult<CompanyAssignmentActionData> | null,
  formData: FormData,
): Promise<CompanyActionResult<CompanyAssignmentActionData>> {
  return runReassignCompanyProAction(formData, dependencies);
}
