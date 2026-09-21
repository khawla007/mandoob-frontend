import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminCommunicationsPage() {
  await requirePlatformOperator();
  return (
    <div className="admin-management-signal admin-operational-workspace admin-operational-unavailable-workspace">
      <OperationalUnavailableRoute
        role="admin"
        module="communications"
        baseHref="/admin/communications"
      />
    </div>
  );
}
