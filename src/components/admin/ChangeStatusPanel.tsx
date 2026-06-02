'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { postJson } from '@/lib/http/post';
import type { ProfileStatus } from '@/lib/data/admin-edit-helpers';

type TransitionKey = 'suspend' | 'disable' | 'reactivate' | 'cancelInvite';
type Transition = { value: 'active' | 'suspended' | 'disabled'; labelKey: TransitionKey };

const ALLOWED_TRANSITIONS: Record<ProfileStatus, Transition[]> = {
  active: [
    { value: 'suspended', labelKey: 'suspend' },
    { value: 'disabled', labelKey: 'disable' },
  ],
  suspended: [
    { value: 'active', labelKey: 'reactivate' },
    { value: 'disabled', labelKey: 'disable' },
  ],
  invited: [{ value: 'disabled', labelKey: 'cancelInvite' }],
  disabled: [],
};

export function ChangeStatusPanel({
  userId,
  currentStatus,
}: {
  userId: string;
  currentStatus: ProfileStatus;
}) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<Transition['value'] | ''>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const options = ALLOWED_TRANSITIONS[currentStatus];

  async function submit() {
    if (!newStatus) {
      setError(t('user.statusChange.errPickStatus'));
      return;
    }
    if (newStatus === 'suspended' && reason.trim().length === 0) {
      setError(t('user.statusChange.errReasonRequired'));
      return;
    }
    setError(null);
    setSubmitting(true);
    const body =
      newStatus === 'suspended'
        ? { newStatus, reason: reason.trim() }
        : newStatus === 'disabled' && reason.trim().length
          ? { newStatus, reason: reason.trim() }
          : { newStatus };
    const res = await postJson(`/api/v1/admin/users/${userId}/status`, body);
    setSubmitting(false);
    if (res.ok) {
      setOpen(false);
      setNewStatus('');
      setReason('');
      router.refresh();
      return;
    }
    let payload: { error?: string; code?: string } = {};
    try {
      payload = await res.json();
    } catch {
      // ignore
    }
    setError(payload.error ?? t('user.requestFailed', { status: res.status }));
  }

  if (options.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">
        {t('user.statusChange.noChanges', { status: t(`enums.status.${currentStatus}`) })}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t('user.statusChange.trigger')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('user.statusChange.title')}</DialogTitle>
          <DialogDescription>
            {t('user.statusChange.description', { status: t(`enums.status.${currentStatus}`) })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{t('user.statusChange.errorTitle')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>{t('user.statusChange.targetStatusLabel')}</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as never)}>
              <SelectTrigger>
                <SelectValue placeholder={t('user.statusChange.targetStatusPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(`user.statusChange.transitions.${o.labelKey}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(newStatus === 'suspended' || newStatus === 'disabled') && (
            <div className="space-y-2">
              <Label>
                {newStatus === 'suspended'
                  ? t('user.statusChange.reasonRequired')
                  : t('user.statusChange.reasonOptional')}
              </Label>
              <Textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('user.cancel')}
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? t('user.saving') : t('user.statusChange.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
