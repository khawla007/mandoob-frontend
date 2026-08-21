'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  useFieldArray,
  useWatch,
  type UseFormRegisterReturn,
  type UseFormReturn,
} from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OnboardingActionState } from '@/lib/company-onboarding/action-orchestration';
import type { CompanyOnboardingSnapshot } from '@/lib/data/company-onboarding';
import { companyShareholdersSectionSchema } from '@/lib/validation/company-onboarding';
import {
  OnboardingFormFeedback,
  OnboardingSubmitButton,
  useOnboardingForm,
  type OnboardingFormAction,
  type OnboardingFormLabels,
} from './form-utils';

type Values = z.infer<typeof companyShareholdersSectionSchema>;
type Row = Values['shareholders'][number];
type Labels = OnboardingFormLabels & {
  title: string;
  description: string;
  complete: string;
  kindLegend: string;
  kinds: Record<'individual' | 'company', string>;
  fields: Record<
    | 'fullName'
    | 'nationalityCode'
    | 'passportNumber'
    | 'legalName'
    | 'countryOfIncorporation'
    | 'registrationNumber'
    | 'ownershipPercent',
    string
  >;
  addIndividual: string;
  addCompany: string;
  moveUp: string;
  moveDown: string;
  remove: string;
  removed: string;
  undo: string;
};

const individual = (): Row => ({
  kind: 'individual',
  fullName: '',
  nationalityCode: 'AE',
  passportNumber: '',
  ownershipPercent: '0.0000',
  sortOrder: 0,
});
const company = (): Row => ({
  kind: 'company',
  legalName: '',
  countryOfIncorporation: 'AE',
  registrationNumber: '',
  ownershipPercent: '0.0000',
  sortOrder: 0,
});

export function ShareholdersForm({
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
  const defaultRows: Row[] = snapshot.shareholders.map((row) =>
    row.kind === 'individual'
      ? {
          id: row.id,
          kind: 'individual',
          fullName: row.fullName,
          nationalityCode: row.nationalityCode,
          passportNumber: '',
          ownershipPercent: row.ownershipPercent,
          sortOrder: row.sortOrder,
        }
      : {
          id: row.id,
          kind: 'company',
          legalName: row.legalName,
          countryOfIncorporation: row.countryOfIncorporation,
          registrationNumber: '',
          ownershipPercent: row.ownershipPercent,
          sortOrder: row.sortOrder,
        },
  );
  const protectedMasks = new Map(
    snapshot.shareholders.map((row) => [
      row.id,
      row.kind === 'individual' ? row.passportMasked : row.registrationMasked,
    ]),
  );
  const setup = useOnboardingForm<Values>({
    schema: companyShareholdersSectionSchema,
    action,
    initialState,
    labels,
    defaultValues: {
      tenantId: snapshot.tenantId,
      companyId: snapshot.companyId,
      operationId: initialState.operationId,
      expectedVersion: initialState.version,
      completeSection: snapshot.sectionProgress.shareholders.status === 'complete',
      shareholders: defaultRows,
    },
    prepare(data, values) {
      data.set(
        'shareholders',
        JSON.stringify(values.shareholders.map((row, sortOrder) => ({ ...row, sortOrder }))),
      );
    },
  });
  const { form, formRef, summaryRef, state, pending, onSubmit } = setup;
  const { fields, append, remove, insert, move } = useFieldArray({
    control: form.control,
    name: 'shareholders',
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
          <ShareholderRow
            key={field.fieldKey}
            index={index}
            labels={labels}
            form={form}
            protectedMasked={field.id ? (protectedMasks.get(field.id) ?? null) : null}
            onMoveUp={() => move(index, index - 1)}
            onMoveDown={() => move(index, index + 1)}
            onRemove={() => {
              setRemoved({ row: form.getValues(`shareholders.${index}`), index });
              remove(index);
            }}
            first={index === 0}
            last={index === fields.length - 1}
          />
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
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => append({ ...individual(), sortOrder: fields.length })}
          className="min-h-11"
        >
          <Plus aria-hidden="true" />
          {labels.addIndividual}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => append({ ...company(), sortOrder: fields.length })}
          className="min-h-11"
        >
          <Plus aria-hidden="true" />
          {labels.addCompany}
        </Button>
      </div>
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

function ShareholderRow({
  index,
  labels,
  form,
  protectedMasked,
  onMoveUp,
  onMoveDown,
  onRemove,
  first,
  last,
}: {
  index: number;
  labels: Labels;
  form: UseFormReturn<Values>;
  protectedMasked: string | null;
  onMoveUp(): void;
  onMoveDown(): void;
  onRemove(): void;
  first: boolean;
  last: boolean;
}) {
  const kind = useWatch({ control: form.control, name: `shareholders.${index}.kind` });
  const prefix = `shareholders.${index}` as const;
  const rowErrors = form.formState.errors.shareholders?.[index] as
    | Record<string, unknown>
    | undefined;
  const hasError = (name: string) => Boolean(rowErrors?.[name]);
  return (
    <article className="space-y-4 rounded-xl border p-4">
      <fieldset>
        <legend className="mb-2 font-medium">{labels.kindLegend}</legend>
        <div className="flex flex-wrap gap-4">
          {(['individual', 'company'] as const).map((value) => (
            <label key={value} className="flex min-h-11 items-center gap-2">
              <input type="radio" value={value} {...form.register(`${prefix}.kind`)} />
              {labels.kinds[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 lg:grid-cols-2">
        {kind === 'company' ? (
          <>
            <Field
              id={`${prefix}.legalName`}
              label={labels.fields.legalName}
              register={form.register(`${prefix}.legalName`)}
              error={hasError('legalName')}
              errorLabel={labels.errors.INVALID_SECTION_INPUT}
            />
            <Field
              id={`${prefix}.countryOfIncorporation`}
              label={labels.fields.countryOfIncorporation}
              register={form.register(`${prefix}.countryOfIncorporation`)}
              ltr
              error={hasError('countryOfIncorporation')}
              errorLabel={labels.errors.INVALID_SECTION_INPUT}
            />
            <Field
              id={`${prefix}.registrationNumber`}
              label={labels.fields.registrationNumber}
              register={form.register(`${prefix}.registrationNumber`)}
              masked={protectedMasked}
              ltr
              error={hasError('registrationNumber')}
              errorLabel={labels.errors.INVALID_SECTION_INPUT}
            />
          </>
        ) : (
          <>
            <Field
              id={`${prefix}.fullName`}
              label={labels.fields.fullName}
              register={form.register(`${prefix}.fullName`)}
              error={hasError('fullName')}
              errorLabel={labels.errors.INVALID_SECTION_INPUT}
            />
            <Field
              id={`${prefix}.nationalityCode`}
              label={labels.fields.nationalityCode}
              register={form.register(`${prefix}.nationalityCode`)}
              ltr
              error={hasError('nationalityCode')}
              errorLabel={labels.errors.INVALID_SECTION_INPUT}
            />
            <Field
              id={`${prefix}.passportNumber`}
              label={labels.fields.passportNumber}
              register={form.register(`${prefix}.passportNumber`)}
              masked={protectedMasked}
              ltr
              error={hasError('passportNumber')}
              errorLabel={labels.errors.INVALID_SECTION_INPUT}
            />
          </>
        )}
        <Field
          id={`${prefix}.ownershipPercent`}
          label={labels.fields.ownershipPercent}
          register={form.register(`${prefix}.ownershipPercent`)}
          ltr
          error={hasError('ownershipPercent')}
          errorLabel={labels.errors.INVALID_SECTION_INPUT}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={first}
          onClick={onMoveUp}
          aria-label={labels.moveUp}
          className="min-h-11 min-w-11"
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={last}
          onClick={onMoveDown}
          aria-label={labels.moveDown}
          className="min-h-11 min-w-11"
        >
          <ArrowDown aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onRemove}
          aria-label={`${labels.remove}: ${labels.kinds[kind]} ${index + 1}`}
          className="min-h-11"
        >
          <Trash2 aria-hidden="true" />
          {labels.remove}
        </Button>
      </div>
    </article>
  );
}

function Field({
  id,
  label,
  register,
  masked = null,
  ltr = false,
  error,
  errorLabel,
}: {
  id: string;
  label: string;
  register: UseFormRegisterReturn;
  masked?: string | null;
  ltr?: boolean;
  error: boolean;
  errorLabel: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        dir={ltr ? 'ltr' : undefined}
        autoComplete={ltr ? 'off' : undefined}
        aria-invalid={error}
        aria-describedby={error ? `${id}-error` : undefined}
        {...register}
      />
      {masked ? (
        <p className="text-muted-foreground font-mono text-sm" dir="ltr">
          {masked}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {errorLabel}
        </p>
      ) : null}
    </div>
  );
}
