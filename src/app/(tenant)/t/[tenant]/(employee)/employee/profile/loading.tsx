import { getTranslations } from 'next-intl/server';
import { DashboardRouteState } from '@/components/shell/DashboardRouteStates';
export default async function Loading() {
  const t = await getTranslations('employee.common');
  return <DashboardRouteState state="loading" label={t('loading')} />;
}
