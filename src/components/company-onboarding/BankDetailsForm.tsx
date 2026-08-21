'use client';

import type { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OnboardingActionState } from '@/lib/company-onboarding/action-orchestration';
import type { CompanyOnboardingSnapshot } from '@/lib/data/company-onboarding';
import {
  clearCompanyBankIdentifierSchema,
  companyBankSectionSchema,
} from '@/lib/validation/company-onboarding';
import {
  OnboardingFormFeedback,
  OnboardingSubmitButton,
  useOnboardingForm,
  type OnboardingFormAction,
  type OnboardingFormLabels,
} from './form-utils';

type Values = z.infer<typeof companyBankSectionSchema>;
type ClearValues = z.infer<typeof clearCompanyBankIdentifierSchema>;
type Labels = OnboardingFormLabels & {
  title: string;
  description: string;
  maskedLabel: string;
  none: string;
  complete: string;
  fields: Record<
    'bankName' | 'branchName' | 'accountHolderName' | 'swiftBic' | 'iban' | 'accountNumber',
    string
  >;
  clearTitle: string;
  clearDescription: string;
  clearIdentifier: string;
  clearConfirmation: string;
  clear: string;
};

export function BankDetailsForm({
  snapshot,
  action,
  clearBankIdentifier,
  initialState,
  clearInitialState,
  labels,
}: {
  snapshot: CompanyOnboardingSnapshot;
  action: OnboardingFormAction;
  clearBankIdentifier: OnboardingFormAction;
  initialState: OnboardingActionState;
  clearInitialState: OnboardingActionState;
  labels: Labels;
}) {
  const bank = snapshot.bank;
  const setup = useOnboardingForm<Values>({
    schema: companyBankSectionSchema,
    action,
    initialState,
    labels,
    defaultValues: {
      tenantId: snapshot.tenantId,
      companyId: snapshot.companyId,
      operationId: initialState.operationId,
      expectedVersion: initialState.version,
      completeSection: snapshot.sectionProgress.bank.status === 'complete',
      bankName: bank?.bankName ?? '',
      branchName: bank?.branchName ?? '',
      accountHolderName: bank?.accountHolderName ?? snapshot.companyName,
      currencyCode: 'AED',
      swiftBic: '',
      iban: '',
      accountNumber: '',
    },
  });
  const { form, formRef, summaryRef, state, pending, onSubmit } = setup;
  const {
    register,
    formState: { errors },
  } = form;
  const fields = [
    'bankName',
    'branchName',
    'accountHolderName',
    'swiftBic',
    'iban',
    'accountNumber',
  ] as const;
  return (
    <div className="space-y-8">
      <form ref={formRef} onSubmit={onSubmit} className="space-y-6" noValidate>
        <header className="space-y-1">
          <h2 className="text-xl font-semibold">{labels.title}</h2>
          <p className="text-muted-foreground text-sm">{labels.description}</p>
        </header>
        <div className="bg-muted/45 grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
          <Masked label={labels.fields.iban} masked={bank?.ibanMasked} none={labels.none} />
          <Masked
            label={labels.fields.accountNumber}
            masked={bank?.accountNumberMasked}
            none={labels.none}
          />
          <Masked label={labels.fields.swiftBic} masked={bank?.swiftBicMasked} none={labels.none} />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {fields.map((name) => (
            <div key={name} className="grid gap-2">
              <Label htmlFor={`bank-${name}`}>{labels.fields[name]}</Label>
              <Input
                id={`bank-${name}`}
                dir={['swiftBic', 'iban', 'accountNumber'].includes(name) ? 'ltr' : undefined}
                autoComplete={
                  ['iban', 'accountNumber', 'swiftBic'].includes(name) ? 'off' : undefined
                }
                aria-invalid={Boolean(errors[name])}
                aria-describedby={errors[name] ? `bank-${name}-error` : undefined}
                {...register(name)}
              />
              {errors[name] ? (
                <p id={`bank-${name}-error`} className="text-destructive text-sm">
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
      <ClearBankIdentifierForm
        snapshot={snapshot}
        action={clearBankIdentifier}
        initialState={clearInitialState}
        labels={labels}
      />
    </div>
  );
}

function Masked({
  label,
  masked,
  none,
}: {
  label: string;
  masked: string | null | undefined;
  none: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-mono" dir="ltr">
        {masked ?? none}
      </p>
    </div>
  );
}

function ClearBankIdentifierForm({
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
  const setup = useOnboardingForm<ClearValues>({
    schema: clearCompanyBankIdentifierSchema,
    action,
    initialState,
    labels,
    defaultValues: {
      tenantId: snapshot.tenantId,
      companyId: snapshot.companyId,
      operationId: initialState.operationId,
      expectedVersion: initialState.version,
      identifier: 'iban',
      companyNameConfirmation: '',
      expectedCompanyName: snapshot.companyName,
    },
  });
  const { form, formRef, summaryRef, state, pending, onSubmit } = setup;
  const { register } = form;
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="border-destructive/30 space-y-4 rounded-xl border p-4"
      noValidate
    >
      <header>
        <h3 className="font-semibold">{labels.clearTitle}</h3>
        <p className="text-muted-foreground text-sm">{labels.clearDescription}</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="clear-bank-identifier">{labels.clearIdentifier}</Label>
          <select
            id="clear-bank-identifier"
            className="border-input bg-background min-h-11 rounded-md border px-3"
            {...register('identifier')}
          >
            <option value="iban">{labels.fields.iban}</option>
            <option value="account_number">{labels.fields.accountNumber}</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="companyNameConfirmation">{labels.clearConfirmation}</Label>
          <Input
            id="companyNameConfirmation"
            autoComplete="off"
            {...register('companyNameConfirmation')}
          />
        </div>
      </div>
      <OnboardingFormFeedback state={state} labels={labels} summaryRef={summaryRef} />
      <button
        type="submit"
        disabled={pending}
        className="border-destructive text-destructive min-h-11 rounded-md border px-4"
      >
        {labels.clear}
      </button>
    </form>
  );
}
