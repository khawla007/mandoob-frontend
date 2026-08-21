import { notFound, redirect } from 'next/navigation';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readCompanyOnboarding } from '@/lib/data/company-onboarding';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import {
  canonicalCompanyOnboardingSection,
  companyOnboardingSectionHref,
  isCompanyOnboardingTenantStatusAllowed,
} from './route-logic';

export const dynamic = 'force-dynamic';

export default async function CompanySetupIndex({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  if (!isCompanyOnboardingTenantStatusAllowed(tenant.status)) notFound();
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company) notFound();
  const snapshot = await readCompanyOnboarding({
    actorProfileId: session.id,
    tenantId: tenant.id,
    companyId: company.id,
  });
  if (!snapshot) notFound();

  const section = canonicalCompanyOnboardingSection(snapshot);
  redirect(companyOnboardingSectionHref(slug, section));
}
