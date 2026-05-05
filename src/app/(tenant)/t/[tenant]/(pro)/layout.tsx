import { notFound } from 'next/navigation';
import { requireRole, requireMfaEnrolled } from '@/lib/auth/require-role';
import { isTenantActive, resolveTenantBySlug } from '@/lib/data/tenant';
import { DashboardLayout } from '@/components/shell/DashboardLayout';
import { TenantSuspendedBanner } from '@/components/tenant/TenantSuspendedBanner';

export const dynamic = 'force-dynamic';

export default async function ProLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const session = await requireRole('pro');
  // MFA enforcement toggles on in M6 once enrollment UI ships.
  await requireMfaEnrolled(session).catch(() => {});

  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const initials = (session.email ?? 'P').slice(0, 1).toUpperCase();
  const suspended = !isTenantActive(tenant.status);

  return (
    <DashboardLayout
      navKind="pro"
      navSlug={tenant.slug}
      brand={tenant.name}
      brandSubtitle="PRO workspace"
      brandHref={`/t/${tenant.slug}/dashboard`}
      brandInitial={tenant.name.slice(0, 1).toUpperCase()}
      user={{ email: session.email, role: 'pro', initials }}
    >
      {suspended ? <TenantSuspendedBanner status={tenant.status} className="mb-6" /> : null}
      {children}
    </DashboardLayout>
  );
}
