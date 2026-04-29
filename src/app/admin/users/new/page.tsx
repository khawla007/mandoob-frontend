import { requireRole } from '@/lib/auth/require-role';
import { listTenants } from '@/lib/data/tenants';
import { CreateUserForm } from '@/components/admin/CreateUserForm';

export const dynamic = 'force-dynamic';

export default async function NewUserPage() {
  const session = await requireRole('super_admin', 'admin');
  const callerRole = session.role as 'super_admin' | 'admin';
  const tenants = callerRole === 'super_admin' ? await listTenants() : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create user</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Sends a Supabase invite email and creates the matching profile.
        </p>
      </div>
      <CreateUserForm
        callerRole={callerRole}
        callerTenantId={session.tenantId}
        tenants={tenants}
      />
    </div>
  );
}
