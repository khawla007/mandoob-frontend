import { notFound } from 'next/navigation';
import { requireRole, requireMfaEnrolled } from '@/lib/auth/require-role';
import { isTenantActive, resolveTenantBySlug } from '@/lib/data/tenant';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { ProSidebar } from '@/components/pro/ProSidebar';
import { ProTopbar } from '@/components/pro/ProTopbar';
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
  const session = await requireRole('pro', 'admin', 'super_admin');
  // MFA enforcement toggles on in M6 once enrollment UI ships.
  await requireMfaEnrolled(session).catch(() => {});

  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  return (
    <SidebarProvider>
      <ProSidebar tenantSlug={tenant.slug} tenantName={tenant.name} email={session.email} />
      <SidebarInset>
        <ProTopbar tenantName={tenant.name} />
        {!isTenantActive(tenant.status) ? (
          <TenantSuspendedBanner status={tenant.status} className="mx-6 mt-6 md:mx-8" />
        ) : null}
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
