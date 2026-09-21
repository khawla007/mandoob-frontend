import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminNotificationsPage() {
  await requirePlatformOperator();
  return (
    <div className="admin-management-signal admin-operational-workspace admin-operational-unavailable-workspace">
      <OperationalUnavailableRoute
        role="admin"
        module="notifications"
        baseHref="/admin/notifications"
      />
    </div>
  );
}
