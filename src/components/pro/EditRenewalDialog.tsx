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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateRenewalAction } from '@/app/(tenant)/t/[tenant]/(pro)/renewals/actions';
import type { RenewalStatus } from '@/lib/data/renewals';
import type { RenewalWorkspaceRow } from '@/lib/data/pro-renewal-workspace';

const EDITABLE_STATUSES: RenewalStatus[] = [
  'upcoming',
  'due_soon',
  'overdue',
  'completed',
  'cancelled',
];

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
          <EditRenewalForm key={row.id} slug={slug} row={row} onClose={() => onOpenChange(false)} />
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
  const common = useTranslations('common');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState(row.label);
  const [dueDate, setDueDate] = useState(row.dueDate ?? '');
  const [status, setStatus] = useState<RenewalStatus>(row.status);

  const isLockedAutoCancelled = row.source === 'license_backfill' && row.status === 'cancelled';

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const patch: Record<string, string> = {};
    if (label !== row.label) patch.label = label;
    if (dueDate !== row.dueDate) patch.due_date = dueDate;
    if (status !== row.status) patch.status = status;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    startTransition(async () => {
      const result = await updateRenewalAction(slug, row.id, patch);
      if (!result.ok) {
        setError(t('renewalActionFailed'));
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
          {row.source === 'license_backfill'
            ? t('renewalEditAutoDescription')
            : t('renewalEditDescription')}
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
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-status">{t('renewalStatus')}</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as RenewalStatus)}
            disabled={isLockedAutoCancelled}
          >
            <SelectTrigger id="edit-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EDITABLE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`renewalStatus${statusKeySuffix(s)}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isLockedAutoCancelled && (
            <p className="text-muted-foreground text-xs">{t('renewalAutoLockedHint')}</p>
          )}
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

function statusKeySuffix(status: RenewalStatus) {
  return status === 'due_soon' ? 'DueSoon' : `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}
