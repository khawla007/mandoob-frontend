'use client';

import { useEffect, useRef, useState } from 'react';
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
  const uploadOperation = useRef(crypto.randomUUID());
  const removalOperations = useRef(new Map<string, string>());
  const [currentVersion, setCurrentVersion] = useState(version);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const formState = useForm<EvidenceFileInput>({
    resolver: zodResolver(evidenceFileSchema),
  });
  const file = useWatch({ control: formState.control, name: 'file' });

  useEffect(() => {
    if (!file) return;
    const beforeunload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = t('leaveWarning');
    };
    window.addEventListener('beforeunload', beforeunload);
    return () => window.removeEventListener('beforeunload', beforeunload);
  }, [file, t]);

  async function run(request: () => Promise<Response>, onSuccess?: () => void) {
    if (!claimFormSubmission(latch)) return;
    setPending(true);
    setFeedback(null);
    try {
      const response = await request();
      const payload = (await response.json().catch(() => null)) as {
        code?: string;
        credential?: { version?: unknown };
      } | null;
      if (!response.ok) {
        setFeedback(
          payload?.code === 'STALE_CREDENTIAL_VERSION'
            ? t('stale')
            : payload?.code === 'OPERATION_REUSED'
              ? t('replayConflict')
              : t('evidenceFailed'),
        );
        return;
      }
      formState.reset();
      if (typeof payload?.credential?.version === 'number') {
        setCurrentVersion(payload.credential.version);
      }
      if (inputRef.current) inputRef.current.value = '';
      onSuccess?.();
      setFeedback(t('evidenceSaved'));
      router.refresh();
    } catch {
      setFeedback(t('evidenceFailed'));
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
      (errors) => {
        setFeedback(errors.file?.type === 'custom' && file ? t('fileTooLarge') : t('fileRequired'));
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
      <ul className="divide-border divide-y" aria-label={t('evidenceList')}>
        {evidence.map((evidence) => (
          <li
            key={evidence.evidenceId}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <a
                className="text-primary block truncate underline-offset-4 hover:underline"
                href={`/api/v1/account/pro/credentials/evidence/${evidence.evidenceId}`}
                target="_blank"
                rel="noreferrer"
              >
                {evidence.originalNameSafe}
              </a>
              <p className="text-muted-foreground text-xs">
                {evidence.mimeType} ·{' '}
                {new Intl.NumberFormat(locale === 'ar' ? 'ar-AE' : 'en-AE').format(
                  evidence.sizeBytes,
                )}{' '}
                {t('bytes')}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => removeEvidence(evidence)}
            >
              {t('removeEvidence')}
            </Button>
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
            aria-describedby={`credential-evidence-help-${credentialId}`}
            aria-invalid={Boolean(formState.formState.errors.file)}
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
            <p role="alert" className="text-destructive text-sm">
              {file ? t('fileTooLarge') : t('fileRequired')}
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? t('pending') : t('uploadEvidence')}
        </Button>
      </form>
      <p aria-live="polite" className="text-muted-foreground text-sm">
        {feedback}
      </p>
    </div>
  );
}
