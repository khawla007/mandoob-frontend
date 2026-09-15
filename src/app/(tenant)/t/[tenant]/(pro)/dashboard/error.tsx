'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset(): void;
}) {
  const t = useTranslations('pro.dashboard.signalStudio');
  useEffect(() => {
    console.error('Dashboard render failed', error.digest);
  }, [error.digest]);
  return (
    <div role="alert" className="signal-dashboard__state rounded-2xl border p-8 text-center">
      <h1 className="text-xl font-semibold">{t('errorBoundary.title')}</h1>
      <p className="text-muted-foreground mt-2 text-sm">{t('errorBoundary.description')}</p>
      <Button className="mt-5 min-h-11" onClick={reset}>
        {t('retry')}
      </Button>
    </div>
  );
}
