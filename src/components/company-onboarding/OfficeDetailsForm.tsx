'use client';

import type { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OnboardingActionState } from '@/lib/company-onboarding/action-orchestration';
import type { CompanyOnboardingSnapshot } from '@/lib/data/company-onboarding';
import { companyOfficeSectionSchema } from '@/lib/validation/company-onboarding';
import {
  OnboardingFormFeedback,
  OnboardingSubmitButton,
  useOnboardingForm,
  type OnboardingFormAction,
  type OnboardingFormLabels,
} from './form-utils';

type Values = z.infer<typeof companyOfficeSectionSchema>;
type Labels = OnboardingFormLabels & {
  title: string;
  description: string;
  complete: string;
  officeTypeLegend: string;
  officeTypes: Record<'physical' | 'flexi_desk' | 'virtual', string>;
  fields: Record<
    | 'addressLine1'
    | 'addressLine2'
    | 'area'
    | 'city'
    | 'emirate'
    | 'postalCode'
    | 'providerName'
    | 'leaseReference'
    | 'leaseExpiry',
    string
  >;
};

export function OfficeDetailsForm({
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
  const office = snapshot.office;
  const setup = useOnboardingForm<Values>({
    schema: companyOfficeSectionSchema,
    action,
    initialState,
    labels,
    defaultValues: {
      tenantId: snapshot.tenantId,
      companyId: snapshot.companyId,
      operationId: initialState.operationId,
      expectedVersion: initialState.version,
      completeSection: snapshot.sectionProgress.office.status === 'complete',
      officeType: office?.officeType ?? 'physical',
      addressLine1: office?.addressLine1 ?? '',
      addressLine2: office?.addressLine2 ?? '',
      area: office?.area ?? '',
      city: office?.city ?? '',
      emirate: office?.emirate ?? '',
      postalCode: office?.postalCode ?? '',
      countryCode: 'AE',
      providerName: office?.providerName ?? '',
      leaseReference: office?.leaseReference ?? '',
      leaseExpiry: office?.leaseExpiry ?? '',
    },
  });
  const { form, formRef, summaryRef, state, pending, onSubmit } = setup;
  const {
    register,
    formState: { errors },
  } = form;
  const fields = [
    'addressLine1',
    'addressLine2',
    'area',
    'city',
    'emirate',
    'postalCode',
    'providerName',
    'leaseReference',
    'leaseExpiry',
  ] as const;
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6" noValidate>
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{labels.title}</h2>
        <p className="text-muted-foreground text-sm">{labels.description}</p>
      </header>
      <fieldset className="space-y-3">
        <legend className="font-medium">{labels.officeTypeLegend}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(labels.officeTypes).map(([value, label]) => (
            <label
              key={value}
              className="border-border flex min-h-11 items-center gap-3 rounded-lg border px-3"
            >
              <input type="radio" value={value} {...register('officeType')} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-5 lg:grid-cols-2">
        {fields.map((name) => (
          <div key={name} className="grid gap-2">
            <Label htmlFor={`office-${name}`}>{labels.fields[name]}</Label>
            <Input
              id={`office-${name}`}
              type={name === 'leaseExpiry' ? 'date' : 'text'}
              dir={name === 'leaseExpiry' || name === 'postalCode' ? 'ltr' : undefined}
              aria-invalid={Boolean(errors[name])}
              aria-describedby={errors[name] ? `office-${name}-error` : undefined}
              {...register(name)}
            />
            {errors[name] ? (
              <p id={`office-${name}-error`} className="text-destructive text-sm">
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
