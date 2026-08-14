'use client';

import { useTranslations } from 'next-intl';

import { DocumentCenterErrorView } from '@/components/pro/documents/DocumentCenterErrorView';

export default function DocumentCenterError({ unstable_retry }: { unstable_retry(): void }) {
  const t = useTranslations('proDocumentCenter');

  return (
    <DocumentCenterErrorView
      title={t('pageError.title')}
      description={t('pageError.description')}
      retry={t('pageError.retry')}
      onRetry={unstable_retry}
    />
  );
}
