'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function RenewalsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('pro');
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="font-medium">{t('renewalUnavailable')}</p>
      <p className="text-muted-foreground mt-1 text-sm">{t('renewalUnavailableDescription')}</p>
      <Button className="mt-4" onClick={reset} variant="outline">
        {t('renewalRetry')}
      </Button>
    </div>
  );
}
