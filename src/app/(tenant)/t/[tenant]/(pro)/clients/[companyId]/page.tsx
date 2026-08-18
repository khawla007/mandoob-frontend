import { permanentRedirect } from 'next/navigation';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import {
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
  const { tenant: slug } = await params;
  await requireProTenantRouteAccess(slug);

  const focus = parseAssignedCompanySearch(await searchParams);
  const query = new URLSearchParams({ tab: focus.tab });
  if (focus.documentId) query.set('document', focus.documentId);
  else if (focus.requestId) query.set('request', focus.requestId);

  permanentRedirect(`/t/${encodeURIComponent(slug)}/company?${query}`);
}
