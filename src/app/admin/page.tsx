import { getLocale, getTranslations } from 'next-intl/server';
import { CommandDashboard } from '@/components/admin/dashboard/CommandDashboard';
import { resolveDashboardPeriod } from '@/lib/admin-dashboard/period';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { loadAdminCommandDashboard } from '@/lib/data/admin-command-dashboard';

export const dynamic = 'force-dynamic';

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  await requirePlatformOperator();
  const { period } = await searchParams;
  const resolvedPeriod = resolveDashboardPeriod(period);
  const [dashboard, locale, t] = await Promise.all([
    loadAdminCommandDashboard(resolvedPeriod),
    getLocale(),
    getTranslations('admin'),
  ]);
  const translate = (key: string, values?: Record<string, string | number | Date>) =>
    t(key as never, values as never);

  return <CommandDashboard dashboard={dashboard} locale={locale} t={translate} />;
}
