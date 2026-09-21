import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformOperator();
  return (
    <div className="admin-management-signal admin-operational-workspace admin-operational-unavailable-workspace">
      <OperationalUnavailableRoute
        role="admin"
        module="tasks"
        baseHref="/admin/tasks"
        search={await searchParams}
      />
    </div>
  );
}
