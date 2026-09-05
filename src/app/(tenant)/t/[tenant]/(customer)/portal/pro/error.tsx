'use client';
import { DashboardRoleRouteError } from '@/components/shell/DashboardRoleRouteError';
export default function CustomerProError({ unstable_retry }: { unstable_retry: () => void }) {
  return <DashboardRoleRouteError unstableRetry={unstable_retry} safeHref="/account" />;
}
