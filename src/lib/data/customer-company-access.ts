import 'server-only';

import type { SessionProfile } from '@/lib/auth/require-user';
import type { Tenant } from '@/lib/data/tenant';

export type CustomerCompanyIdentity = {
  id: string;
  tenantId: string;
  companyName: string;
  status: string;
  onboardingStatus: string;
};

type CustomerLink = { profileId: string; linkedCompanyId: string | null };

export type CustomerCompanyAccess =
  | {
      kind: 'authorized';
      tenant: Tenant;
      session: SessionProfile & { role: 'customer'; tenantId: string };
      company: CustomerCompanyIdentity;
    }
  | {
      kind: 'unlinked';
      tenant: Tenant;
      session: SessionProfile & { role: 'customer'; tenantId: string };
    }
  | {
      kind: 'operator-preview';
      tenant: Tenant;
      session: SessionProfile & { role: 'admin' | 'super_admin' };
    };

export type CustomerCompanyAccessDependencies = {
  requireRouteAccess?: (slug: string) => Promise<{ tenant: Tenant; session: SessionProfile }>;
  requireActiveTenant?: (tenantId: string) => Promise<unknown>;
  readCustomerLink?: (profileId: string) => Promise<CustomerLink | null>;
  readCompany?: (tenantId: string, companyId: string) => Promise<CustomerCompanyIdentity | null>;
  deny?: () => never;
};

type RequiredCustomerCompanyAccessDependencies = CustomerCompanyAccessDependencies & {
  authorize?: (tenantSlug: string, expectedActorId?: string) => Promise<CustomerCompanyAccess>;
};

async function deny(dependencies: CustomerCompanyAccessDependencies): Promise<never> {
  if (dependencies.deny) return dependencies.deny();
  const { notFound } = await import('next/navigation');
  notFound();
  throw new Error('UNREACHABLE_NOT_FOUND');
}

async function defaultRouteAccess(slug: string) {
  const { requireCustomerTenantRouteAccess } =
    await import('@/lib/auth/require-tenant-route-access');
  return requireCustomerTenantRouteAccess(slug);
}

async function defaultActiveTenant(tenantId: string) {
  const { requireActiveTenant } = await import('@/lib/auth/require-active-tenant');
  return requireActiveTenant(tenantId);
}

async function defaultReadCustomerLink(profileId: string): Promise<CustomerLink | null> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const { data, error } = await createSupabaseServiceRoleClient()
    .from('customer_profiles')
    .select('profile_id, linked_company_id')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    profileId: data.profile_id,
    linkedCompanyId: data.linked_company_id,
  };
}

async function defaultReadCompany(
  tenantId: string,
  companyId: string,
): Promise<CustomerCompanyIdentity | null> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const { data, error } = await createSupabaseServiceRoleClient()
    .from('company_profiles')
    .select('id, tenant_id, company_name, status, onboarding_status')
    .eq('tenant_id', tenantId)
    .eq('id', companyId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    tenantId: data.tenant_id,
    companyName: data.company_name,
    status: data.status,
    onboardingStatus: data.onboarding_status,
  };
}

/** The sole boundary permitting Customer overview Company-scoped service-role reads. */
export async function authorizeCustomerLinkedCompanyRead(
  tenantSlug: string,
  expectedActorId?: string,
  dependencies: CustomerCompanyAccessDependencies = {},
): Promise<CustomerCompanyAccess> {
  const { tenant, session } = await (dependencies.requireRouteAccess ?? defaultRouteAccess)(
    tenantSlug,
  );
  await (dependencies.requireActiveTenant ?? defaultActiveTenant)(tenant.id);

  if (session.role === 'admin' || session.role === 'super_admin') {
    return { kind: 'operator-preview', tenant, session: { ...session, role: session.role } };
  }
  if (
    session.role !== 'customer' ||
    session.tenantId !== tenant.id ||
    (expectedActorId !== undefined && expectedActorId !== session.id)
  ) {
    return deny(dependencies);
  }
  const customerSession = { ...session, role: 'customer' as const, tenantId: tenant.id };

  const link = await (dependencies.readCustomerLink ?? defaultReadCustomerLink)(customerSession.id);
  if (!link || link.profileId !== customerSession.id) return deny(dependencies);
  if (!link.linkedCompanyId) return { kind: 'unlinked', tenant, session: customerSession };

  const company = await (dependencies.readCompany ?? defaultReadCompany)(
    tenant.id,
    link.linkedCompanyId,
  );
  if (!company || company.id !== link.linkedCompanyId || company.tenantId !== tenant.id) {
    return deny(dependencies);
  }
  return { kind: 'authorized', tenant, session: customerSession, company };
}

export async function requireAuthorizedCustomerLinkedCompanyRead(
  tenantSlug: string,
  expectedActorId?: string,
  dependencies: RequiredCustomerCompanyAccessDependencies = {},
): Promise<Extract<CustomerCompanyAccess, { kind: 'authorized' }>> {
  const access = await (dependencies.authorize ?? authorizeCustomerLinkedCompanyRead)(
    tenantSlug,
    expectedActorId,
  );
  if (access.kind !== 'authorized') return deny(dependencies);
  return access;
}
