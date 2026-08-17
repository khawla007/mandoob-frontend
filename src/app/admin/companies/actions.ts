'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import {
  assignProToCompany,
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
} from './action-logic';

const dependencies: CompanyActionDependencies = {
  async requireActor() {
    const session = await requirePlatformOperator();
    return { id: session.id, role: session.role as 'admin' | 'super_admin' };
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
  reportError(context, error) {
    console.error(context, error);
  },
};

export async function createCompanyAction(
  _previous: CompanyActionResult<{ tenantId: string; companyId: string }> | null,
  formData: FormData,
): Promise<CompanyActionResult<{ tenantId: string; companyId: string }>> {
  return runCreateCompanyAction(formData, dependencies);
}

export async function assignCompanyProAction(
  _previous: CompanyActionResult<{ assignmentId: string }> | null,
  formData: FormData,
): Promise<CompanyActionResult<{ assignmentId: string }>> {
  return runAssignCompanyProAction(formData, dependencies);
}

export async function releaseCompanyProAction(
  _previous: CompanyActionResult | null,
  formData: FormData,
): Promise<CompanyActionResult> {
  return runReleaseCompanyProAction(formData, dependencies);
}

export async function reassignCompanyProAction(
  _previous: CompanyActionResult<{ assignmentId: string }> | null,
  formData: FormData,
): Promise<CompanyActionResult<{ assignmentId: string }>> {
  return runReassignCompanyProAction(formData, dependencies);
}
