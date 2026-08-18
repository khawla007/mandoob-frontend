'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  issueRefundAction,
  markInvoicePaidAction,
  voidInvoiceAction,
} from '@/app/(tenant)/t/[tenant]/(pro)/payments/actions';
import type { RefundOperationState } from '@/lib/data/invoices';
import { syncRefundOperationId } from './refund-operation-state';

export function InvoiceActions({
  slug,
  invoiceId,
  amountMinor,
  status,
  refundOperation,
}: {
  slug: string;
  invoiceId: string;
  amountMinor: number;
  status: string;
  refundOperation: RefundOperationState | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const refundOperationId = useRef<string | null>(null);
  const hasPendingRefund = refundOperation?.status === 'pending';

  useEffect(() => {
    refundOperationId.current = syncRefundOperationId(refundOperationId.current, refundOperation);
  }, [refundOperation]);

  function run(action: 'paid' | 'void' | 'refund') {
    setMessage(null);
    startTransition(async () => {
      if (action === 'refund') refundOperationId.current ??= crypto.randomUUID();
      const result =
        action === 'paid'
          ? await markInvoicePaidAction({ tenantSlug: slug, invoiceId, method: 'bank_transfer' })
          : action === 'void'
            ? await voidInvoiceAction({
                tenantSlug: slug,
                invoiceId,
                reason: reason || 'Voided by PRO',
              })
            : await issueRefundAction({
                tenantSlug: slug,
                invoiceId,
                amountMinor: hasPendingRefund ? refundOperation.amountMinor : amountMinor,
                reason: hasPendingRefund
                  ? (refundOperation.reason ?? 'Refund requested')
                  : reason || 'Refund requested',
                operationId: refundOperationId.current!,
              });
      if (!result.ok) {
        if (action === 'refund' && result.code === 'TAP_TERMINAL') {
          refundOperationId.current = null;
        }
        setMessage(`${result.code}: ${result.error}`);
        return;
      }
      if (action === 'refund' && 'status' in result.data && result.data.status === 'succeeded') {
        refundOperationId.current = null;
      }
      setMessage(
        action === 'refund' && 'status' in result.data && result.data.status === 'pending'
          ? 'Refund pending'
          : 'Updated',
      );
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
            {hasPendingRefund ? 'Retry pending refund' : 'Refund'}
          </Button>
        )}
      </div>
      {(canClose || canRefund) && (
        <Input
          className="h-7 max-w-52 text-xs"
          placeholder={canRefund ? 'Refund reason' : 'Void note'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={hasPendingRefund}
        />
      )}
      {message ? (
        <p className="text-muted-foreground max-w-52 text-right text-xs">{message}</p>
      ) : null}
    </div>
  );
}
