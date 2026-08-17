'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { updateAssignedCompanyProfile } from '@/lib/data/company-profile-update';
import { companyProfileSchema } from '@/lib/validation/company-profile';

export type CompanyProfileActionState = {
  status: 'idle' | 'success' | 'error';
  message?: 'saved' | 'validation' | 'notFound' | 'conflict' | 'unexpected';
  fieldErrors?: Partial<
    Record<'company_name' | 'trade_license_no' | 'jurisdiction' | 'license_expiry', string>
  >;
  updatedAt?: string;
};

export const initialCompanyProfileActionState: CompanyProfileActionState = { status: 'idle' };

function value(formData: FormData, name: string): string {
  const entry = formData.get(name);
  return typeof entry === 'string' ? entry : '';
}

export async function updateAssignedCompanyProfileAction(
  tenantSlug: string,
  companyId: string,
  previousState: CompanyProfileActionState,
  formData: FormData,
): Promise<CompanyProfileActionState> {
  const { session, tenant } = await requireProTenantRouteAccess(tenantSlug);
  if (!z.string().uuid().safeParse(companyId).success) {
    return { status: 'error', message: 'notFound', updatedAt: previousState.updatedAt };
  }

  const parsed = companyProfileSchema.safeParse({
    company_name: value(formData, 'company_name'),
    trade_license_no: value(formData, 'trade_license_no'),
    jurisdiction: value(formData, 'jurisdiction'),
    license_expiry: value(formData, 'license_expiry'),
  });
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return {
      status: 'error',
      message: 'validation',
      fieldErrors: Object.fromEntries(
        Object.entries(flattened).map(([key, messages]) => [key, messages?.[0] ?? 'validation']),
      ),
      updatedAt: previousState.updatedAt,
    };
  }

  const expectedUpdatedAt = value(formData, 'expected_updated_at');
  if (!z.string().datetime({ offset: true }).safeParse(expectedUpdatedAt).success) {
    return { status: 'error', message: 'conflict', updatedAt: previousState.updatedAt };
  }

  let result: Awaited<ReturnType<typeof updateAssignedCompanyProfile>>;
  try {
    result = await updateAssignedCompanyProfile({
      actorId: session.id,
      tenantId: tenant.id,
      companyId,
      expectedUpdatedAt,
      companyName: parsed.data.company_name,
      tradeLicenseNo: parsed.data.trade_license_no,
      jurisdiction: parsed.data.jurisdiction,
      licenseExpiry: parsed.data.license_expiry,
    });
  } catch {
    console.error('company-profile.update unexpected-failure');
    return { status: 'error', message: 'unexpected', updatedAt: previousState.updatedAt };
  }
  if (!result.ok) {
    return { status: 'error', message: result.code, updatedAt: previousState.updatedAt };
  }

  revalidatePath(`/t/${tenantSlug}/company`);
  revalidatePath(`/t/${tenantSlug}/dashboard`);
  return { status: 'success', message: 'saved', updatedAt: result.updatedAt };
}
