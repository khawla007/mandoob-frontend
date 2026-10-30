import { OperationalWorkspace } from '@/components/operations/OperationalWorkspace';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformOperator();
  return (
    <div className="admin-management-signal admin-operational-workspace">
      <OperationalWorkspace
        role="admin"
        module="tasks"
        baseHref="/admin/tasks"
        search={await searchParams}
      />
    </div>
  );
}
