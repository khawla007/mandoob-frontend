import { OperationalWorkspace } from '@/components/operations/OperationalWorkspace';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformOperator();
  return (
    <div className="admin-management-signal admin-operational-workspace">
      <OperationalWorkspace
        role="admin"
        module="notifications"
        baseHref="/admin/notifications"
        search={await searchParams}
      />
    </div>
  );
}
