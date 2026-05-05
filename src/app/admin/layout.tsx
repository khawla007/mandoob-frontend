import { requireRole, requireAal2 } from '@/lib/auth/require-role';
import { DashboardLayout } from '@/components/shell/DashboardLayout';
import { adminNav } from '@/lib/shell/nav-admin';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole('super_admin', 'admin');
  await requireAal2(session).catch(() => {});

  const initials = (session.email ?? 'A').slice(0, 1).toUpperCase();

  return (
    <DashboardLayout
      nav={adminNav}
      brand="Mandoob"
      brandSubtitle={session.role === 'super_admin' ? 'Super Admin' : 'Admin'}
      brandHref="/admin"
      brandInitial="M"
      user={{ email: session.email, role: session.role ?? 'admin', initials }}
    >
      {children}
    </DashboardLayout>
  );
}
