'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createCompanyAction } from '@/app/admin/companies/actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TENANT_PLANS } from '@/lib/validation/tenant-onboarding';
import { baseTenantSlug } from '@/lib/tenant/slug';
import { claimFormSubmission, releaseFormSubmission } from './form-submission-guard';
import { PendingActionButton } from './PendingActionButton';
import { AccessibleCompanyField } from './AccessibleCompanyField';

function SubmitCompanyButton({ completed }: { completed: boolean }) {
  const { pending } = useFormStatus();
  const t = useTranslations('admin.companies.create');
  return (
    <PendingActionButton
      pending={pending}
      idleLabel={t('submit')}
      pendingLabel={t('creating')}
      completed={completed}
    />
  );
}

export function CreateCompanyForm() {
  const t = useTranslations('admin.companies');
  const router = useRouter();
  const [state, action] = useActionState(createCompanyAction, null);
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const submissionLatch = useRef(false);
  const companyNameError = state && !state.ok && state.fieldErrors?.companyName;
  const slugError = state && !state.ok && state.fieldErrors?.slug;
  const planError = state && !state.ok && state.fieldErrors?.plan;

  useEffect(() => {
    if (!state?.ok) releaseFormSubmission(submissionLatch);
    if (state?.ok) router.push(`/admin/companies/${state.data.companyId}?created=1`);
  }, [router, state]);

  return (
    <form
      action={action}
      className="space-y-6"
      onSubmit={(event) => {
        if (!claimFormSubmission(submissionLatch)) event.preventDefault();
      }}
    >
      <div aria-live="polite" aria-atomic="true">
        {state && !state.ok ? (
          <Alert variant="destructive">
            <AlertTitle>{t('feedback.errorTitle')}</AlertTitle>
            <AlertDescription>{t(`errors.${state.code}`)}</AlertDescription>
          </Alert>
        ) : null}
        {state?.ok ? (
          <Alert>
            <AlertTitle>{t('feedback.createdTitle')}</AlertTitle>
            <AlertDescription>{t('feedback.redirecting')}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <AccessibleCompanyField
            id="company-name"
            label={t('create.companyName')}
            description={t('create.companyNameDescription')}
            error={companyNameError ? t('fieldErrors.companyName') : undefined}
          >
            <Input
              name="companyName"
              required
              minLength={3}
              maxLength={200}
              value={companyName}
              onChange={(event) => {
                const next = event.target.value;
                setCompanyName(next);
                if (!slugTouched) setSlug(baseTenantSlug(next));
              }}
            />
          </AccessibleCompanyField>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="company-slug">{t('create.slug')}</Label>
          <Input
            id="company-slug"
            name="slug"
            required
            minLength={3}
            maxLength={40}
            pattern="^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$"
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugTouched(true);
            }}
            dir="ltr"
            aria-invalid={Boolean(slugError)}
            aria-describedby={`company-slug-description${slugError ? ' company-slug-error' : ''}`}
          />
          <p id="company-slug-description" className="text-muted-foreground text-sm">
            {t('create.slugDescription')}
          </p>
          {slugError ? (
            <p id="company-slug-error" className="text-destructive text-sm">
              {t('fieldErrors.slug')}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="company-plan">{t('create.plan')}</Label>
          <select
            id="company-plan"
            name="plan"
            defaultValue="starter"
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
            aria-invalid={Boolean(planError)}
            aria-describedby={`company-plan-description${planError ? ' company-plan-error' : ''}`}
          >
            {TENANT_PLANS.map((plan) => (
              <option key={plan} value={plan}>
                {t(`plan.${plan}`)}
              </option>
            ))}
          </select>
          <p id="company-plan-description" className="text-muted-foreground text-sm">
            {t('create.planDescription')}
          </p>
          {planError ? (
            <p id="company-plan-error" className="text-destructive text-sm">
              {t('fieldErrors.plan')}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitCompanyButton completed={state?.ok === true} />
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/companies')}>
          {t('create.cancel')}
        </Button>
      </div>
    </form>
  );
}
