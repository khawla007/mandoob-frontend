'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createRenewalAction } from '@/app/(tenant)/t/[tenant]/(pro)/renewals/actions';

type ManualType = 'visa' | 'eid' | 'ejari';

const TYPE_OPTIONS: { value: ManualType; labelKey: 'visa' | 'emiratesId' | 'ejari' }[] = [
  { value: 'visa', labelKey: 'visa' },
  { value: 'eid', labelKey: 'emiratesId' },
  { value: 'ejari', labelKey: 'ejari' },
];

export type NewRenewalClientOption = { id: string; company_name: string };

export function NewRenewalDialog({
  slug,
  clients,
  fixedClientId,
  triggerLabel,
}: {
  slug: string;
  clients: NewRenewalClientOption[];
  fixedClientId?: string;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const t = useTranslations('pro');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState<string>(fixedClientId ?? clients[0]?.id ?? '');
  const [type, setType] = useState<ManualType>('visa');
  const [label, setLabel] = useState('');
  const [dueDate, setDueDate] = useState('');

  function reset() {
    setClientId(fixedClientId ?? clients[0]?.id ?? '');
    setType('visa');
    setLabel('');
    setDueDate('');
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clientId) {
      setError('INVALID_INPUT: select a client');
      return;
    }
    startTransition(async () => {
      const result = await createRenewalAction(slug, {
        client_id: clientId,
        type,
        label,
        due_date: dueDate,
      });
      if (!result.ok) {
        setError(`${result.code}: ${result.error}`);
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  const noClients = clients.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={noClients}>{triggerLabel ?? t('newRenewal')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newRenewal')}</DialogTitle>
          <DialogDescription>
            License renewals are created automatically from a client&apos;s license_expiry. Use this
            form for visas, Emirates IDs, and Ejari.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{t('couldNotCreateRenewal')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="new-client">{t('client')}</Label>
            <Select value={clientId} onValueChange={setClientId} disabled={Boolean(fixedClientId)}>
              <SelectTrigger id="new-client">
                <SelectValue placeholder={t('selectClient')} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="new-type">{t('type')}</Label>
            <Select value={type} onValueChange={(v) => setType(v as ManualType)}>
              <SelectTrigger id="new-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="new-label">{t('label')}</Label>
            <Input
              id="new-label"
              required
              minLength={1}
              maxLength={140}
              placeholder="e.g. Investor visa — Mr. Khan"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="new-due">{t('dueDate')}</Label>
            <Input
              id="new-due"
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? t('creating') : t('createRenewal')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
