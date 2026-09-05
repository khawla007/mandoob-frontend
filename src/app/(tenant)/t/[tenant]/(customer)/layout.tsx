import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { requireCustomerTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { isTenantActive } from '@/lib/data/tenant';
import { getTenantBranding } from '@/lib/data/tenant-settings';
import { buildTenantBrandingView } from '@/lib/tenant/branding';
import { TenantSuspendedBanner } from '@/components/tenant/TenantSuspendedBanner';
import { DashboardLayout } from '@/components/shell/DashboardLayout';

export const dynamic = 'force-dynamic';

export default async function CustomerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const { session, tenant } = await requireCustomerTenantRouteAccess(slug);
  const t = await getTranslations('shell');
  const branding = buildTenantBrandingView(
    (await getTenantBranding(tenant.id)) ?? {
      name: tenant.name,
      logo_url: null,
      favicon_url: null,
      primary_color: null,
      secondary_color: null,
    },
  );

  const initials = (session.email ?? 'C').slice(0, 1).toUpperCase();

  return (
    <DashboardLayout
      navKind="customer"
      navSlug={tenant.slug}
      brand={branding.name}
      brandSubtitle={t('companyPortal')}
      brandHref={`/t/${tenant.slug}/portal`}
      brandInitial={branding.initial}
      brandLogoUrl={branding.logoUrl}
      user={{ email: session.email, role: session.role ?? 'customer', initials }}
    >
      {!isTenantActive(tenant.status) ? (
        <TenantSuspendedBanner status={tenant.status} className="mb-6" />
      ) : null}
      {children}
      {branding.termsUrl || branding.privacyUrl ? (
        <footer className="border-border text-muted-foreground mt-10 flex flex-wrap gap-4 border-t pt-4 text-xs">
          {branding.termsUrl ? (
            <Link href={branding.termsUrl} target="_blank" rel="noreferrer">
              {t('terms')}
            </Link>
          ) : null}
          {branding.privacyUrl ? (
            <Link href={branding.privacyUrl} target="_blank" rel="noreferrer">
              {t('privacy')}
            </Link>
          ) : null}
        </footer>
      ) : null}
    </DashboardLayout>
  );
}
