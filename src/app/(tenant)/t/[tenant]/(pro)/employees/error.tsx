'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function EmployeesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('pro.employeeRegistry.states');
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="font-medium">{t('unavailable')}</p>
      <p className="text-muted-foreground mt-1 text-sm">{t('sanitizedError')}</p>
      <Button className="mt-4" onClick={reset} variant="outline">
        {t('retry')}
      </Button>
    </div>
  );
}
