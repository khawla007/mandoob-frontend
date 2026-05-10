import { notFound, redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/require-role';
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
  const session = await requireSession();

  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  if (session.role !== 'super_admin' && session.tenantId !== tenant.id) {
    redirect('/login');
  }

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
