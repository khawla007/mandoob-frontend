'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { releaseCompanyProAction } from '@/app/admin/companies/actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CompanyAssignment } from '@/lib/data/company-assignments';
import { claimFormSubmission, releaseFormSubmission } from './form-submission-guard';
import { PendingActionButton } from './PendingActionButton';
import { AccessibleCompanyField } from './AccessibleCompanyField';

function ReleaseSubmit({ completed }: { completed: boolean }) {
  const { pending } = useFormStatus();
  const t = useTranslations('admin.companies.release');
  return (
    <PendingActionButton
      pending={pending}
      completed={completed}
      idleLabel={t('submit')}
      pendingLabel={t('releasing')}
      destructive
    />
  );
}

export function ReleaseCompanyProForm({
  companyId,
  companyName,
  assignment,
}: {
  companyId: string;
  companyName: string;
  assignment: CompanyAssignment;
}) {
  const t = useTranslations('admin.companies');
  const [state, action] = useActionState(releaseCompanyProAction, null);
  const submissionLatch = useRef(false);
  const confirmationError = state && !state.ok && state.fieldErrors?.companyNameConfirmation;
  const reasonError = state && !state.ok && state.fieldErrors?.reason;

  useEffect(() => {
    if (!state?.ok) releaseFormSubmission(submissionLatch);
  }, [state]);

  return (
    <form
      action={action}
      className="space-y-5"
      onSubmit={(event) => {
        if (!claimFormSubmission(submissionLatch)) event.preventDefault();
      }}
    >
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="assignmentId" value={assignment.id} />

      <div aria-live="polite" aria-atomic="true">
        {state && !state.ok ? (
          <Alert variant="destructive">
            <AlertTitle>{t('feedback.errorTitle')}</AlertTitle>
            <AlertDescription>{t(`errors.${state.code}`)}</AlertDescription>
          </Alert>
        ) : null}
        {state?.ok ? (
          <Alert>
            <AlertTitle>{t('feedback.releasedTitle')}</AlertTitle>
            <AlertDescription>{t('feedback.releasedDescription')}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="border-destructive/30 bg-destructive/5 rounded-xl border p-4">
        <p className="font-medium">
          {t('release.currentPro', {
            name: assignment.proFullName ?? t('assignment.unnamedPro'),
          })}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">{t('release.warning')}</p>
      </div>

      <AccessibleCompanyField
        id="release-company-name"
        label={t('release.confirmationLabel')}
        description={t('release.confirmationDescription', { companyName })}
        error={confirmationError ? t('fieldErrors.companyNameConfirmation') : undefined}
      >
        <Input name="companyNameConfirmation" required autoComplete="off" />
      </AccessibleCompanyField>

      <div className="grid gap-2">
        <Label htmlFor="release-reason">{t('release.reasonLabel')}</Label>
        <Textarea
          id="release-reason"
          name="reason"
          required
          minLength={3}
          maxLength={500}
          aria-invalid={Boolean(reasonError)}
          aria-describedby={`release-reason-description${reasonError ? ' release-reason-error' : ''}`}
        />
        <p id="release-reason-description" className="text-muted-foreground text-sm">
          {t('release.reasonDescription')}
        </p>
        {reasonError ? (
          <p id="release-reason-error" className="text-destructive text-sm">
            {t('fieldErrors.reason')}
          </p>
        ) : null}
      </div>

      <ReleaseSubmit completed={state?.ok === true} />
    </form>
  );
}
