'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function SettingsError({ unstable_retry }: { unstable_retry: () => void }) {
  const t = useTranslations('pro.settings');

  return (
    <div className="signal-panel mx-auto w-full max-w-[96rem] rounded-xl border p-6" role="alert">
      <h2 className="text-lg font-semibold">{t('loadFailed')}</h2>
      <p className="text-muted-foreground mt-1 text-sm">{t('sourceUnavailable')}</p>
      <Button className="mt-4" type="button" onClick={() => unstable_retry()}>
        {t('retry')}
      </Button>
    </div>
  );
}
