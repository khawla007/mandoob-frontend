'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { payInvoiceAction } from '@/app/(tenant)/t/[tenant]/(customer)/portal/payments/actions';

export function PayButton({
  invoiceId,
  tenantSlug,
  expectedVersion,
}: {
  invoiceId: string;
  tenantSlug: string;
  expectedVersion: number;
}) {
  const t = useTranslations('customer.financeWorkspace.payAction');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const operationRef = useRef<string | null>(null);

  const onClick = () => {
    setError(null);
    operationRef.current ??= crypto.randomUUID();
    startTransition(async () => {
      const result = await payInvoiceAction({
        tenantSlug,
        invoiceId,
        expectedVersion,
        operationId: operationRef.current!,
      });
      if (result.ok) {
        window.location.assign(result.data.redirectUrl);
      } else {
        if (result.code !== 'UNAVAILABLE') operationRef.current = null;
        setError(result.code === 'UNAVAILABLE' ? t('unavailable') : t('failed'));
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button className="min-h-11" size="sm" onClick={onClick} disabled={pending}>
        {pending ? t('redirecting') : t('pay')}
      </Button>
      {error ? (
        <p className="text-destructive text-xs" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
