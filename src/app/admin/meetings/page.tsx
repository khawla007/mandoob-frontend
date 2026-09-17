import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminMeetingsPage() {
  await requirePlatformOperator();
  return (
    <div className="admin-management-signal admin-operational-workspace admin-operational-unavailable-workspace">
      <OperationalUnavailableRoute role="admin" module="meetings" baseHref="/admin/meetings" />
    </div>
  );
}
