'use client';

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  type FormEventHandler,
  type RefObject,
} from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Path,
  type Resolver,
  type UseFormReturn,
} from 'react-hook-form';
import type { z } from 'zod';
import type { OnboardingActionState } from '@/lib/company-onboarding/action-orchestration';
import {
  claimFormSubmission,
  releaseFormSubmission,
} from '@/components/admin/form-submission-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export type OnboardingFormAction = (
  previousState: OnboardingActionState,
  formData: FormData,
) => Promise<OnboardingActionState>;

export type OnboardingFormLabels = {
  saved: string;
  saving: string;
  save: string;
  errorTitle: string;
  errors: Record<string, string>;
  errorSummary: string;
  leaveWarning: string;
};

type UseOnboardingFormOptions<T extends FieldValues> = {
  schema: z.ZodType<T>;
  defaultValues: DefaultValues<T>;
  action: OnboardingFormAction;
  initialState: OnboardingActionState;
  labels: OnboardingFormLabels;
  prepare?: (data: FormData, values: T) => void;
};

export function useOnboardingForm<T extends FieldValues>({
  schema,
  defaultValues,
  action,
  initialState,
  labels,
  prepare,
}: UseOnboardingFormOptions<T>): {
  form: UseFormReturn<T>;
  formRef: RefObject<HTMLFormElement | null>;
  summaryRef: RefObject<HTMLDivElement | null>;
  state: OnboardingActionState;
  pending: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
} {
  const resolver = zodResolver(schema as never) as Resolver<T>;
  const form = useForm<T>({ resolver, defaultValues, mode: 'onBlur' });
  const [state, dispatch, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const submissionLatch = useRef(false);

  useUnsavedChanges(form.formState.isDirty, labels.leaveWarning);

  useEffect(() => {
    releaseFormSubmission(submissionLatch);
    if (state.status !== 'error') {
      if (state.status === 'saved') form.reset(form.getValues());
      return;
    }
    for (const [field, message] of Object.entries(state.fieldErrors ?? {})) {
      form.setError(field as Path<T>, { type: 'server', message });
    }
    const first = Object.keys(state.fieldErrors ?? {})[0] as Path<T> | undefined;
    if (first) form.setFocus(first);
    else summaryRef.current?.focus();
  }, [form, state]);

  const onSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void form.handleSubmit(
      (values) => {
        if (!claimFormSubmission(submissionLatch)) return;
        const data = new FormData(formRef.current ?? event.currentTarget);
        prepare?.(data, values);
        startTransition(() => dispatch(data));
      },
      () => {
        const first = Object.keys(form.formState.errors)[0] as Path<T> | undefined;
        if (first) form.setFocus(first);
        else summaryRef.current?.focus();
      },
    )(event);
  };

  return { form, formRef, summaryRef, state, pending, onSubmit };
}

function useUnsavedChanges(dirty: boolean, warning: string): void {
  useEffect(() => {
    document.documentElement.dataset.onboardingDirty = dirty ? 'true' : 'false';
    const beforeunload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = warning;
    };
    window.addEventListener('beforeunload', beforeunload);
    return () => {
      window.removeEventListener('beforeunload', beforeunload);
      delete document.documentElement.dataset.onboardingDirty;
    };
  }, [dirty, warning]);
}

export function confirmOnboardingNavigation(warning: string): boolean {
  return document.documentElement.dataset.onboardingDirty !== 'true' || window.confirm(warning);
}

export function OnboardingFormFeedback({
  state,
  labels,
  summaryRef,
}: {
  state: OnboardingActionState;
  labels: OnboardingFormLabels;
  summaryRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={summaryRef} tabIndex={-1} aria-live="polite" aria-atomic="true" className="min-h-6">
      {state.status === 'saved' ? (
        <p className="inline-flex items-center gap-2 text-sm text-[var(--signal-success)]">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {labels.saved}
        </p>
      ) : state.status === 'error' ? (
        <Alert variant="destructive">
          <AlertTitle>{labels.errorTitle}</AlertTitle>
          <AlertDescription>{labels.errors[state.code] ?? labels.errorSummary}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export function OnboardingSubmitButton({
  pending,
  labels,
}: {
  pending: boolean;
  labels: OnboardingFormLabels;
}) {
  return (
    <Button type="submit" disabled={pending} className="min-h-11 w-full md:min-h-9 md:w-auto">
      {pending ? (
        <LoaderCircle
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : null}
      {pending ? labels.saving : labels.save}
    </Button>
  );
}
