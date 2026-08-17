import { getTranslations } from 'next-intl/server';
import { requireRole } from '@/lib/auth/require-role';
import { listTenants } from '@/lib/data/tenants';
import { CreateUserForm } from '@/components/admin/CreateUserForm';

export const dynamic = 'force-dynamic';

export default async function NewUserPage() {
  await requireRole('super_admin', 'admin');
  const t = await getTranslations('admin');
  // Customer and employee creation still needs the tenant list. PRO identities
  // start unassigned and are bound through /admin/companies after verification.
  const tenants = await listTenants();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('user.createTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('user.createIntro')}</p>
      </div>
      <CreateUserForm tenants={tenants} />
    </div>
  );
}
