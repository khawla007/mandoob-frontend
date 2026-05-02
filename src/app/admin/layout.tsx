import { requireRole, requireAal2 } from '@/lib/auth/require-role';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTopbar } from '@/components/admin/AdminTopbar';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole('super_admin', 'admin');
  await requireAal2(session).catch(() => {});

  return (
    <SidebarProvider>
      <AdminSidebar email={session.email} />
      <SidebarInset>
        <AdminTopbar />
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
