'use client';
import { useTranslations } from 'next-intl';
import { DashboardRouteState } from '@/components/shell/DashboardRouteStates';
export default function Error({ unstable_retry }: { unstable_retry: () => void }) {
  const t = useTranslations('employee.common');
  return (
    <DashboardRouteState
      state="error"
      title={t('errorTitle')}
      safeDescription={t('errorDescription')}
      onRetry={unstable_retry}
      retryLabel={t('retry')}
    />
  );
}
