import { getTranslations } from 'next-intl/server';

import { DashboardRouteState } from './DashboardRouteStates';

export async function DashboardRoleRouteLoading() {
  const t = await getTranslations('dashboardStates');
  return <DashboardRouteState state="loading" label={t('loading')} />;
}
