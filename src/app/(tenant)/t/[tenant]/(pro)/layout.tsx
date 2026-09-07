import { requireMfaEnrolled } from '@/lib/auth/require-role';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { isTenantActive } from '@/lib/data/tenant';
import { getTenantBranding } from '@/lib/data/tenant-settings';
import { buildTenantBrandingView } from '@/lib/tenant/branding';
import { DashboardLayout } from '@/components/shell/DashboardLayout';
import { TenantSuspendedBanner } from '@/components/tenant/TenantSuspendedBanner';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function ProLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const t = await getTranslations('shell');
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await requireMfaEnrolled(session);

  const branding = buildTenantBrandingView(
    (await getTenantBranding(tenant.id)) ?? {
      name: tenant.name,
      logo_url: null,
      favicon_url: null,
      primary_color: null,
      secondary_color: null,
    },
  );

  const initials = (session.email ?? 'P').slice(0, 1).toUpperCase();
  const suspended = !isTenantActive(tenant.status);

  return (
    <DashboardLayout
      navKind="pro"
      navSlug={tenant.slug}
      brand={branding.name}
      brandSubtitle={t('proWorkspace')}
      brandHref={`/t/${tenant.slug}/dashboard`}
      brandInitial={branding.initial}
      brandLogoUrl={branding.logoUrl}
      user={{ email: session.email, role: session.role!, initials }}
    >
      {suspended ? <TenantSuspendedBanner status={tenant.status} className="mb-6" /> : null}
      {children}
    </DashboardLayout>
  );
}
