'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatMoney } from '@/lib/format/money';
import {
  issueRefundAction,
  markInvoicePaidAction,
  voidInvoiceAction,
} from '@/app/(tenant)/t/[tenant]/(pro)/payments/actions';
import type { RefundOperationState } from '@/lib/data/invoices';
import { canShowRefundAction } from '@/lib/data/invoice-finance-state';
import { syncRefundOperationId } from './refund-operation-state';

export function InvoiceActions({
  slug,
  invoiceId,
  amountMinor,
  currency,
  remainingRefundableMinor,
  status,
  refundOperation,
  refundAvailable = false,
}: {
  slug: string;
  invoiceId: string;
  amountMinor: number;
  currency: string;
  remainingRefundableMinor: number | null;
  status: string;
  refundOperation: RefundOperationState | null;
  refundAvailable?: boolean;
}) {
  const t = useTranslations('pro');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState<'void' | 'refund' | null>(null);
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
                reason: reason || t('paymentDefaultVoidReason'),
              })
            : await issueRefundAction({
                tenantSlug: slug,
                invoiceId,
                amountMinor: hasPendingRefund
                  ? refundOperation.amountMinor
                  : (remainingRefundableMinor ?? amountMinor),
                reason: hasPendingRefund
                  ? (refundOperation.reason ?? t('paymentDefaultRefundReason'))
                  : reason || t('paymentDefaultRefundReason'),
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
          ? t('paymentRefundPending')
          : t('paymentUpdated'),
      );
      router.refresh();
      setConfirmation(null);
    });
  }

  const canClose = status === 'open' || status === 'draft';
  const canRefund =
    (status === 'paid' || status === 'partially_refunded') &&
    canShowRefundAction({
      detailsAvailable: refundAvailable,
      remainingMinor: remainingRefundableMinor,
      hasPendingRefund,
    });
  const refundAmount = hasPendingRefund
    ? refundOperation.amountMinor
    : (remainingRefundableMinor ?? amountMinor);
  const amount = formatMoney(amountMinor, currency, locale);
  const remaining = formatMoney(remainingRefundableMinor ?? 0, currency, locale);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {canClose && (
          <>
            <Button
              size="sm"
              className="min-h-11"
              variant="outline"
              disabled={pending}
              onClick={() => run('paid')}
            >
              {t('paymentMarkPaid')}
            </Button>
            <Button
              size="sm"
              className="min-h-11"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmation('void')}
            >
              {t('paymentVoid')}
            </Button>
          </>
        )}
        {canRefund && (
          <Button
            size="sm"
            className="min-h-11"
            variant="outline"
            disabled={pending}
            onClick={() => (hasPendingRefund ? run('refund') : setConfirmation('refund'))}
          >
            {hasPendingRefund ? t('paymentRetryRefund') : t('paymentRefund')}
          </Button>
        )}
      </div>
      {(canClose || canRefund) && !hasPendingRefund && (
        <label className="text-muted-foreground text-xs" htmlFor="refund-reason">
          {canRefund ? t('paymentRefundReason') : t('paymentVoidNote')}
        </label>
      )}
      {(canClose || canRefund) && !hasPendingRefund && (
        <Input
          id="refund-reason"
          className="min-h-11 max-w-52 text-xs"
          placeholder={canRefund ? t('paymentRefundReason') : t('paymentVoidNote')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      {message ? (
        <p className="text-muted-foreground max-w-52 text-right text-xs">{message}</p>
      ) : null}
      <Dialog open={confirmation !== null} onOpenChange={(open) => !open && setConfirmation(null)}>
        <DialogContent closeLabel={t('paymentCloseDialog')}>
          <DialogHeader>
            <DialogTitle>
              {confirmation === 'void' ? t('paymentConfirmVoid') : t('paymentConfirmRefund')}
            </DialogTitle>
            <DialogDescription>
              {confirmation === 'void'
                ? t('paymentConfirmVoidDescription', { invoice: invoiceId, amount })
                : t('paymentConfirmRefundDescription', {
                    invoice: invoiceId,
                    amount: formatMoney(refundAmount, currency, locale),
                    remaining,
                  })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button className="min-h-11" variant="outline">
                {t('paymentCancel')}
              </Button>
            </DialogClose>
            <Button
              className="min-h-11"
              disabled={pending}
              onClick={() => confirmation && run(confirmation)}
            >
              {confirmation === 'void' ? t('paymentVoid') : t('paymentRefund')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
