'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { postJson } from '@/lib/http/post';
import { proCredentialDraftSaveSchema } from '@/lib/validation/pro-lifecycle';
import { createProCredentialSelfDraftSchema } from '@/components/account/pro-credential-self-view';
import {
  claimFormSubmission,
  releaseFormSubmission,
} from '@/components/admin/form-submission-guard';
import { useUnsavedChangesGuard } from '@/components/account/use-unsaved-changes-guard';

type DraftInput = z.input<typeof proCredentialDraftSaveSchema>;
type DraftOutput = z.output<typeof proCredentialDraftSaveSchema>;
type EditableCredential = {
  credentialId: string;
  issuingAuthority: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  version: number;
};

function responseCode(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as { code?: unknown; error?: { code?: unknown } };
  const code = record.code ?? record.error?.code;
  return typeof code === 'string' ? code : '';
}

export function ProCredentialForm({
  mode,
  credential,
  hasStoredIdentifier = false,
}: {
  mode: 'create' | 'edit' | 'replacement';
  credential: EditableCredential | null;
  hasStoredIdentifier?: boolean;
}) {
  const t = useTranslations('account.proCredential');
  const router = useRouter();
  const latch = useRef(false);
  const commandOperations = useRef({
    create: crypto.randomUUID(),
    replacement: crypto.randomUUID(),
    submit: crypto.randomUUID(),
  });
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(
    null,
  );
  const form = useForm<DraftInput, unknown, DraftOutput>({
    resolver: zodResolver(createProCredentialSelfDraftSchema(hasStoredIdentifier)),
    defaultValues: {
      identifier: '',
      issuingAuthority: credential?.issuingAuthority ?? '',
      issueDate: credential?.issueDate ?? '',
      expiryDate: credential?.expiryDate ?? '',
      expectedVersion: credential?.version ?? 0,
      operationId: crypto.randomUUID(),
    },
  });
  const authoritativeVersion = credential?.version;
  useEffect(() => {
    if (mode !== 'edit' || authoritativeVersion === undefined) return;
    form.setValue('expectedVersion', authoritativeVersion, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [authoritativeVersion, form, mode]);
  useUnsavedChangesGuard(form.formState.isDirty, t('leaveWarning'));

  function focusError(errors: FieldErrors<DraftInput>) {
    const first = Object.keys(errors)[0] as keyof DraftInput | undefined;
    if (first) form.setFocus(first);
    else errorSummaryRef.current?.focus();
  }

  async function perform(body: Record<string, unknown>, onSuccess?: () => void) {
    if (!claimFormSubmission(latch)) return;
    setPending(true);
    setFeedback(null);
    try {
      const response = await postJson('/api/v1/account/pro/credentials', body);
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        const code = responseCode(payload);
        const text =
          code === 'STALE_CREDENTIAL_VERSION'
            ? t('stale')
            : code === 'OPERATION_REUSED'
              ? t('replayConflict')
              : t('failed');
        setFeedback({ kind: 'error', text });
        queueMicrotask(() => errorSummaryRef.current?.focus());
        return;
      }
      const result = payload as { credential?: { version?: unknown } } | null;
      const returnedVersion = result?.credential?.version;
      form.reset({
        ...form.getValues(),
        identifier: '',
        expectedVersion:
          typeof returnedVersion === 'number' ? returnedVersion : form.getValues('expectedVersion'),
        operationId: crypto.randomUUID(),
      });
      onSuccess?.();
      setFeedback({ kind: 'success', text: t('saved') });
      router.refresh();
    } catch {
      setFeedback({ kind: 'error', text: t('failed') });
      queueMicrotask(() => errorSummaryRef.current?.focus());
    } finally {
      setPending(false);
      releaseFormSubmission(latch);
    }
  }

  if (mode !== 'edit') {
    return (
      <div className="space-y-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            perform(
              mode === 'create'
                ? { command: 'create', operationId: commandOperations.current.create }
                : {
                    command: 'replace',
                    credentialId: credential?.credentialId,
                    expectedVersion: credential?.version,
                    operationId: commandOperations.current.replacement,
                  },
              () => {
                commandOperations.current[mode] = crypto.randomUUID();
              },
            )
          }
        >
          {pending ? t('pending') : t(mode === 'create' ? 'createDraft' : 'replacement')}
        </Button>
        <p aria-live="polite" className="text-muted-foreground text-sm">
          {feedback?.text}
        </p>
      </div>
    );
  }

  function submitDraft(event: React.FormEvent<HTMLFormElement>) {
    void form.handleSubmit(
      (values) => perform({ command: 'save', credentialId: credential?.credentialId, ...values }),
      (errors) => queueMicrotask(() => focusError(errors)),
    )(event);
  }

  return (
    <form onSubmit={submitDraft} className="space-y-4" noValidate>
      {feedback?.kind === 'error' || Object.keys(form.formState.errors).length > 0 ? (
        <div
          ref={errorSummaryRef}
          tabIndex={-1}
          role="alert"
          className="border-destructive/40 bg-destructive/5 rounded-lg border p-3 text-sm"
        >
          <p className="font-medium">{t('errorSummary')}</p>
          {Object.keys(form.formState.errors).length > 0 ? (
            <ul className="mt-1 list-inside list-disc">
              {Object.keys(form.formState.errors).map((field) => (
                <li key={field}>
                  <a className="underline" href={`#credential-${fieldToId(field)}`}>
                    {fieldLabel(field, t)}: {t('invalidField')}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p>{feedback?.text}</p>
          )}
        </div>
      ) : null}
      <fieldset disabled={pending} className="space-y-4">
        <legend className="font-medium">{t('editLegend')}</legend>
        <CredentialField
          id="credential-identifier"
          label={t('identifier')}
          help={t(hasStoredIdentifier ? 'identifierExistingHelp' : 'identifierHelp')}
          error={form.formState.errors.identifier ? t('invalidField') : null}
        >
          <Input
            id="credential-identifier"
            autoComplete="off"
            dir="ltr"
            aria-invalid={Boolean(form.formState.errors.identifier)}
            aria-describedby={`credential-identifier-help${form.formState.errors.identifier ? ' credential-identifier-error' : ''}`}
            {...form.register('identifier')}
          />
        </CredentialField>
        <CredentialField
          id="credential-authority"
          label={t('issuingAuthority')}
          error={form.formState.errors.issuingAuthority ? t('invalidField') : null}
        >
          <Input
            id="credential-authority"
            aria-invalid={Boolean(form.formState.errors.issuingAuthority)}
            aria-describedby={
              form.formState.errors.issuingAuthority ? 'credential-authority-error' : undefined
            }
            {...form.register('issuingAuthority')}
          />
        </CredentialField>
        <div className="grid gap-4 sm:grid-cols-2">
          <CredentialField
            id="credential-issue-date"
            label={t('issueDate')}
            error={form.formState.errors.issueDate ? t('invalidField') : null}
          >
            <Input
              id="credential-issue-date"
              type="date"
              dir="ltr"
              aria-invalid={Boolean(form.formState.errors.issueDate)}
              aria-describedby={
                form.formState.errors.issueDate ? 'credential-issue-date-error' : undefined
              }
              {...form.register('issueDate')}
            />
          </CredentialField>
          <CredentialField
            id="credential-expiry-date"
            label={t('expiryDate')}
            error={form.formState.errors.expiryDate ? t('invalidField') : null}
          >
            <Input
              id="credential-expiry-date"
              type="date"
              dir="ltr"
              aria-invalid={Boolean(form.formState.errors.expiryDate)}
              aria-describedby={
                form.formState.errors.expiryDate ? 'credential-expiry-date-error' : undefined
              }
              {...form.register('expiryDate')}
            />
          </CredentialField>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? t('pending') : t('saveDraft')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending || form.formState.isDirty}
            onClick={() =>
              perform(
                {
                  command: 'submit',
                  credentialId: credential?.credentialId,
                  expectedVersion: form.getValues('expectedVersion'),
                  operationId: commandOperations.current.submit,
                },
                () => {
                  commandOperations.current.submit = crypto.randomUUID();
                },
              )
            }
          >
            {t('submit')}
          </Button>
        </div>
      </fieldset>
      <p aria-live="polite" className="text-muted-foreground text-sm">
        {feedback?.kind === 'success' ? feedback.text : null}
      </p>
    </form>
  );
}

function fieldToId(field: string): string {
  return field === 'issuingAuthority'
    ? 'authority'
    : field === 'issueDate'
      ? 'issue-date'
      : field === 'expiryDate'
        ? 'expiry-date'
        : 'identifier';
}

function fieldLabel(field: string, t: ReturnType<typeof useTranslations>): string {
  return field === 'issuingAuthority'
    ? t('issuingAuthority')
    : field === 'issueDate'
      ? t('issueDate')
      : field === 'expiryDate'
        ? t('expiryDate')
        : t('identifier');
}

function CredentialField({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {help ? (
        <p id={`${id}-help`} className="text-muted-foreground text-xs">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
