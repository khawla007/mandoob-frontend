'use client';

import { useLinkStatus } from 'next/link';
import { useTranslations } from 'next-intl';

export function PublicLinkPendingIndicator() {
  const { pending } = useLinkStatus();
  const t = useTranslations('site');

  return (
    <span className="public-link-pending" role="status" aria-live="polite">
      {pending ? <span className="public-link-pending__spinner" aria-hidden="true" /> : null}
      <span className="sr-only">{pending ? t('loadingPage') : ''}</span>
    </span>
  );
}
