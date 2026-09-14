import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminCommunicationsPage() {
  await requirePlatformOperator();
  return (
    <OperationalUnavailableRoute
      role="admin"
      module="communications"
      baseHref="/admin/communications"
    />
  );
}
