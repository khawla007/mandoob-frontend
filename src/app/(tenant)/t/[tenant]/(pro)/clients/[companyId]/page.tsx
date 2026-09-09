import { notFound, permanentRedirect } from 'next/navigation';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import {
  buildAssignedCompanyHref,
  parseAssignedCompanySearch,
  type AssignedCompanySearchParams,
} from '../../company/page-logic';

export const dynamic = 'force-dynamic';

export default async function LegacyCompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string; companyId: string }>;
  searchParams: Promise<AssignedCompanySearchParams>;
}) {
  const { tenant: slug, companyId } = await params;
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id || company.id !== companyId) notFound();

  const focus = parseAssignedCompanySearch(await searchParams);
  permanentRedirect(buildAssignedCompanyHref(slug, focus));
}
