import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminMeetingsPage() {
  await requirePlatformOperator();
  return <OperationalUnavailableRoute role="admin" module="meetings" baseHref="/admin/meetings" />;
}
