import { getTranslations } from 'next-intl/server';
import { requireRole } from '@/lib/auth/require-role';
import { listTenants } from '@/lib/data/tenants';
import { CreateUserForm } from '@/components/admin/CreateUserForm';

export const dynamic = 'force-dynamic';

export default async function NewUserPage() {
  const session = await requireRole('super_admin', 'admin');
  const callerRole = session.role as 'super_admin' | 'admin';
  const t = await getTranslations('admin');
  // Post role-rebase: both platform roles need the tenant list to assign
  // pro/customer/employee accounts to any tenant.
  const tenants = await listTenants();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('user.createTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('user.createIntro')}</p>
      </div>
      <CreateUserForm callerRole={callerRole} tenants={tenants} />
    </div>
  );
}
