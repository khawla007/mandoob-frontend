import { notFound, redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/require-role';
import { resolveTenantBySlug } from '@/lib/data/tenant';

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

  return <>{children}</>;
}
