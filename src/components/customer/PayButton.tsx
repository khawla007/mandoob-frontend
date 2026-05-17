'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { payInvoiceAction } from '@/app/(tenant)/t/[tenant]/(customer)/portal/payments/actions';

export function PayButton({ invoiceId, tenantSlug }: { invoiceId: string; tenantSlug: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await payInvoiceAction({ tenantSlug, invoiceId });
      if (result.ok) {
        window.location.assign(result.data.redirectUrl);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={onClick} disabled={pending}>
        {pending ? 'Redirecting…' : 'Pay'}
      </Button>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
