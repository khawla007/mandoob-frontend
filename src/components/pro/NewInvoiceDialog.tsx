'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createInvoiceAction } from '@/app/(tenant)/t/[tenant]/(pro)/payments/actions';
import type { InvoiceCustomerOption } from '@/lib/data/invoice-customer-options';

export function NewInvoiceDialog({
  slug,
  customers,
  triggerLabel,
}: {
  slug: string;
  customers: InvoiceCustomerOption[];
  triggerLabel?: string;
}) {
  const t = useTranslations('pro');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [customerProfileId, setCustomerProfileId] = useState('');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [dueAt, setDueAt] = useState('');

  function reset() {
    setCustomerProfileId('');
    setLabel('');
    setAmount('');
    setDueAt('');
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const amountMatch = amount.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/u);
      if (!amountMatch || !customerProfileId) {
        setError(t('invoiceCreateErrorDescription'));
        return;
      }
      const amountMinor =
        Number(amountMatch[1]) * 100 + Number((amountMatch[2] ?? '').padEnd(2, '0'));
      const result = await createInvoiceAction(slug, {
        operationId: crypto.randomUUID(),
        customerProfileId,
        label,
        dueDate: dueAt || null,
        lines: [
          {
            description: label,
            quantity: 1,
            unitAmountMinor: amountMinor,
            discountMinor: 0,
            taxCategory: 'standard',
            taxBasis: 'inclusive',
            vatBasisPoints: 500,
            currency: 'AED',
          },
        ],
      });
      if (!result.ok) {
        setError(t('invoiceCreateErrorDescription'));
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (customers.length === 0) {
    return <Button disabled>{triggerLabel ?? t('invoiceNew')}</Button>;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>{triggerLabel ?? t('invoiceNew')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('invoiceNew')}</DialogTitle>
          <DialogDescription>{t('invoiceCreateDescription')}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{t('invoiceCreateErrorTitle')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="invoice-customer">{t('invoiceCustomer')}</Label>
            <select
              id="invoice-customer"
              required
              value={customerProfileId}
              onChange={(event) => setCustomerProfileId(event.target.value)}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{t('invoiceCustomerPlaceholder')}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="invoice-label">{t('invoiceLabel')}</Label>
            <Input
              id="invoice-label"
              required
              maxLength={160}
              placeholder={t('invoiceLabelPlaceholder')}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="invoice-amount">{t('invoiceAmountAed')}</Label>
            <Input
              id="invoice-amount"
              required
              inputMode="decimal"
              placeholder="1250.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="invoice-due">{t('invoiceDueDate')}</Label>
            <Input
              id="invoice-due"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? t('invoiceIssuing') : t('invoiceIssue')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
