'use client';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

export default function DocumentCenterError({ reset }: { reset(): void }) {
  const t = useTranslations('proDocumentCenter');

  return (
    <main className="document-center min-w-0">
      <section
        role="alert"
        aria-labelledby="document-center-error-title"
        className="signal-panel document-center__page-error rounded-2xl border p-6 text-center sm:p-8"
      >
        <span className="document-center__page-error-icon" aria-hidden="true">
          <TriangleAlert className="size-5" />
        </span>
        <h1 id="document-center-error-title" className="mt-4 text-xl font-semibold">
          {t('pageError.title')}
        </h1>
        <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-sm">
          {t('pageError.description')}
        </p>
        <Button className="mt-5" onClick={reset}>
          {t('pageError.retry')}
        </Button>
      </section>
    </main>
  );
}
