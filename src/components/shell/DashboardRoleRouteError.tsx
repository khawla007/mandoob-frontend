'use client';

import { useTranslations } from 'next-intl';

import { DashboardRouteState } from './DashboardRouteStates';

export function DashboardRoleRouteError({
  unstableRetry,
  safeHref,
}: {
  unstableRetry: () => void;
  safeHref: string;
}) {
  const t = useTranslations('dashboardStates');

  return (
    <DashboardRouteState
      state="error"
      title={t('errorTitle')}
      safeDescription={t('errorDescription')}
      onRetry={unstableRetry}
      retryLabel={t('retry')}
      safeHref={safeHref}
      safeHrefLabel={t('safeHome')}
    />
  );
}
