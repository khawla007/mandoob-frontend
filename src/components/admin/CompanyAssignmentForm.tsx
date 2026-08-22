'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { assignCompanyProAction, reassignCompanyProAction } from '@/app/admin/companies/actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CurrentCompanyAssignment } from '@/lib/data/company-assignments';
import type { EligiblePro } from '@/lib/data/pro-eligibility';
import { claimFormSubmission, releaseFormSubmission } from './form-submission-guard';
import { PendingActionButton } from './PendingActionButton';
import { AccessibleCompanyField } from './AccessibleCompanyField';

function AssignmentSubmit({
  reassigning,
  completed,
}: {
  reassigning: boolean;
  completed: boolean;
}) {
  const { pending } = useFormStatus();
  const t = useTranslations('admin.companies.assignment');
  return (
    <PendingActionButton
      pending={pending}
      completed={completed}
      idleLabel={reassigning ? t('reassignSubmit') : t('assignSubmit')}
      pendingLabel={t('saving')}
    />
  );
}

export function CompanyAssignmentForm({
  companyId,
  currentAssignment,
  availablePros,
}: {
  companyId: string;
  currentAssignment: CurrentCompanyAssignment | null;
  availablePros: EligiblePro[];
}) {
  const t = useTranslations('admin.companies');
  const action = currentAssignment ? reassignCompanyProAction : assignCompanyProAction;
  const [state, formAction] = useActionState(action, null);
  const submissionLatch = useRef(false);
  const proField = currentAssignment ? 'replacementProProfileId' : 'proProfileId';
  const proError = state && !state.ok && state.fieldErrors?.[proField];
  const reasonError = state && !state.ok && state.fieldErrors?.reason;

  useEffect(() => {
    if (!state?.ok) releaseFormSubmission(submissionLatch);
  }, [state]);

  return (
    <form
      action={formAction}
      className="space-y-5"
      onSubmit={(event) => {
        if (!claimFormSubmission(submissionLatch)) event.preventDefault();
      }}
    >
      <input type="hidden" name="companyId" value={companyId} />
      {currentAssignment ? (
        <input type="hidden" name="assignmentId" value={currentAssignment.id} />
      ) : null}

      <div aria-live="polite" aria-atomic="true">
        {state && !state.ok ? (
          <Alert variant="destructive">
            <AlertTitle>{t('feedback.errorTitle')}</AlertTitle>
            <AlertDescription>{t(`errors.${state.code}`)}</AlertDescription>
          </Alert>
        ) : null}
        {state?.ok ? (
          <Alert>
            <AlertTitle>{t('feedback.assignmentSavedTitle')}</AlertTitle>
            <AlertDescription>{t('feedback.assignmentSavedDescription')}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      {currentAssignment ? (
        <div className="border-border bg-muted/35 rounded-xl border p-4">
          <p className="text-muted-foreground font-mono text-xs tracking-wide">
            {t('assignment.currentProLabel')}
          </p>
          <p className="mt-1 font-medium">
            {currentAssignment.proFullName ?? t('assignment.unnamedPro')}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('assignment.reassignDescription')}
          </p>
          {currentAssignment.operationalAccess === 'blocked' ? (
            <div className="mt-3" role="status">
              <p className="text-destructive font-medium">{t('assignment.accessBlocked')}</p>
              <ul className="text-muted-foreground mt-1 list-disc space-y-1 ps-5 text-sm">
                {currentAssignment.operationalAccessCodes.map((code) => (
                  <li key={code}>{t(`eligibility.${code}`)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {availablePros.length > 0 ? (
        <>
          <AccessibleCompanyField
            id="company-pro"
            label={
              currentAssignment ? t('assignment.replacementProLabel') : t('assignment.proLabel')
            }
            description={t('assignment.proDescription')}
            error={proError ? t(`fieldErrors.${proField}`) : undefined}
          >
            <select
              name={proField}
              required
              defaultValue=""
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
            >
              <option value="" disabled>
                {t('assignment.selectPro')}
              </option>
              {availablePros.map((pro) => (
                <option
                  key={pro.proProfileId}
                  value={pro.proProfileId}
                  disabled={!pro.eligibility.eligible}
                >
                  {pro.fullName ?? t('assignment.unnamedPro')}
                  {pro.eligibility.eligible
                    ? ''
                    : ` — ${pro.eligibility.codes.map((code) => t(`eligibility.${code}`)).join('; ')}`}
                </option>
              ))}
            </select>
          </AccessibleCompanyField>

          {currentAssignment ? (
            <div className="grid gap-2">
              <Label htmlFor="reassign-reason">{t('assignment.reasonLabel')}</Label>
              <Textarea
                id="reassign-reason"
                name="reason"
                required
                minLength={3}
                maxLength={500}
                aria-invalid={Boolean(reasonError)}
                aria-describedby={`reassign-reason-description${reasonError ? ' reassign-reason-error' : ''}`}
              />
              <p id="reassign-reason-description" className="text-muted-foreground text-sm">
                {t('assignment.reasonDescription')}
              </p>
              {reasonError ? (
                <p id="reassign-reason-error" className="text-destructive text-sm">
                  {t('fieldErrors.reason')}
                </p>
              ) : null}
            </div>
          ) : null}

          <AssignmentSubmit
            reassigning={Boolean(currentAssignment)}
            completed={state?.ok === true}
          />
        </>
      ) : (
        <div className="border-border rounded-xl border border-dashed p-5">
          <p className="font-medium">{t('assignment.noProsTitle')}</p>
          <p className="text-muted-foreground mt-1 text-sm">{t('assignment.noProsDescription')}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/admin/users?role=pro">{t('assignment.managePros')}</Link>
          </Button>
        </div>
      )}
    </form>
  );
}
