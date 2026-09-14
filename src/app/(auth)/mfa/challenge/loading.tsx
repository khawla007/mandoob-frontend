'use client';

import { useTranslations } from 'next-intl';

export default function MfaChallengeLoading() {
  const t = useTranslations('auth.mfa.challenge');
  return (
    <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
      {t('loading')}
    </p>
  );
}
