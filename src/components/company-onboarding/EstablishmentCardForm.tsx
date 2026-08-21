'use client';

import type { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OnboardingActionState } from '@/lib/company-onboarding/action-orchestration';
import type { CompanyOnboardingSnapshot } from '@/lib/data/company-onboarding';
import { companyEstablishmentSectionSchema } from '@/lib/validation/company-onboarding';
import {
  OnboardingFormFeedback,
  OnboardingSubmitButton,
  useOnboardingForm,
  type OnboardingFormAction,
  type OnboardingFormLabels,
} from './form-utils';

type Values = z.infer<typeof companyEstablishmentSectionSchema>;
type Labels = OnboardingFormLabels & {
  title: string;
  description: string;
  maskedLabel: string;
  none: string;
  cardNumber: string;
  cardExpiry: string;
  complete: string;
};

export function EstablishmentCardForm({
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
    schema: companyEstablishmentSectionSchema,
    action,
    initialState,
    labels,
    defaultValues: {
      tenantId: snapshot.tenantId,
      companyId: snapshot.companyId,
      operationId: initialState.operationId,
      expectedVersion: initialState.version,
      completeSection: snapshot.sectionProgress.establishment.status === 'complete',
      establishmentCardNumber: '',
      establishmentCardExpiry: snapshot.establishmentCardExpiry ?? '',
    },
  });
  const { form, formRef, summaryRef, state, pending, onSubmit } = setup;
  const {
    register,
    formState: { errors },
  } = form;
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6" noValidate>
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{labels.title}</h2>
        <p className="text-muted-foreground text-sm">{labels.description}</p>
      </header>
      <div className="bg-muted/45 rounded-xl border p-4">
        <p className="text-muted-foreground text-xs">{labels.maskedLabel}</p>
        <p className="mt-1 font-mono" dir="ltr">
          {snapshot.establishmentCardMasked ?? labels.none}
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="establishment-number">{labels.cardNumber}</Label>
          <Input
            id="establishment-number"
            dir="ltr"
            autoComplete="off"
            aria-invalid={Boolean(errors.establishmentCardNumber)}
            aria-describedby={
              errors.establishmentCardNumber ? 'establishment-number-error' : undefined
            }
            {...register('establishmentCardNumber')}
          />
          {errors.establishmentCardNumber ? (
            <p id="establishment-number-error" className="text-destructive text-sm">
              {labels.errors.INVALID_SECTION_INPUT}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="establishment-expiry">{labels.cardExpiry}</Label>
          <Input
            id="establishment-expiry"
            type="date"
            dir="ltr"
            aria-invalid={Boolean(errors.establishmentCardExpiry)}
            aria-describedby={
              errors.establishmentCardExpiry ? 'establishment-expiry-error' : undefined
            }
            {...register('establishmentCardExpiry')}
          />
          {errors.establishmentCardExpiry ? (
            <p id="establishment-expiry-error" className="text-destructive text-sm">
              {labels.errors.INVALID_SECTION_INPUT}
            </p>
          ) : null}
        </div>
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
