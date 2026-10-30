'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
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
  finalizeInvoiceAction,
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
  version,
  paymentId,
  amountMinor,
  outstandingMinor,
  currency,
  remainingRefundableMinor,
  status,
  refundOperation,
  refundDetailsLoaded = false,
  bankEvidenceSubmissionId,
}: {
  slug: string;
  invoiceId: string;
  version: number;
  paymentId: string | null;
  amountMinor: number;
  outstandingMinor: number;
  currency: string;
  remainingRefundableMinor: number | null;
  status: string;
  refundOperation: RefundOperationState | null;
  refundDetailsLoaded?: boolean;
  bankEvidenceSubmissionId?: string;
}) {
  const t = useTranslations('pro');
  const locale = useLocale();
  const router = useRouter();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [manualAmountMinor, setManualAmountMinor] = useState(String(outstandingMinor));
  const [confirmation, setConfirmation] = useState<'void' | 'refund' | null>(null);
  const refundOperationId = useRef<string | null>(null);
  const bankAllocationOperationId = useRef<string | null>(null);
  const hasPendingRefund = refundOperation?.status === 'pending';

  useEffect(() => {
    refundOperationId.current = syncRefundOperationId(refundOperationId.current, refundOperation);
  }, [refundOperation]);

  useEffect(() => {
    bankAllocationOperationId.current = null;
  }, [bankEvidenceSubmissionId, invoiceId, version]);

  function run(action: 'finalize' | 'paid' | 'void' | 'refund') {
    setMessage(null);
    startTransition(async () => {
      if (action === 'refund') refundOperationId.current ??= crypto.randomUUID();
      if (action === 'paid') bankAllocationOperationId.current ??= crypto.randomUUID();
      const result =
        action === 'finalize'
          ? await finalizeInvoiceAction({
              tenantSlug: slug,
              invoiceId,
              expectedVersion: version,
              operationId: crypto.randomUUID(),
            })
          : action === 'paid'
            ? await markInvoicePaidAction({
                tenantSlug: slug,
                invoiceId,
                expectedVersion: version,
                operationId: bankAllocationOperationId.current!,
                amountMinor: Number(manualAmountMinor),
                method: 'bank_transfer',
                evidenceSubmissionId: bankEvidenceSubmissionId,
              })
            : action === 'void'
              ? await voidInvoiceAction({
                  tenantSlug: slug,
                  invoiceId,
                  expectedVersion: version,
                  operationId: crypto.randomUUID(),
                  reason: reason || t('paymentDefaultVoidReason'),
                })
              : await issueRefundAction({
                  tenantSlug: slug,
                  invoiceId,
                  paymentId: hasPendingRefund ? refundOperation.paymentId : paymentId!,
                  expectedVersion: version,
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
      if (action === 'paid') bankAllocationOperationId.current = null;
      setMessage(
        action === 'refund' && 'status' in result.data && result.data.status === 'pending'
          ? t('paymentRefundPending')
          : t('paymentUpdated'),
      );
      router.refresh();
      setConfirmation(null);
    });
  }

  const canClose = status === 'open';
  const canAllocateBankTransfer = canClose && Boolean(bankEvidenceSubmissionId);
  const canFinalize = status === 'draft';
  const canRefund =
    (hasPendingRefund || paymentId !== null) &&
    (status === 'paid' || status === 'partially_refunded') &&
    canShowRefundAction({
      detailsAvailable: refundDetailsLoaded,
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
        {canFinalize ? (
          <Button
            size="sm"
            className="min-h-11"
            variant="outline"
            disabled={pending}
            onClick={() => run('finalize')}
          >
            {t('paymentFinalizeInvoice')}
          </Button>
        ) : null}
        {canClose && (
          <>
            {canAllocateBankTransfer ? (
              <Button
                size="sm"
                className="min-h-11"
                variant="outline"
                disabled={pending}
                onClick={() => run('paid')}
              >
                {t('paymentMarkPaid')}
              </Button>
            ) : null}
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
      {canClose ? (
        <label
          className="text-muted-foreground text-xs"
          htmlFor={`${formId}-manual-payment-amount`}
        >
          {t('paymentManualAmountMinor')}
          <Input
            id={`${formId}-manual-payment-amount`}
            className="mt-1 min-h-11 max-w-52 text-xs"
            type="number"
            min={1}
            max={outstandingMinor}
            step={1}
            value={manualAmountMinor}
            onChange={(event) => {
              bankAllocationOperationId.current = null;
              setManualAmountMinor(event.target.value);
            }}
          />
        </label>
      ) : null}
      {(canClose || canRefund) && !hasPendingRefund && (
        <label className="text-muted-foreground text-xs" htmlFor={`${formId}-refund-reason`}>
          {canRefund ? t('paymentRefundReason') : t('paymentVoidNote')}
        </label>
      )}
      {(canClose || canRefund) && !hasPendingRefund && (
        <Input
          id={`${formId}-refund-reason`}
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
