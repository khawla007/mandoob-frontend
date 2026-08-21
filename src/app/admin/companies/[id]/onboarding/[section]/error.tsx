'use client';

import { useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminCompanyOnboardingError({ reset }: { reset(): void }) {
  const t = useTranslations('companyOnboarding.errorBoundary');
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border p-6" role="alert">
      <AlertCircle className="text-destructive size-6" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground mt-2 text-sm">{t('description')}</p>
      <Button type="button" onClick={() => reset()} className="mt-5 min-h-11">
        {t('retry')}
      </Button>
    </section>
  );
}
