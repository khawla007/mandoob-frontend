import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/require-role';
import { isTenantActive, resolveTenantBySlug } from '@/lib/data/tenant';
import { getTenantBranding } from '@/lib/data/tenant-settings';
import { buildTenantBrandingView } from '@/lib/tenant/branding';
import { TenantSuspendedBanner } from '@/components/tenant/TenantSuspendedBanner';
import { CustomerTopNav } from '@/components/customer/CustomerTopNav';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function CustomerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  await requireRole('customer', 'super_admin');
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();
  const branding = buildTenantBrandingView(
    (await getTenantBranding(tenant.id)) ?? {
      name: tenant.name,
      logo_url: null,
      favicon_url: null,
      primary_color: null,
      secondary_color: null,
    },
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {!isTenantActive(tenant.status) ? (
        <div className="mb-6">
          <TenantSuspendedBanner status={tenant.status} />
        </div>
      ) : null}
      <div className="mb-3 flex items-center gap-3">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Tenant logos can come from arbitrary configured hosts.
          <img
            src={branding.logoUrl}
            alt=""
            className="bg-background size-9 rounded-md border object-contain"
          />
        ) : (
          <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-md text-sm font-semibold">
            {branding.initial}
          </div>
        )}
        <div>
          <div className="text-muted-foreground text-xs tracking-wide uppercase">Customer portal</div>
          <div className="text-sm font-semibold">{branding.name}</div>
        </div>
      </div>
      <CustomerTopNav slug={tenant.slug} />
      {children}
      {branding.termsUrl || branding.privacyUrl ? (
        <footer className="border-border text-muted-foreground mt-10 flex flex-wrap gap-4 border-t pt-4 text-xs">
          {branding.termsUrl ? (
            <Link href={branding.termsUrl} target="_blank" rel="noreferrer">
              Terms
            </Link>
          ) : null}
          {branding.privacyUrl ? (
            <Link href={branding.privacyUrl} target="_blank" rel="noreferrer">
              Privacy
            </Link>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
}
