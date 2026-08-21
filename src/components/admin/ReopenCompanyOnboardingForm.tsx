'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { RotateCcw } from 'lucide-react';
import { reopenAdminOnboardingSectionAction } from '@/app/admin/companies/[id]/onboarding/actions';
import {
  claimFormSubmission,
  releaseFormSubmission,
} from '@/components/admin/form-submission-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CompanyOnboardingSectionKey } from '@/lib/company-onboarding/contracts';
import type { OnboardingActionState } from '@/lib/company-onboarding/action-orchestration';

export function ReopenCompanyOnboardingForm({
  companyId,
  companyName,
  section,
  initialState,
  labels,
}: {
  companyId: string;
  companyName: string;
  section: CompanyOnboardingSectionKey;
  initialState: OnboardingActionState;
  labels: {
    title: string;
    description: string;
    reason: string;
    confirmation: string;
    submit: string;
    submitting: string;
    saved: string;
    error: string;
  };
}) {
  const action = reopenAdminOnboardingSectionAction.bind(null, companyId);
  const [state, formAction] = useActionState(action, initialState);
  const latch = useRef(false);
  useEffect(() => releaseFormSubmission(latch), [state]);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!claimFormSubmission(latch)) event.preventDefault();
      }}
      className="border-warning/40 space-y-4 rounded-xl border p-4"
    >
      <header>
        <h3 className="font-semibold">{labels.title}</h3>
        <p className="text-muted-foreground text-sm">{labels.description}</p>
      </header>
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="expectedCompanyName" value={companyName} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="reopen-reason">{labels.reason}</Label>
          <Input id="reopen-reason" name="reason" required minLength={3} maxLength={500} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="reopen-company-confirmation">{labels.confirmation}</Label>
          <Input
            id="reopen-company-confirmation"
            name="companyNameConfirmation"
            required
            autoComplete="off"
          />
        </div>
      </div>
      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'saved' ? labels.saved : state.status === 'error' ? labels.error : ''}
      </p>
      <ReopenButton labels={labels} />
    </form>
  );
}

function ReopenButton({ labels }: { labels: { submit: string; submitting: string } }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending} className="min-h-11">
      <RotateCcw aria-hidden="true" />
      {pending ? labels.submitting : labels.submit}
    </Button>
  );
}
