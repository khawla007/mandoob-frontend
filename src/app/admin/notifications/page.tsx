import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminNotificationsPage() {
  await requirePlatformOperator();
  return (
    <OperationalUnavailableRoute
      role="admin"
      module="notifications"
      baseHref="/admin/notifications"
    />
  );
}
