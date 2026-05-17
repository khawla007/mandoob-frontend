'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  issueRefundAction,
  markInvoicePaidAction,
  voidInvoiceAction,
} from '@/app/(tenant)/t/[tenant]/(pro)/payments/actions';

export function InvoiceActions({
  slug,
  invoiceId,
  amountMinor,
  status,
}: {
  slug: string;
  invoiceId: string;
  amountMinor: number;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  function run(action: 'paid' | 'void' | 'refund') {
    setMessage(null);
    startTransition(async () => {
      const result =
        action === 'paid'
          ? await markInvoicePaidAction({ tenantSlug: slug, invoiceId, method: 'bank_transfer' })
          : action === 'void'
            ? await voidInvoiceAction({ tenantSlug: slug, invoiceId, reason: reason || 'Voided by PRO' })
            : await issueRefundAction({
                tenantSlug: slug,
                invoiceId,
                amountMinor,
                reason: reason || 'Refund requested',
              });
      if (!result.ok) {
        setMessage(`${result.code}: ${result.error}`);
        return;
      }
      setMessage('Updated');
      router.refresh();
    });
  }

  const canClose = status === 'open' || status === 'draft';
  const canRefund = status === 'paid' || status === 'partially_refunded';

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {canClose && (
          <>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run('paid')}>
              Mark paid
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run('void')}>
              Void
            </Button>
          </>
        )}
        {canRefund && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run('refund')}>
            Refund
          </Button>
        )}
      </div>
      {(canClose || canRefund) && (
        <Input
          className="h-7 max-w-52 text-xs"
          placeholder={canRefund ? 'Refund reason' : 'Void note'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      {message ? <p className="text-muted-foreground max-w-52 text-right text-xs">{message}</p> : null}
    </div>
  );
}
