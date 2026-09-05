'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function ImportJobError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('pro.importJob');
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="font-medium">{t('actionError')}</p>
      <p className="text-muted-foreground mt-1 text-sm">{t('errorsDownloadUnavailable')}</p>
      <Button className="mt-4" variant="outline" onClick={reset}>
        {t('retry')}
      </Button>
    </div>
  );
}
