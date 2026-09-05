'use client';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
export default function EmployeeRegistryError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('customer.employeeRegistry');
  return (
    <div role="alert" className="rounded-lg border border-dashed p-8 text-center">
      <h1 className="font-semibold">{t('error')}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{t('errorDescription')}</p>
      <Button className="mt-4" onClick={reset}>
        {t('retry')}
      </Button>
    </div>
  );
}
