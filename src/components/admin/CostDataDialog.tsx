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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createCostDataAction, updateCostDataAction } from '@/app/admin/cost-data/actions';
import type { CostDataRow } from '@/lib/data/cost-data';
import {
  COST_DATA_FEE_TYPES,
  COST_DATA_JURISDICTIONS,
  COST_DATA_RECURRENCES,
  formatMinorAsAed,
} from '@/lib/validation/cost-data';

export function CostDataDialog({ mode, row }: { mode: 'create' | 'edit'; row?: CostDataRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    const payload = Object.fromEntries(formData.entries());
    startTransition(async () => {
      const result =
        mode === 'edit' && row
          ? await updateCostDataAction({ ...payload, id: row.id })
          : await createCostDataAction(payload);
      if (!result.ok) {
        setError(`${result.code}: ${result.error}`);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={mode === 'edit' ? 'sm' : 'default'} variant={mode === 'edit' ? 'outline' : 'default'}>
          {mode === 'edit' ? 'Edit' : 'New row'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit cost row' : 'New cost row'}</DialogTitle>
          <DialogDescription>Rows with active + estimate-grade feed the public estimator.</DialogDescription>
        </DialogHeader>
        <form action={onSubmit} className="grid gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not save row</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Authority" name="authority" defaultValue={row?.authority} required />
            <SelectField label="Jurisdiction" name="jurisdiction" defaultValue={row?.jurisdiction ?? 'free_zone'} options={COST_DATA_JURISDICTIONS} />
            <Field label="Emirate" name="emirate" defaultValue={row?.emirate ?? ''} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <SelectField label="Fee type" name="feeType" defaultValue={row?.feeType ?? 'license'} options={COST_DATA_FEE_TYPES} />
            <SelectField label="Recurrence" name="recurrence" defaultValue={row?.recurrence ?? 'one_time'} options={COST_DATA_RECURRENCES} />
            <Field label="Activity key" name="activityKey" defaultValue={row?.activityKey ?? ''} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Label" name="label" defaultValue={row?.label} required />
            <Field label="Amount AED" name="amount" defaultValue={row ? formatMinorAsAed(row.amountMinor) : ''} required inputMode="decimal" />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Min shareholders" name="minShareholders" defaultValue={row?.minShareholders ?? 1} type="number" />
            <Field label="Max shareholders" name="maxShareholders" defaultValue={row?.maxShareholders ?? 50} type="number" />
            <Field label="Min visas" name="minVisas" defaultValue={row?.minVisas ?? 0} type="number" />
            <Field label="Max visas" name="maxVisas" defaultValue={row?.maxVisas ?? 200} type="number" />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Timeline min" name="timelineMinDays" defaultValue={row?.timelineMinDays ?? 0} type="number" />
            <Field label="Timeline max" name="timelineMaxDays" defaultValue={row?.timelineMaxDays ?? 0} type="number" />
            <Field label="Valid from" name="validFrom" defaultValue={row?.validFrom ?? new Date().toISOString().slice(0, 10)} type="date" />
            <Field label="Valid to" name="validTo" defaultValue={row?.validTo ?? ''} type="date" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="requiredDocumentKeys">Required document keys</Label>
            <Textarea
              id="requiredDocumentKeys"
              name="requiredDocumentKeys"
              defaultValue={row?.requiredDocumentKeys.join(', ') ?? ''}
              placeholder="passport, trade_name_reservation"
            />
          </div>
          <input type="hidden" name="currency" value="AED" />
          <input type="hidden" name="estimateGrade" value="true" />
          <input type="hidden" name="active" value={String(row?.active ?? true)} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving...' : 'Save row'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  required,
  inputMode,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} defaultValue={defaultValue} inputMode={inputMode} />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: readonly string[];
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Select name={name} defaultValue={defaultValue}>
        <SelectTrigger id={name}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
