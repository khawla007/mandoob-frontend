import { permanentRedirect } from 'next/navigation';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';

export const dynamic = 'force-dynamic';

export default async function LegacyClientImportPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  await requireProTenantRouteAccess(slug);
  permanentRedirect(`/t/${slug}/company`);
}
