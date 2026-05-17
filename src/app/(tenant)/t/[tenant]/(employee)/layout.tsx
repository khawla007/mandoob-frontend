import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { DashboardLayout } from '@/components/shell/DashboardLayout';

export const dynamic = 'force-dynamic';

export default async function EmployeeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const session = await requireRole('employee');

  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();
  if (session.tenantId !== tenant.id) notFound();
  await requireActiveTenant(tenant.id);

  const initials = (session.email ?? 'E').slice(0, 1).toUpperCase();

  return (
    <DashboardLayout
      navKind="employee"
      navSlug={tenant.slug}
      brand={tenant.name}
      brandSubtitle="Employee portal"
      brandHref={`/t/${tenant.slug}/employee/dashboard`}
      brandInitial={tenant.name.slice(0, 1).toUpperCase()}
      user={{ email: session.email, role: 'employee', initials }}
    >
      {children}
    </DashboardLayout>
  );
}
