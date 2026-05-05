import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/require-role';
import { isTenantActive, resolveTenantBySlug } from '@/lib/data/tenant';
import { TenantSuspendedBanner } from '@/components/tenant/TenantSuspendedBanner';
import { CustomerTopNav } from '@/components/customer/CustomerTopNav';

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

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {!isTenantActive(tenant.status) ? (
        <div className="mb-6">
          <TenantSuspendedBanner status={tenant.status} />
        </div>
      ) : null}
      <div className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
        Customer portal · {tenant.name}
      </div>
      <CustomerTopNav slug={tenant.slug} />
      {children}
    </div>
  );
}
