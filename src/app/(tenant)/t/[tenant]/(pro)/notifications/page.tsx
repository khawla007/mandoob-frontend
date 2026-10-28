import { OperationalWorkspace } from '@/components/operations/OperationalWorkspace';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';

export default async function ProNotificationsPage({
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
      module="notifications"
      baseHref={`/t/${encodeURIComponent(slug)}/notifications`}
      tenantSlug={slug}
      search={await searchParams}
    />
  );
}
