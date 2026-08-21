'use client';

import type { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OnboardingActionState } from '@/lib/company-onboarding/action-orchestration';
import type { CompanyOnboardingSnapshot } from '@/lib/data/company-onboarding';
import { companyLegalSectionSchema } from '@/lib/validation/company-onboarding';
import {
  OnboardingFormFeedback,
  OnboardingSubmitButton,
  useOnboardingForm,
  type OnboardingFormAction,
  type OnboardingFormLabels,
} from './form-utils';

type Values = z.infer<typeof companyLegalSectionSchema>;
type Labels = OnboardingFormLabels & {
  title: string;
  description: string;
  complete: string;
  fields: Record<
    | 'companyName'
    | 'displayName'
    | 'jurisdictionType'
    | 'licensingAuthority'
    | 'legalStructure'
    | 'tradeLicenseNo'
    | 'licenseExpiry',
    string
  >;
  jurisdictionOptions: Record<'mainland' | 'free_zone' | 'offshore', string>;
};

export function LegalProfileForm({
  snapshot,
  action,
  initialState,
  labels,
}: {
  snapshot: CompanyOnboardingSnapshot;
  action: OnboardingFormAction;
  initialState: OnboardingActionState;
  labels: Labels;
}) {
  const setup = useOnboardingForm<Values>({
    schema: companyLegalSectionSchema,
    action,
    initialState,
    labels,
    defaultValues: {
      tenantId: snapshot.tenantId,
      companyId: snapshot.companyId,
      operationId: initialState.operationId,
      expectedVersion: initialState.version,
      completeSection: snapshot.sectionProgress.legal.status === 'complete',
      companyName: snapshot.companyName,
      displayName: snapshot.displayName ?? '',
      jurisdictionType: snapshot.jurisdictionType ?? 'mainland',
      licensingAuthority: snapshot.licensingAuthority ?? '',
      legalStructure: snapshot.legalStructure ?? '',
      tradeLicenseNo: snapshot.tradeLicenseNo ?? '',
      licenseExpiry: snapshot.licenseExpiry ?? '',
    },
  });
  const { form, formRef, summaryRef, state, pending, onSubmit } = setup;
  const {
    register,
    formState: { errors },
  } = form;
  const fields = [
    ['companyName', 'text'],
    ['displayName', 'text'],
    ['licensingAuthority', 'text'],
    ['legalStructure', 'text'],
    ['tradeLicenseNo', 'text'],
    ['licenseExpiry', 'date'],
  ] as const;
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6" noValidate>
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{labels.title}</h2>
        <p className="text-muted-foreground text-sm">{labels.description}</p>
      </header>
      <div className="grid gap-5 lg:grid-cols-2">
        {fields.slice(0, 2).map(([name, type]) => (
          <div key={name} className="grid gap-2">
            <Label htmlFor={`legal-${name}`}>{labels.fields[name]}</Label>
            <Input
              id={`legal-${name}`}
              type={type}
              dir={name === 'tradeLicenseNo' ? 'ltr' : undefined}
              aria-invalid={Boolean(errors[name])}
              aria-describedby={errors[name] ? `legal-${name}-error` : undefined}
              {...register(name)}
            />
            {errors[name] ? (
              <p id={`legal-${name}-error`} className="text-destructive text-sm">
                {labels.errors.INVALID_SECTION_INPUT}
              </p>
            ) : null}
          </div>
        ))}
        <div className="grid gap-2">
          <Label htmlFor="legal-jurisdictionType">{labels.fields.jurisdictionType}</Label>
          <select
            id="legal-jurisdictionType"
            className="border-input bg-background min-h-11 rounded-md border px-3 md:min-h-9"
            {...register('jurisdictionType')}
          >
            {Object.entries(labels.jurisdictionOptions).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {fields.slice(2).map(([name, type]) => (
          <div key={name} className="grid gap-2">
            <Label htmlFor={`legal-${name}`}>{labels.fields[name]}</Label>
            <Input
              id={`legal-${name}`}
              type={type}
              dir={name === 'tradeLicenseNo' || name === 'licenseExpiry' ? 'ltr' : undefined}
              aria-invalid={Boolean(errors[name])}
              aria-describedby={errors[name] ? `${name}-error` : undefined}
              {...register(name)}
            />
            {errors[name] ? (
              <p id={`${name}-error`} className="text-destructive text-sm">
                {labels.errors.INVALID_SECTION_INPUT}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" {...register('completeSection')} />
        {labels.complete}
      </label>
      <div className="border-border flex flex-col gap-4 border-t pt-5 md:flex-row md:items-center md:justify-between">
        <OnboardingFormFeedback state={state} labels={labels} summaryRef={summaryRef} />
        <OnboardingSubmitButton pending={pending} labels={labels} />
      </div>
    </form>
  );
}
