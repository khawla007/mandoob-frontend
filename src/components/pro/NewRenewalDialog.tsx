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
import { RENEWAL_TYPES, type RenewalTypeInput } from '@/lib/validation/renewal';
import { toMinorUnits } from './renewal-stage-rules';

type ManualType = RenewalTypeInput;
export type EmployeeOption = { id: string; name: string };

export function NewRenewalDialog({
  slug,
  triggerLabel,
  employees = [],
}: {
  slug: string;
  triggerLabel?: string;
  employees?: EmployeeOption[];
}) {
  const router = useRouter();
  const t = useTranslations('pro');
  const p = useTranslations('p308.renewals');
  const errors = useTranslations('p308.errors');
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [employeeId, setEmployeeId] = useState('');
  const [government, setGovernment] = useState('');
  const [service, setService] = useState('');
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<ManualType>('visa');
  const [label, setLabel] = useState('');
  const [dueDate, setDueDate] = useState('');

  function reset() {
    setType('visa');
    setLabel('');
    setDueDate('');
    setEmployeeId('');
    setGovernment('');
    setService('');
    setError(null);
    setOperationId(crypto.randomUUID());
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const governmentFee = toMinorUnits(government);
    const serviceFee = toMinorUnits(service);
    if (governmentFee === null || serviceFee === null) {
      setError(errors('VALIDATION_FAILED'));
      return;
    }
    startTransition(async () => {
      const result = await createRenewalAction(slug, {
        operation_id: operationId,
        type,
        label,
        due_date: dueDate,
        ...(employeeId ? { employee_id: employeeId } : {}),
        government_fee_minor: governmentFee,
        pro_service_fee_minor: serviceFee,
        currency: 'AED',
      });
      if (!result.ok) {
        setError(errors.has(result.code) ? errors(result.code) : t('renewalActionFailed'));
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
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>{triggerLabel ?? t('newRenewal')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newRenewal')}</DialogTitle>
          <DialogDescription>{t('newRenewalIntro')}</DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{t('couldNotCreateRenewal')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="new-type">{t('type')}</Label>
            <Select value={type} onValueChange={(v) => setType(v as ManualType)}>
              <SelectTrigger id="new-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RENEWAL_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {p(`types.${value}`)}
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
              placeholder={t('renewalLabelPlaceholder')}
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

          <div className="grid gap-2">
            <Label htmlFor="new-employee">{p('employee')}</Label>
            <select
              id="new-employee"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">{p('companyLevel')}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="new-gov">{p('governmentFee')}</Label>
              <Input
                id="new-gov"
                inputMode="decimal"
                placeholder="0.00"
                value={government}
                onChange={(e) => setGovernment(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="new-service">{p('serviceFee')}</Label>
              <Input
                id="new-service"
                inputMode="decimal"
                placeholder="0.00"
                value={service}
                onChange={(e) => setService(e.target.value)}
              />
            </div>
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
