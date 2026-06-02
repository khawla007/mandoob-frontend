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
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { postJson } from '@/lib/http/post';

export function ResetMfaButton({ userId, mfaEnrolled }: { userId: string; mfaEnrolled: boolean }) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removed, setRemoved] = useState<number | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    const body = reason.trim().length ? { reason: reason.trim() } : {};
    const res = await postJson(`/api/v1/admin/users/${userId}/mfa-reset`, body);
    setSubmitting(false);
    if (res.ok) {
      const payload = (await res.json()) as { factors_removed: number };
      setRemoved(payload.factors_removed);
      setOpen(false);
      router.refresh();
      return;
    }
    let payload: { error?: string } = {};
    try {
      payload = await res.json();
    } catch {
      // ignore
    }
    setError(payload.error ?? t('user.requestFailed', { status: res.status }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!mfaEnrolled}>
          {mfaEnrolled ? t('user.mfaReset.trigger') : t('user.mfaReset.notEnrolled')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('user.mfaReset.title')}</DialogTitle>
          <DialogDescription>{t('user.mfaReset.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{t('user.mfaReset.errorTitle')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {removed !== null && (
            <Alert>
              <AlertTitle>{t('user.mfaReset.successTitle')}</AlertTitle>
              <AlertDescription>
                {t('user.mfaReset.successDescription', { count: removed })}
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>{t('user.fields.reason')}</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('user.cancel')}
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? t('user.mfaReset.resetting') : t('user.mfaReset.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
