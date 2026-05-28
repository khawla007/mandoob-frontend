'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Loader2,
  Users,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { QuestionnaireAnswers } from '@/lib/questionnaire';
import {
  buildQuestionnaireSubmission,
  createQuestionnaireDefaults,
  type QuestionnaireFieldErrors,
  type QuestionnaireFormAnswers,
} from './payload';

type StepId = 'contact' | 'business' | 'setup' | 'details' | 'review';
type SubmissionSuccess = { leadId: string; stage: string; assignedTenantId: string | null };

const STEPS: { id: StepId; label: string; icon: typeof ClipboardList; fields: (keyof QuestionnaireAnswers)[] }[] = [
  { id: 'contact', label: 'Contact', icon: ClipboardList, fields: ['fullName', 'email', 'phone', 'nationality'] },
  { id: 'business', label: 'Business', icon: Building2, fields: ['activity', 'preferredNames', 'businessSummary'] },
  { id: 'setup', label: 'Setup', icon: FileCheck2, fields: ['jurisdiction', 'authority', 'addOns', 'documentReadiness'] },
  {
    id: 'details',
    label: 'Ownership',
    icon: Users,
    fields: [
      'shareholderCount',
      'shareholderSplitSummary',
      'investorVisaCount',
      'employeeVisaCount',
      'familyVisaCount',
      'officeType',
      'officeAreaNotes',
    ],
  },
  { id: 'review', label: 'Review', icon: CheckCircle2, fields: ['notes'] },
];

const JURISDICTION_OPTIONS = [
  { value: 'mainland', label: 'Mainland' },
  { value: 'free_zone', label: 'Free Zone' },
  { value: 'offshore', label: 'Offshore' },
] as const;

const OFFICE_OPTIONS = [
  { value: 'none', label: 'No office' },
  { value: 'flexi', label: 'Flexi desk' },
  { value: 'physical', label: 'Physical office' },
  { value: 'virtual', label: 'Virtual office' },
] as const;

const DOCUMENT_OPTIONS = [
  { value: 'ready', label: 'Ready' },
  { value: 'partial', label: 'Partially ready' },
  { value: 'not_ready', label: 'Not ready' },
] as const;

const ADD_ONS = [
  { value: 'bank_account', label: 'Bank account assistance' },
  { value: 'tax_registration', label: 'Corporate tax registration' },
  { value: 'document_attestation', label: 'Document attestation' },
  { value: 'pro_services', label: 'PRO services' },
] as const;

export function QuestionnaireForm({
  initialAnswers,
  estimateData,
}: {
  initialAnswers: Partial<QuestionnaireAnswers>;
  estimateData: Record<string, unknown>;
}) {
  const [answers, setAnswers] = useState<QuestionnaireFormAnswers>(() => createQuestionnaireDefaults(initialAnswers));
  const [stepIndex, setStepIndex] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<QuestionnaireFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SubmissionSuccess | null>(null);
  const [showVisaInputs, setShowVisaInputs] = useState(() => requestedVisaCount(createQuestionnaireDefaults(initialAnswers)) > 0);

  const currentStep = STEPS[stepIndex];
  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100);
  const hasEstimate = Object.keys(estimateData).length > 0;

  const reviewRows = useMemo(
    () => [
      ['Contact', [answers.fullName, answers.email || answers.phone].filter(Boolean).join(' / ')],
      ['Business', `${answers.activity || 'Not set'} · ${answers.preferredNames.filter(Boolean).join(', ') || 'No names yet'}`],
      ['Setup', `${labelFor(JURISDICTION_OPTIONS, answers.jurisdiction)} · ${answers.authority || 'Authority pending'}`],
      ['Ownership', `${answers.shareholderCount} shareholder${answers.shareholderCount === 1 ? '' : 's'}`],
      ['Visas', `${requestedVisaCount(answers)} requested`],
      ['Office', labelFor(OFFICE_OPTIONS, answers.officeType)],
    ],
    [answers],
  );

  function patch(next: Partial<QuestionnaireFormAnswers>) {
    setFieldErrors({});
    setAnswers((current) => ({ ...current, ...next }));
  }

  function setPreferredName(index: number, value: string) {
    const preferredNames = [...answers.preferredNames];
    preferredNames[index] = value;
    patch({ preferredNames });
  }

  function toggleAddOn(addOn: QuestionnaireAnswers['addOns'][number]) {
    const next = new Set(answers.addOns);
    if (next.has(addOn)) next.delete(addOn);
    else next.add(addOn);
    patch({ addOns: [...next] });
  }

  function validateCurrentStep(): boolean {
    const result = buildQuestionnaireSubmission(answers, estimateData);
    if (result.ok) {
      setFieldErrors({});
      return true;
    }
    const errors = pickStepErrors(result.fieldErrors, currentStep.fields);
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function goNext() {
    if (!validateCurrentStep()) return;
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildQuestionnaireSubmission(answers, estimateData);
    if (!payload.ok) {
      setFieldErrors({ ...payload.fieldErrors, form: 'Please fix the highlighted fields before submitting.' });
      setStepIndex(firstStepWithError(payload.fieldErrors));
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    try {
      const response = await fetch('/api/v1/public/questionnaire', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload.submission),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setFieldErrors(apiErrorsToFieldErrors(body));
        return;
      }
      setSuccess(body as SubmissionSuccess);
    } catch {
      setFieldErrors({ form: 'Could not submit the questionnaire. Check your connection and try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-lg border bg-background p-5 shadow-sm">
          <div className="mb-4 inline-flex rounded-md bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-5" aria-hidden />
          </div>
          <p className="eyebrow">Application received</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Lead reference {success.leadId}</h1>
          <p className="text-muted-foreground mt-3 text-sm leading-6">
            Your questionnaire is queued for review. Current stage: <span className="font-medium text-foreground">{success.stage}</span>.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-8">
      <aside className="rounded-lg border bg-background p-4 shadow-sm">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Public application</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">Company setup questionnaire</h1>
          </div>
          <div className="bg-primary/10 text-primary rounded-md p-2">
            <ClipboardList className="size-5" aria-hidden />
          </div>
        </div>

        <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
          <div className="bg-primary h-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="space-y-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const active = index === stepIndex;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => index < stepIndex && setStepIndex(index)}
                className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition ${
                  active ? 'border-primary bg-primary/5 text-foreground' : 'bg-background text-muted-foreground'
                }`}
              >
                <Icon className="size-4" aria-hidden />
                <span className="font-medium">{step.label}</span>
              </button>
            );
          })}
        </div>

        {hasEstimate ? (
          <div className="mt-5 rounded-md border border-border bg-card p-3 text-xs leading-5 text-muted-foreground">
            <div className="font-medium text-foreground">Estimator handoff</div>
            <div className="mt-1">Reference: {String(estimateData.reference ?? 'not provided')}</div>
          </div>
        ) : null}
      </aside>

      <form onSubmit={submit} className="rounded-lg border bg-background p-4 shadow-sm sm:p-5">
        {fieldErrors.form ? (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="size-4" aria-hidden />
            <AlertTitle>Submission issue</AlertTitle>
            <AlertDescription>{fieldErrors.form}</AlertDescription>
          </Alert>
        ) : null}

        {currentStep.id === 'contact' ? (
          <StepSection title="Contact details" description="Use at least one reachable contact channel.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" error={fieldErrors.fullName}>
                <Input value={answers.fullName} onChange={(event) => patch({ fullName: event.target.value })} autoComplete="name" />
              </Field>
              <Field label="Nationality" error={fieldErrors.nationality}>
                <Input value={answers.nationality} onChange={(event) => patch({ nationality: event.target.value })} autoComplete="country-name" />
              </Field>
              <Field label="Email" error={fieldErrors.email}>
                <Input type="email" value={answers.email} onChange={(event) => patch({ email: event.target.value })} autoComplete="email" />
              </Field>
              <Field label="Phone" error={fieldErrors.phone}>
                <Input value={answers.phone} onChange={(event) => patch({ phone: event.target.value })} autoComplete="tel" />
              </Field>
            </div>
          </StepSection>
        ) : null}

        {currentStep.id === 'business' ? (
          <StepSection title="Business details" description="Keep this concise enough for routing and document preparation.">
            <div className="grid gap-4">
              <Field label="Business activity" error={fieldErrors.activity}>
                <Input value={answers.activity} onChange={(event) => patch({ activity: event.target.value })} />
              </Field>
              <Field label="Preferred company names" error={fieldErrors.preferredNames}>
                <div className="grid gap-2">
                  {answers.preferredNames.map((name, index) => (
                    <div key={index} className="grid gap-2">
                      <Label className="text-muted-foreground text-xs">Option {index + 1}</Label>
                      <Input value={name} onChange={(event) => setPreferredName(index, event.target.value)} />
                    </div>
                  ))}
                </div>
              </Field>
              <Field label="Business summary" error={fieldErrors.businessSummary}>
                <Textarea value={answers.businessSummary} onChange={(event) => patch({ businessSummary: event.target.value })} rows={4} />
              </Field>
            </div>
          </StepSection>
        ) : null}

        {currentStep.id === 'setup' ? (
          <StepSection title="Setup preferences" description="Estimator values are prefilled when present in the URL.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Jurisdiction" error={fieldErrors.jurisdiction}>
                <Select value={answers.jurisdiction} onValueChange={(value) => patch({ jurisdiction: value as QuestionnaireAnswers['jurisdiction'] })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{JURISDICTION_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Authority" error={fieldErrors.authority}>
                <Input value={answers.authority} onChange={(event) => patch({ authority: event.target.value })} />
              </Field>
              <Field label="Document readiness" error={fieldErrors.documentReadiness}>
                <Select value={answers.documentReadiness} onValueChange={(value) => patch({ documentReadiness: value as QuestionnaireAnswers['documentReadiness'] })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{DOCUMENT_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <div className="mt-4 rounded-md border border-border bg-card p-3">
              <Label className="text-sm font-medium">Add-ons</Label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {ADD_ONS.map((addOn) => (
                  <label key={addOn.value} className="flex items-center gap-3 text-sm">
                    <Checkbox checked={answers.addOns.includes(addOn.value)} onCheckedChange={() => toggleAddOn(addOn.value)} />
                    {addOn.label}
                  </label>
                ))}
              </div>
            </div>
          </StepSection>
        ) : null}

        {currentStep.id === 'details' ? (
          <StepSection title="Ownership, visas, and office" description="Only the conditional fields needed for this setup are shown.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Shareholder count" error={fieldErrors.shareholderCount}>
                <Input min={1} max={50} type="number" value={answers.shareholderCount} onChange={(event) => patch({ shareholderCount: Number(event.target.value) })} />
              </Field>
              <Field label="Office type" error={fieldErrors.officeType}>
                <Select value={answers.officeType} onValueChange={(value) => patch({ officeType: value as QuestionnaireAnswers['officeType'] })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{OFFICE_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>

            {answers.shareholderCount > 1 ? (
              <Field label="Shareholder split" error={fieldErrors.shareholderSplitSummary} className="mt-4">
                <Textarea value={answers.shareholderSplitSummary} onChange={(event) => patch({ shareholderSplitSummary: event.target.value })} rows={3} />
              </Field>
            ) : null}

            <label className="mt-4 flex items-center gap-3 rounded-md border border-border bg-card p-3 text-sm">
              <Checkbox
                checked={showVisaInputs}
                onCheckedChange={(checked) => {
                  setShowVisaInputs(Boolean(checked));
                  if (!checked) patch({ investorVisaCount: 0, employeeVisaCount: 0, familyVisaCount: 0 });
                }}
              />
              Add residence visas to this setup
            </label>

            {showVisaInputs ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field label="Investor visas" error={fieldErrors.investorVisaCount}>
                  <Input min={0} max={200} type="number" value={answers.investorVisaCount} onChange={(event) => patch({ investorVisaCount: Number(event.target.value) })} />
                </Field>
                <Field label="Employee visas" error={fieldErrors.employeeVisaCount}>
                  <Input min={0} max={200} type="number" value={answers.employeeVisaCount} onChange={(event) => patch({ employeeVisaCount: Number(event.target.value) })} />
                </Field>
                <Field label="Family visas" error={fieldErrors.familyVisaCount}>
                  <Input min={0} max={200} type="number" value={answers.familyVisaCount} onChange={(event) => patch({ familyVisaCount: Number(event.target.value) })} />
                </Field>
              </div>
            ) : null}

            {answers.officeType !== 'none' ? (
              <Field label="Office notes" error={fieldErrors.officeAreaNotes} className="mt-4">
                <Textarea value={answers.officeAreaNotes} onChange={(event) => patch({ officeAreaNotes: event.target.value })} rows={3} />
              </Field>
            ) : null}
          </StepSection>
        ) : null}

        {currentStep.id === 'review' ? (
          <StepSection title="Review and submit" description="Confirm the summary before creating the anonymous lead.">
            <div className="overflow-hidden rounded-md border">
              {reviewRows.map(([label, value]) => (
                <div key={label} className="grid gap-1 border-b px-3 py-3 text-sm last:border-b-0 sm:grid-cols-[150px_1fr]">
                  <div className="text-muted-foreground">{label}</div>
                  <div className="font-medium">{value}</div>
                </div>
              ))}
            </div>
            <Field label="Additional notes" error={fieldErrors.notes} className="mt-4">
              <Textarea value={answers.notes} onChange={(event) => patch({ notes: event.target.value })} rows={4} />
            </Field>
          </StepSection>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={stepIndex === 0 || submitting}>
            <ArrowLeft aria-hidden />
            Back
          </Button>
          {currentStep.id === 'review' ? (
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
              {submitting ? 'Submitting...' : 'Submit questionnaire'}
            </Button>
          ) : (
            <Button type="button" onClick={goNext}>
              Continue
              <ArrowRight aria-hidden />
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

function StepSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-5">
        <p className="eyebrow">Questionnaire</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-2 text-sm">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`grid gap-2 ${className ?? ''}`}>
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

function requestedVisaCount(answers: Pick<QuestionnaireFormAnswers, 'investorVisaCount' | 'employeeVisaCount' | 'familyVisaCount'>): number {
  return Number(answers.investorVisaCount) + Number(answers.employeeVisaCount) + Number(answers.familyVisaCount);
}

function labelFor<T extends string>(options: readonly { value: T; label: string }[], value: T): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function pickStepErrors(
  errors: QuestionnaireFieldErrors,
  fields: (keyof QuestionnaireAnswers)[],
): QuestionnaireFieldErrors {
  return fields.reduce<QuestionnaireFieldErrors>((acc, field) => {
    if (errors[field]) acc[field] = errors[field];
    return acc;
  }, {});
}

function firstStepWithError(errors: QuestionnaireFieldErrors): number {
  const index = STEPS.findIndex((step) => step.fields.some((field) => errors[field]));
  return index === -1 ? STEPS.length - 1 : index;
}

function apiErrorsToFieldErrors(body: unknown): QuestionnaireFieldErrors {
  if (!body || typeof body !== 'object') return { form: 'Could not submit the questionnaire.' };
  const record = body as { message?: unknown; details?: { issues?: { path?: unknown[]; message?: unknown }[] } };
  const issues = record.details?.issues;
  if (!Array.isArray(issues)) {
    return { form: typeof record.message === 'string' ? record.message : 'Could not submit the questionnaire.' };
  }
  return issues.reduce<QuestionnaireFieldErrors>((acc, issue) => {
    const path = issue.path ?? [];
    const field = path[0] === 'answers' ? path[1] : path[0];
    if (typeof field === 'string' && typeof issue.message === 'string') {
      acc[field as keyof QuestionnaireAnswers] = issue.message;
    }
    return acc;
  }, {});
}
