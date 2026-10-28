import { OperationalWorkspace } from '@/components/operations/OperationalWorkspace';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';

export default async function ProCommunicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant: slug } = await params;
  await requireProTenantRouteAccess(slug);
  return (
    <OperationalWorkspace
      role="pro"
      module="communications"
      baseHref={`/t/${encodeURIComponent(slug)}/communications`}
      tenantSlug={slug}
      search={await searchParams}
    />
  );
}
