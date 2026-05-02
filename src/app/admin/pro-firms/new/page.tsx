import { requireRole } from '@/lib/auth/require-role';
import { CreateProFirmForm } from '@/components/admin/CreateProFirmForm';

export const dynamic = 'force-dynamic';

export default async function NewProFirmPage() {
  await requireRole('super_admin');

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create PRO firm</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Provisions a tenant and creates the initial PRO admin user. Tenant goes live (status =
          active) immediately.
        </p>
      </div>
      <CreateProFirmForm />
    </div>
  );
}
