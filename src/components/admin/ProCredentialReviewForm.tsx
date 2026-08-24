'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { postJson } from '@/lib/http/post';
import type { ProCredentialState } from '@/lib/pro-lifecycle/contracts';
import {
  claimFormSubmission,
  releaseFormSubmission,
} from '@/components/admin/form-submission-guard';

type ReviewCommand = 'begin_review' | 'verify' | 'reject' | 'revoke';
const OPERATOR_REVIEW_REASON_CODE = 'OPERATOR_REVIEW';

export const LEGAL_CREDENTIAL_COMMANDS: Record<ProCredentialState, ReviewCommand[]> = {
  draft: [],
  submitted: ['begin_review'],
  under_review: ['verify', 'reject'],
  verified: ['revoke'],
  rejected: [],
  expired: [],
  revoked: [],
};

export function ProCredentialReviewForm({
  userId,
  credentialId,
  state,
  version,
}: {
  userId: string;
  credentialId: string;
  state: ProCredentialState;
  version: number;
}) {
  const t = useTranslations('admin.user.proLifecycle.review');
  const router = useRouter();
  const commands = LEGAL_CREDENTIAL_COMMANDS[state];
  const [command, setCommand] = useState<ReviewCommand | ''>(commands[0] ?? '');
  const [reason, setReason] = useState('');
  const [revokeConfirmation, setRevokeConfirmation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const latch = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);

  if (commands.length === 0) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!claimFormSubmission(latch)) return;
    setError(null);
    setSaved(null);
    if (!command) {
      setError(t('commandRequired'));
      releaseFormSubmission(latch);
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }
    if ((command === 'reject' || command === 'revoke') && reason.trim().length < 3) {
      setError(t('reasonRequired'));
      releaseFormSubmission(latch);
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }
    if (command === 'revoke' && !revokeConfirmation) {
      setError(t('revokeRequired'));
      releaseFormSubmission(latch);
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }
    setPending(true);
    try {
      const response = await postJson(`/api/v1/admin/users/${userId}/credentials`, {
        command,
        credentialId,
        expectedVersion: version,
        operationId: crypto.randomUUID(),
        ...(command === 'reject' || command === 'revoke'
          ? { reasonCode: OPERATOR_REVIEW_REASON_CODE, reason: reason.trim() }
          : {}),
      });
      if (!response.ok) {
        let code = '';
        try {
          code = String(((await response.json()) as { code?: string }).code ?? '');
        } catch {
          // The localized generic message remains safe when the response is not JSON.
        }
        setError(
          code.startsWith('STALE_')
            ? t('stale')
            : code === 'CREDENTIAL_IN_PROGRESS' || code === 'OPERATION_REUSED'
              ? t('conflict')
              : t('failed'),
        );
        queueMicrotask(() => errorRef.current?.focus());
        return;
      }
      setSaved(t('saved'));
      router.refresh();
    } catch {
      setError(t('failed'));
      queueMicrotask(() => errorRef.current?.focus());
    } finally {
      setPending(false);
      releaseFormSubmission(latch);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? (
        <Alert ref={errorRef} tabIndex={-1} variant="destructive">
          <AlertTitle>{t('errorTitle')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={pending} className="space-y-4">
        <legend className="text-sm font-medium">{t('legend')}</legend>
        <div className="space-y-2">
          <Label htmlFor={`credential-command-${credentialId}`}>{t('commandLabel')}</Label>
          <select
            id={`credential-command-${credentialId}`}
            value={command}
            onChange={(event) => setCommand(event.target.value as ReviewCommand)}
            className="border-input bg-background min-h-11 w-full rounded-lg border px-3 text-sm"
          >
            {commands.map((item) => (
              <option key={item} value={item}>
                {t(`commands.${item}`)}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">{t('help')}</p>
        </div>
        {command === 'reject' || command === 'revoke' ? (
          <>
            <div className="space-y-2">
              <Label htmlFor={`reason-${credentialId}`}>{t('reasonLabel')}</Label>
              <Textarea
                id={`reason-${credentialId}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={3}
                maxLength={500}
                aria-describedby={`reason-help-${credentialId}`}
                required
                className="min-h-11"
              />
              <p id={`reason-help-${credentialId}`} className="text-muted-foreground text-xs">
                {t('reasonHelp')}
              </p>
            </div>
          </>
        ) : null}
        {command === 'revoke' ? (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={revokeConfirmation}
              onChange={(event) => setRevokeConfirmation(event.target.checked)}
            />
            {t('revokeConfirmation')}
          </label>
        ) : null}
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending ? t('pending') : t('submit')}
        </Button>
      </fieldset>
      <p aria-live="polite" className="text-muted-foreground text-sm">
        {saved}
      </p>
    </form>
  );
}
