'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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

export function NewInvoiceDialog({
  slug,
  triggerLabel = 'New invoice',
}: {
  slug: string;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [dueAt, setDueAt] = useState('');

  function reset() {
    setLabel('');
    setAmount('');
    setDueAt('');
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createInvoiceAction(slug, { label, amount, dueAt });
      if (!result.ok) {
        setError(`${result.code}: ${result.error}`);
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
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
        <Button>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>
            Issue an AED invoice and notify the linked customer.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Could not create invoice</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="invoice-label">Label</Label>
            <Input
              id="invoice-label"
              required
              maxLength={160}
              placeholder="Trade license renewal"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="invoice-amount">Amount AED</Label>
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
            <Label htmlFor="invoice-due">Due date</Label>
            <Input
              id="invoice-due"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? 'Issuing…' : 'Issue invoice'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
