import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformOperator();
  return (
    <div className="admin-management-signal admin-operational-workspace admin-operational-unavailable-workspace">
      <OperationalUnavailableRoute
        role="admin"
        module="calendar"
        baseHref="/admin/calendar"
        search={await searchParams}
      />
    </div>
  );
}
