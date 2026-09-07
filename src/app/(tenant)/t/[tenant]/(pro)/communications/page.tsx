import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';

export default async function ProCommunicationsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  await requireProTenantRouteAccess(slug);
  return (
    <OperationalUnavailableRoute
      role="pro"
      module="communications"
      baseHref={`/t/${encodeURIComponent(slug)}/communications`}
    />
  );
}
