import { OperationalWorkspace } from '@/components/operations/OperationalWorkspace';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminCommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformOperator();
  return (
    <OperationalWorkspace
      role="admin"
      module="communications"
      baseHref="/admin/communications"
      search={await searchParams}
    />
  );
}
