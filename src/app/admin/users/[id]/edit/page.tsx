import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireRole } from '@/lib/auth/require-role';
import { listTenants } from '@/lib/data/tenants';
import { getUserForEdit } from '@/lib/data/admin-read-user';
import { EditUserPanel } from '@/components/admin/EditUserPanel';
import { isUuid } from '@/lib/util/uuid';

export const dynamic = 'force-dynamic';

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole('super_admin', 'admin');
  const callerRole = session.role as 'super_admin' | 'admin';
  const t = await getTranslations('admin');
  const { id } = await params;
  if (!isUuid(id)) notFound();

  let user;
  try {
    user = await getUserForEdit(id, {
      id: session.id,
      role: callerRole,
      tenantId: session.tenantId,
    });
  } catch {
    notFound();
  }

  // Post role-rebase: both platform roles need the tenant list to display
  // and edit non-admin user assignments.
  const tenants = await listTenants();
  const tenantName = user.profile.tenantId
    ? (tenants.find((t) => t.id === user.profile.tenantId)?.name ?? null)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('user.editTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('user.editIntro')}</p>
      </div>
      <EditUserPanel
        user={user}
        callerRole={callerRole}
        tenantName={tenantName}
        tenants={tenants}
      />
    </div>
  );
}
