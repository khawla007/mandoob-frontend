'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useFieldArray } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OnboardingActionState } from '@/lib/company-onboarding/action-orchestration';
import type { CompanyOnboardingSnapshot } from '@/lib/data/company-onboarding';
import { companyActivitiesSectionSchema } from '@/lib/validation/company-onboarding';
import {
  OnboardingFormFeedback,
  OnboardingSubmitButton,
  useOnboardingForm,
  type OnboardingFormAction,
  type OnboardingFormLabels,
} from './form-utils';

type Values = z.infer<typeof companyActivitiesSectionSchema>;
type Row = Values['activities'][number];
type Labels = OnboardingFormLabels & {
  title: string;
  description: string;
  complete: string;
  fields: Record<'activityCode' | 'activityName' | 'authorityName', string>;
  primaryLegend: string;
  primary: string;
  add: string;
  moveUp: string;
  moveDown: string;
  remove: string;
  removed: string;
  undo: string;
};
const emptyRow = (sortOrder: number): Row => ({
  activityCode: '',
  activityName: '',
  authorityName: '',
  isPrimary: false,
  sortOrder,
});

export function ActivitiesForm({
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
    schema: companyActivitiesSectionSchema,
    action,
    initialState,
    labels,
    defaultValues: {
      tenantId: snapshot.tenantId,
      companyId: snapshot.companyId,
      operationId: initialState.operationId,
      expectedVersion: initialState.version,
      completeSection: snapshot.sectionProgress.activities.status === 'complete',
      activities: snapshot.activities,
    },
    prepare(data, values) {
      data.set(
        'activities',
        JSON.stringify(values.activities.map((row, sortOrder) => ({ ...row, sortOrder }))),
      );
    },
  });
  const { form, formRef, summaryRef, state, pending, onSubmit } = setup;
  const { fields, append, remove, insert, move } = useFieldArray({
    control: form.control,
    name: 'activities',
    keyName: 'fieldKey',
  });
  const [removed, setRemoved] = useState<{ row: Row; index: number } | null>(null);
  const undo = () => {
    if (removed) {
      insert(removed.index, removed.row);
      setRemoved(null);
    }
  };
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6" noValidate>
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{labels.title}</h2>
        <p className="text-muted-foreground text-sm">{labels.description}</p>
      </header>
      <div className="space-y-4">
        {fields.map((field, index) => (
          <article key={field.fieldKey} className="space-y-4 rounded-xl border p-4">
            <div className="grid gap-4 lg:grid-cols-3">
              {(['activityCode', 'activityName', 'authorityName'] as const).map((name) => (
                <div key={name} className="grid gap-2">
                  <Label htmlFor={`activities-${index}-${name}`}>{labels.fields[name]}</Label>
                  <Input
                    id={`activities-${index}-${name}`}
                    dir={name === 'activityCode' ? 'ltr' : undefined}
                    aria-invalid={Boolean(form.formState.errors.activities?.[index]?.[name])}
                    aria-describedby={
                      form.formState.errors.activities?.[index]?.[name]
                        ? `activities-${index}-${name}-error`
                        : undefined
                    }
                    {...form.register(`activities.${index}.${name}`)}
                  />
                  {form.formState.errors.activities?.[index]?.[name] ? (
                    <p
                      id={`activities-${index}-${name}-error`}
                      className="text-destructive text-sm"
                    >
                      {labels.errors.INVALID_SECTION_INPUT}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <fieldset>
              <legend className="mb-2 font-medium">{labels.primaryLegend}</legend>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" {...form.register(`activities.${index}.isPrimary`)} />
                {labels.primary}
              </label>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
                aria-label={labels.moveUp}
                className="min-h-11 min-w-11"
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={index === fields.length - 1}
                onClick={() => move(index, index + 1)}
                aria-label={labels.moveDown}
                className="min-h-11 min-w-11"
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRemoved({ row: form.getValues(`activities.${index}`), index });
                  remove(index);
                }}
                aria-label={`${labels.remove}: ${labels.fields.activityName} ${index + 1}`}
                className="min-h-11"
              >
                <Trash2 aria-hidden="true" />
                {labels.remove}
              </Button>
            </div>
          </article>
        ))}
      </div>
      {removed ? (
        <div
          className="bg-muted flex items-center justify-between rounded-lg p-3"
          aria-live="polite"
        >
          <span>{labels.removed}</span>
          <Button type="button" variant="outline" onClick={undo} className="min-h-11">
            <RotateCcw aria-hidden="true" />
            {labels.undo}
          </Button>
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={() => append(emptyRow(fields.length))}
        className="min-h-11"
      >
        <Plus aria-hidden="true" />
        {labels.add}
      </Button>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" {...form.register('completeSection')} />
        {labels.complete}
      </label>
      <div className="border-border flex flex-col gap-4 border-t pt-5 md:flex-row md:items-center md:justify-between">
        <OnboardingFormFeedback state={state} labels={labels} summaryRef={summaryRef} />
        <OnboardingSubmitButton pending={pending} labels={labels} />
      </div>
    </form>
  );
}
