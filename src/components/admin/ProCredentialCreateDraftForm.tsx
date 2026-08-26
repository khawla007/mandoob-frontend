'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { postJson } from '@/lib/http/post';
import { claimFormSubmission, releaseFormSubmission } from './form-submission-guard';

export function ProCredentialCreateDraftForm({ userId }: { userId: string }) {
  const t = useTranslations('admin.user.proLifecycle.credential');
  const router = useRouter();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const latch = useRef(false);
  const operationIdRef = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!claimFormSubmission(latch)) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      operationIdRef.current ??= crypto.randomUUID();
      const response = await postJson(`/api/v1/admin/users/${userId}/credentials`, {
        command: 'create',
        operationId: operationIdRef.current,
      });
      if (!response.ok) throw new Error('create failed');
      operationIdRef.current = null;
      setSuccess(t('createDraftSuccess'));
      router.refresh();
    } catch {
      setError(t('createDraftError'));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setPending(false);
      releaseFormSubmission(latch);
    }
  }

  return (
    <form onSubmit={submit} aria-busy={pending} className="space-y-3">
      <p className="text-muted-foreground text-sm">{t('empty')}</p>
      <Button type="submit" disabled={pending} className="min-h-11">
        {pending ? t('creatingDraft') : t('createDraft')}
      </Button>
      {error ? (
        <p ref={errorRef} role="alert" tabIndex={-1} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" aria-live="polite" className="text-sm text-[color:var(--signal-success)]">
          {success}
        </p>
      ) : null}
    </form>
  );
}
