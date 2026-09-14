'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

export default function CustomerDocumentCenterError({
  unstable_retry,
}: {
  unstable_retry: () => void;
}) {
  const t = useTranslations('customer.documentCenter');
  return (
    <div className="signal-panel rounded-2xl border p-8 text-center" role="alert">
      <h1 className="font-semibold">{t('pageErrorTitle')}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{t('pageErrorDescription')}</p>
      <Button className="mt-4" type="button" onClick={unstable_retry}>
        {t('retry')}
      </Button>
    </div>
  );
}
