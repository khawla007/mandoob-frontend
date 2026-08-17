import { notFound } from 'next/navigation';
import { requireCompanyAccess } from '@/lib/auth/require-company-access';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { getTenantBranding } from '@/lib/data/tenant-settings';
import { buildTenantBrandingView, tenantBrandingStyle } from '@/lib/tenant/branding';

export const dynamic = 'force-dynamic';

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();
  await requireCompanyAccess(tenant.id);

  const branding = buildTenantBrandingView(
    (await getTenantBranding(tenant.id)) ?? {
      name: tenant.name,
      logo_url: null,
      favicon_url: null,
      primary_color: null,
      secondary_color: null,
    },
  );

  return <div style={tenantBrandingStyle(branding)}>{children}</div>;
}
