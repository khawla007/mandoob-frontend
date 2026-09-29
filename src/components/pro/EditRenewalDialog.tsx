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
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { updateRenewalAction } from '@/app/(tenant)/t/[tenant]/(pro)/renewals/actions';
import type { RenewalWorkspaceRow } from '@/lib/data/pro-renewal-workspace';
import { BLOCKER_CODES, fromMinorUnits, toMinorUnits } from './renewal-stage-rules';

export function EditRenewalDialog({
  slug,
  row,
  open,
  onOpenChange,
}: {
  slug: string;
  row: RenewalWorkspaceRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <EditRenewalForm
            key={`${row.id}:${row.version}`}
            slug={slug}
            row={row}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditRenewalForm({
  slug,
  row,
  onClose,
}: {
  slug: string;
  row: RenewalWorkspaceRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const t = useTranslations('pro');
  const p = useTranslations('p308.renewals');
  const errors = useTranslations('p308.errors');
  const common = useTranslations('common');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [operationId] = useState(() => crypto.randomUUID());
  const [label, setLabel] = useState(row.label);
  const [dueDate, setDueDate] = useState(row.dueDate ?? '');
  const [government, setGovernment] = useState(fromMinorUnits(row.costs.governmentFeeMinor));
  const [service, setService] = useState(fromMinorUnits(row.costs.proServiceFeeMinor));
  const [fine, setFine] = useState(fromMinorUnits(row.costs.fineMinor));
  const [blocker, setBlocker] = useState(row.blockerCode ?? '');
  const dueLocked = row.source !== 'manual';

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const costs = {
      government_fee_minor: toMinorUnits(government),
      pro_service_fee_minor: toMinorUnits(service),
      fine_minor: toMinorUnits(fine),
    };
    if (Object.values(costs).some((value) => value === null)) {
      setError(errors('VALIDATION_FAILED'));
      return;
    }
    const changedCosts = Object.fromEntries(
      Object.entries(costs).filter(([key, value]) => {
        const current = {
          government_fee_minor: row.costs.governmentFeeMinor,
          pro_service_fee_minor: row.costs.proServiceFeeMinor,
          fine_minor: row.costs.fineMinor,
        }[key];
        return value !== current;
      }),
    );
    const patch: Record<string, unknown> = {};
    if (label !== row.label) patch.label = label;
    if (!dueLocked && dueDate !== row.dueDate) patch.due_date = dueDate;
    if (Object.keys(changedCosts).length > 0) patch.costs = changedCosts;
    if (blocker !== (row.blockerCode ?? '')) patch.blocker_code = blocker === '' ? null : blocker;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    startTransition(async () => {
      const result = await updateRenewalAction(slug, row.id, {
        operation_id: operationId,
        expected_version: row.version,
        ...patch,
      });
      if (!result.ok) {
        setError(errors.has(result.code) ? errors(result.code) : errors('INTERNAL'));
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('renewalEdit')}</DialogTitle>
        <DialogDescription>
          {dueLocked ? t('renewalEditAutoDescription') : t('renewalEditDescription')}
        </DialogDescription>
      </DialogHeader>

      <form className="space-y-4" onSubmit={onSubmit}>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t('renewalActionFailed')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-2">
          <Label htmlFor="edit-label">{t('renewalLabel')}</Label>
          <Input
            id="edit-label"
            required
            minLength={1}
            maxLength={140}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="edit-due">{t('renewalDue')}</Label>
          <Input
            id="edit-due"
            type="date"
            required
            disabled={dueLocked}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          {dueLocked ? (
            <p className="text-muted-foreground text-xs">{t('renewalAutoLockedHint')}</p>
          ) : null}
        </div>
        <fieldset className="grid gap-2 sm:grid-cols-3">
          <legend className="mb-1 text-sm font-medium">
            {p('costs', { currency: row.costs.currency })}
          </legend>
          <MoneyInput
            id="edit-gov"
            label={p('governmentFee')}
            value={government}
            onChange={setGovernment}
          />
          <MoneyInput
            id="edit-service"
            label={p('serviceFee')}
            value={service}
            onChange={setService}
          />
          <MoneyInput id="edit-fine" label={p('fine')} value={fine} onChange={setFine} />
        </fieldset>
        <div className="grid gap-2">
          <Label htmlFor="edit-blocker">{p('blocker')}</Label>
          <select
            id="edit-blocker"
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            value={blocker}
            onChange={(e) => setBlocker(e.target.value)}
          >
            <option value="">{p('noBlocker')}</option>
            {BLOCKER_CODES.map((code) => (
              <option key={code} value={code}>
                {p(`blockers.${code}`)}
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {common('cancel')}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? common('saving') : common('save')}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function MoneyInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
