'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  claimFormSubmission,
  releaseFormSubmission,
} from '@/components/admin/form-submission-guard';
import type { ProCredentialSnapshot } from '@/lib/data/pro-credentials';
import {
  formatProEvidenceCreatedDate,
  formatProEvidenceMime,
  formatProEvidenceRemovalConfirmation,
} from '@/components/account/pro-credential-self-view';
import { useUnsavedChangesGuard } from '@/components/account/use-unsaved-changes-guard';

type Evidence = ProCredentialSnapshot['evidence'][number];
const CLIENT_FILE_MAX_BYTES = 10 * 1024 * 1024;
const evidenceFileSchema = z.object({
  file: z
    .custom<File>((value) => typeof File !== 'undefined' && value instanceof File)
    .refine((file) => file.size <= CLIENT_FILE_MAX_BYTES),
});
type EvidenceFileInput = z.input<typeof evidenceFileSchema>;

function csrfHeader(): Headers {
  const headers = new Headers();
  const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith('mandoob-csrf='));
  if (entry) headers.set('x-mandoob-csrf', decodeURIComponent(entry.split('=')[1] ?? ''));
  return headers;
}

export function ProCredentialEvidenceForm({
  credentialId,
  version,
  evidence,
  locale,
}: {
  credentialId: string;
  version: number;
  evidence: Evidence[];
  locale: string;
}) {
  const t = useTranslations('account.proCredential');
  const router = useRouter();
  const latch = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const uploadOperation = useRef(crypto.randomUUID());
  const removalOperations = useRef(new Map<string, string>());
  const [currentVersion, setCurrentVersion] = useState(version);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmingEvidenceId, setConfirmingEvidenceId] = useState<string | null>(null);
  const formState = useForm<EvidenceFileInput>({
    resolver: zodResolver(evidenceFileSchema),
  });
  const file = useWatch({ control: formState.control, name: 'file' });

  useUnsavedChangesGuard(Boolean(file), t('leaveWarning'));

  async function run(request: () => Promise<Response>, onSuccess?: () => void) {
    if (!claimFormSubmission(latch)) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await request();
      const payload = (await response.json().catch(() => null)) as {
        code?: string;
        credential?: { version?: unknown };
      } | null;
      if (!response.ok) {
        setError(
          payload?.code === 'STALE_CREDENTIAL_VERSION'
            ? t('stale')
            : payload?.code === 'OPERATION_REUSED'
              ? t('replayConflict')
              : payload?.code === 'EVIDENCE_REMOVAL_IN_PROGRESS' ||
                  payload?.code === 'CREDENTIAL_IN_PROGRESS'
                ? t('conflict')
                : t('evidenceFailed'),
        );
        queueMicrotask(() => errorSummaryRef.current?.focus());
        return;
      }
      formState.reset();
      if (typeof payload?.credential?.version === 'number') {
        setCurrentVersion(payload.credential.version);
      }
      if (inputRef.current) inputRef.current.value = '';
      onSuccess?.();
      setConfirmingEvidenceId(null);
      setSuccess(t('evidenceSaved'));
      router.refresh();
    } catch {
      setError(t('evidenceFailed'));
      queueMicrotask(() => errorSummaryRef.current?.focus());
    } finally {
      setPending(false);
      releaseFormSubmission(latch);
    }
  }

  function uploadFile(fileToUpload: File) {
    const form = new FormData();
    form.set('credentialId', credentialId);
    form.set('expectedVersion', String(currentVersion));
    form.set('operationId', uploadOperation.current);
    form.set('file', fileToUpload);
    void run(
      () =>
        fetch('/api/v1/account/pro/credentials/evidence', {
          method: 'POST',
          headers: csrfHeader(),
          body: form,
        }),
      () => {
        uploadOperation.current = crypto.randomUUID();
      },
    );
  }

  function upload(event: React.FormEvent<HTMLFormElement>) {
    void formState.handleSubmit(
      (values) => uploadFile(values.file),
      () => {
        queueMicrotask(() => inputRef.current?.focus());
      },
    )(event);
  }

  function removeEvidence(item: Evidence) {
    const operationId = removalOperations.current.get(item.evidenceId) ?? crypto.randomUUID();
    removalOperations.current.set(item.evidenceId, operationId);
    void run(
      () =>
        fetch(`/api/v1/account/pro/credentials/evidence/${item.evidenceId}`, {
          method: 'DELETE',
          headers: new Headers({
            ...Object.fromEntries(csrfHeader()),
            'content-type': 'application/json',
          }),
          body: JSON.stringify({
            credentialId,
            expectedVersion: currentVersion,
            operationId,
          }),
        }),
      () => removalOperations.current.delete(item.evidenceId),
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div
          ref={errorSummaryRef}
          tabIndex={-1}
          role="alert"
          className="border-destructive/40 bg-destructive/5 rounded-lg border p-3 text-sm"
        >
          {error}
        </div>
      ) : null}
      <ul className="divide-border divide-y" aria-label={t('evidenceList')}>
        {evidence.map((evidence) => (
          <li
            key={evidence.evidenceId}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <a
                className="text-primary focus-visible:ring-ring inline-flex min-h-11 max-w-full items-center truncate rounded-md underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                href={`/api/v1/account/pro/credentials/evidence/${evidence.evidenceId}`}
                target="_blank"
                rel="noreferrer"
              >
                {evidence.originalNameSafe}
              </a>
              <p className="text-muted-foreground text-xs">
                {formatProEvidenceMime(evidence.mimeType, (key) => t(key))} ·{' '}
                {new Intl.NumberFormat(locale === 'ar' ? 'ar-AE' : 'en-AE').format(
                  evidence.sizeBytes,
                )}{' '}
                {t('bytes')}
              </p>
              <p dir="ltr" className="text-muted-foreground text-xs">
                {t('createdDate')} {formatProEvidenceCreatedDate(evidence.createdAt, locale)}
              </p>
            </div>
            {confirmingEvidenceId === evidence.evidenceId ? (
              <div
                role="group"
                aria-label={formatProEvidenceRemovalConfirmation(evidence.originalNameSafe, t)}
                className="basis-full space-y-2 sm:basis-auto"
              >
                <p className="text-sm">
                  {formatProEvidenceRemovalConfirmation(evidence.originalNameSafe, t)}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => removeEvidence(evidence)}
                    className="min-h-11"
                  >
                    {pending ? t('pending') : t('confirmRemove')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => setConfirmingEvidenceId(null)}
                    className="min-h-11"
                  >
                    {t('cancelRemove')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setConfirmingEvidenceId(evidence.evidenceId)}
                className="min-h-11"
              >
                {t('removeEvidence')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={upload} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor={`credential-evidence-${credentialId}`}>{t('evidenceLabel')}</Label>
          <Input
            ref={inputRef}
            id={`credential-evidence-${credentialId}`}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            aria-describedby={`credential-evidence-help-${credentialId}${formState.formState.errors.file ? ` credential-evidence-error-summary-${credentialId}` : ''}`}
            aria-invalid={Boolean(formState.formState.errors.file)}
            className="min-h-11"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) {
                formState.setValue('file', selected, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              } else {
                formState.resetField('file');
              }
              uploadOperation.current = crypto.randomUUID();
            }}
          />
          <p
            id={`credential-evidence-help-${credentialId}`}
            className="text-muted-foreground text-xs"
          >
            {t('evidenceHelp')}
          </p>
          {formState.formState.errors.file ? (
            <div
              ref={errorSummaryRef}
              id={`credential-evidence-error-summary-${credentialId}`}
              tabIndex={-1}
              role="alert"
              className="text-destructive text-sm"
            >
              <a className="underline" href={`#credential-evidence-${credentialId}`}>
                {file ? t('fileTooLarge') : t('fileRequired')}
              </a>
            </div>
          ) : null}
        </div>
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending ? t('pending') : t('uploadEvidence')}
        </Button>
      </form>
      <p aria-live="polite" className="text-muted-foreground text-sm">
        {success}
      </p>
    </div>
  );
}
