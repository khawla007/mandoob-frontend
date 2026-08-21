'use client';

import Link from 'next/link';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { OnboardingActionState } from '@/lib/company-onboarding/action-orchestration';
import type {
  CompanyReadinessCode,
  CompanyReadinessRequirement,
  CompanyReadinessSection,
} from '@/lib/company-onboarding/contracts';
import type { CompanyOnboardingSnapshot } from '@/lib/data/company-onboarding';
import { activateCompanyOnboardingSchema } from '@/lib/validation/company-onboarding';
import {
  OnboardingFormFeedback,
  useOnboardingForm,
  type OnboardingFormAction,
  type OnboardingFormLabels,
} from './form-utils';

type Labels = OnboardingFormLabels & {
  title: string;
  description: string;
  ready: string;
  blocked: string;
  activate: string;
  requirements: Record<CompanyReadinessCode, string>;
};

export function OnboardingReview({
  snapshot,
  action,
  initialState,
  labels,
  sectionHrefs,
}: {
  snapshot: CompanyOnboardingSnapshot;
  action: OnboardingFormAction;
  initialState: OnboardingActionState;
  labels: Labels;
  sectionHrefs: Record<CompanyReadinessSection, string>;
}) {
  const setup = useOnboardingForm({
    schema: activateCompanyOnboardingSchema,
    action,
    initialState,
    labels,
    defaultValues: {
      tenantId: snapshot.tenantId,
      companyId: snapshot.companyId,
      operationId: initialState.operationId,
      expectedVersion: initialState.version,
    },
  });
  const { formRef, summaryRef, state, pending, onSubmit } = setup;
  const blocked = snapshot.requirements.length > 0;
  const blockerId = 'activation-blockers';
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6" noValidate>
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{labels.title}</h2>
        <p className="text-muted-foreground text-sm">{labels.description}</p>
      </header>
      <div
        className={
          blocked
            ? 'rounded-xl border border-[var(--signal-warning)] bg-[var(--signal-sand-soft)] p-4'
            : 'rounded-xl border border-[var(--signal-success)] bg-[var(--signal-mint-soft)] p-4'
        }
      >
        {blocked ? <AlertCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
        <p className="mt-2 font-medium">{blocked ? labels.blocked : labels.ready}</p>
      </div>
      {blocked ? (
        <ul id={blockerId} className="space-y-2">
          {snapshot.requirements.map((requirement: CompanyReadinessRequirement) => {
            const sectionHref = sectionHrefs[requirement.section];
            return (
              <li key={`${requirement.section}:${requirement.code}`}>
                <Link
                  href={sectionHref}
                  className="text-primary inline-flex min-h-11 items-center text-start underline underline-offset-4"
                >
                  {labels.requirements[requirement.code]}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      <OnboardingFormFeedback state={state} labels={labels} summaryRef={summaryRef} />
      <button
        type="submit"
        disabled={blocked}
        aria-describedby={blocked ? blockerId : undefined}
        className="bg-primary text-primary-foreground min-h-11 rounded-md px-4 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {labels.activate}
      </button>
      <span className="sr-only" aria-live="polite">
        {pending ? labels.saving : ''}
      </span>
    </form>
  );
}
