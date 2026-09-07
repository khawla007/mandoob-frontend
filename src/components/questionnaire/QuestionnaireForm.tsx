'use client';

import Link from 'next/link';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  RotateCcw,
  Save,
} from 'lucide-react';
import {
  APPLICATION_DEFINITION,
  EMPTY_APPLICATION_DRAFT,
  createDemoApplicationAdapter,
  prepareApplicationCompletion,
  productionApplicationAdapter,
  reduceApplicationDraft,
  validateApplication,
  validateApplicationStep,
  type ApplicationActionState,
  type ApplicationDraft,
  type ApplicationDraftAction,
  type ApplicationStepId,
  type DemoApplicationOutcome,
  type EstimatorHandoffResult,
} from '@/lib/public-application';
import {
  clearApplicationDraft,
  loadApplicationDraft,
  saveApplicationDraft,
} from '@/lib/public-application/storage';
import {
  clearFilePreviewsAfterReset,
  selectPreviewFile,
  type FilePreviewState,
} from '@/lib/public-application/file-preview';

const SESSION_KEY = 'mandoob:p109:application-session';
const LOCAL_KEY = 'mandoob:p109:application-local';
const STEPS = [
  { id: 'contact', label: 'Contact' },
  { id: 'business', label: 'Business Details' },
  { id: 'setup', label: 'Setup' },
  { id: 'ownership', label: 'Ownership' },
  { id: 'review', label: 'Review' },
] as const;
const SETUP_SUBSTEPS = ['Jurisdiction', 'Authority', 'Visas', 'Office', 'Services'] as const;

export function QuestionnaireForm({
  handoff,
  demoOutcome,
}: {
  handoff: EstimatorHandoffResult;
  demoOutcome: DemoApplicationOutcome | null;
}) {
  const [draft, setDraft] = useState<ApplicationDraft>(() => draftFromHandoff(handoff));
  const [stepIndex, setStepIndex] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [action, setAction] = useState<ApplicationActionState>({ status: 'idle' });
  const [files, setFiles] = useState<FilePreviewState>({});
  const [notice, setNotice] = useState('Session draft is kept on this device for up to 24 hours.');
  const [localSave, setLocalSave] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const hydrated = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const current = STEPS[stepIndex];
  const validation = useMemo(() => validateApplication(draft, APPLICATION_DEFINITION), [draft]);
  const errors = attempted ? validation.errors.filter((e) => e.stepId === current.id) : [];

  useEffect(() => {
    const local = loadApplicationDraft({
      storage: window.localStorage,
      key: LOCAL_KEY,
      tier: 'local',
      definition: APPLICATION_DEFINITION,
    });
    const session = loadApplicationDraft({
      storage: window.sessionStorage,
      key: SESSION_KEY,
      tier: 'session',
      definition: APPLICATION_DEFINITION,
    });
    const loaded = session.status === 'loaded' ? session : local.status === 'loaded' ? local : null;
    if (loaded) {
      queueMicrotask(() => {
        setDraft({
          ...loaded.draft,
          confirmations: { informationIsTrue: false, dataProcessingConsent: false },
        });
        setLocalSave(local.status === 'loaded');
        setNotice(
          `Resumed a draft saved on this device at ${new Date(loaded.savedAt).toLocaleString()}. Confirmations must be renewed.`,
        );
      });
    }
    hydrated.current = true;
  }, []);
  useEffect(() => {
    if (!hydrated.current || action.status === 'confirmed-preview') return;
    const clean = {
      ...draft,
      confirmations: { informationIsTrue: false, dataProcessingConsent: false },
    };
    const session = saveApplicationDraft({
      storage: window.sessionStorage,
      key: SESSION_KEY,
      tier: 'session',
      draft: clean,
      definition: APPLICATION_DEFINITION,
    });
    void session;
    if (localSave) {
      const local = saveApplicationDraft({
        storage: window.localStorage,
        key: LOCAL_KEY,
        tier: 'local',
        draft: clean,
        definition: APPLICATION_DEFINITION,
      });
      void local;
    }
  }, [draft, localSave, action.status]);

  function update(change: ApplicationDraftAction) {
    setDraft((d) => reduceApplicationDraft(d, change, APPLICATION_DEFINITION));
    setAction({ status: 'idle' });
    setAttempted(false);
  }
  function moveTo(index: number) {
    if (index > stepIndex) {
      const check = validateApplicationStep(draft, current.id, APPLICATION_DEFINITION);
      if (check.status === 'invalid') {
        setAttempted(true);
        requestAnimationFrame(() => document.getElementById(check.firstInvalidControlId)?.focus());
        return;
      }
    }
    setAttempted(false);
    setStepIndex(index);
    requestAnimationFrame(() => headingRef.current?.focus());
  }
  async function complete(event: FormEvent) {
    event.preventDefault();
    const prepared = prepareApplicationCompletion(draft, APPLICATION_DEFINITION);
    if (prepared.status !== 'ready') {
      if (prepared.status === 'invalid') {
        setAttempted(true);
        const first = prepared.validation.errors[0];
        setStepIndex(STEPS.findIndex((x) => x.id === first.stepId));
        requestAnimationFrame(() => document.getElementById(first.fieldId)?.focus());
      } else
        setAction({
          status: 'unavailable',
          retryable: true,
          message: 'The application definition is unavailable. No application was sent.',
        });
      return;
    }
    setAction({ status: 'pending' });
    const adapter = demoOutcome
      ? createDemoApplicationAdapter(demoOutcome)
      : productionApplicationAdapter;
    const result = await adapter.complete(prepared.value);
    setAction(result);
    if (result.status === 'confirmed-preview') {
      clearApplicationDraft(window.sessionStorage, SESSION_KEY);
      clearApplicationDraft(window.localStorage, LOCAL_KEY);
      setFiles({});
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
  function reset() {
    clearApplicationDraft(window.sessionStorage, SESSION_KEY);
    clearApplicationDraft(window.localStorage, LOCAL_KEY);
    setDraft(draftFromHandoff(handoff));
    setFiles(clearFilePreviewsAfterReset(files));
    setAction({ status: 'idle' });
    setStepIndex(0);
    setLocalSave(false);
    setResetOpen(false);
    setNotice('Draft cleared from this device.');
  }

  if (action.status === 'confirmed-preview')
    return (
      <Confirmation
        action={action}
        onEdit={() => setAction({ status: 'idle' })}
        onReset={() => setResetOpen(true)}
        resetOpen={resetOpen}
        closeReset={() => setResetOpen(false)}
        reset={reset}
      />
    );
  return (
    <section
      className="application-workspace"
      id="application-workspace"
      aria-labelledby="application-title"
    >
      <header className="application-workspace__header">
        <div>
          <p className="eyebrow">Private application workspace</p>
          <h1 id="application-title">Prepare your Company setup application</h1>
          <p>Complete a local preview before online submission is connected.</p>
        </div>
        <button className="application-tool" type="button" onClick={() => setResetOpen(true)}>
          <RotateCcw aria-hidden /> Reset
        </button>
      </header>
      <div className="application-storage" role="status">
        <Save aria-hidden />
        <div>
          <strong>Your privacy, your choice</strong>
          <p>{notice} File names and file contents are never saved.</p>
        </div>
        <label>
          <input
            type="checkbox"
            checked={localSave}
            onChange={(e) => {
              setLocalSave(e.target.checked);
              if (e.target.checked)
                setNotice('Private local save is on. This draft expires after seven days.');
              if (!e.target.checked) {
                clearApplicationDraft(window.localStorage, LOCAL_KEY);
                setNotice('Seven-day local save is off and its copy has been cleared.');
              }
            }}
          />{' '}
          Save on this device for seven days
        </label>
      </div>
      {handoff.status === 'accepted' ? (
        <p className="application-handoff">
          Estimator choices applied · Reference {handoff.value.reference}
        </p>
      ) : null}
      <div className="application-workspace__grid">
        <nav className="application-rail" aria-label="Application stages">
          <ol>
            {STEPS.map((step, index) => {
              const active = index === stepIndex;
              const status = validation.steps[step.id];
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => index <= stepIndex && moveTo(index)}
                    disabled={index > stepIndex}
                    aria-current={active ? 'step' : undefined}
                  >
                    <span>{status === 'complete' ? <Check aria-hidden /> : index + 1}</span>
                    <span>
                      <strong>{step.label}</strong>
                      <small>
                        {active
                          ? 'Current stage'
                          : status === 'complete'
                            ? 'Complete'
                            : status === 'invalid'
                              ? 'Needs attention'
                              : 'Not started'}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p>No application is sent from this preview.</p>
        </nav>
        <form className="application-panel" onSubmit={complete} noValidate>
          <header>
            <p className="eyebrow">Stage {stepIndex + 1} of 5</p>
            <h2 ref={headingRef} tabIndex={-1}>
              {current.label}
            </h2>
            <p>{stepDescription(current.id)}</p>
          </header>
          {errors.length ? (
            <div className="application-errors" role="alert">
              <AlertCircle aria-hidden />
              <div>
                <strong>Check the highlighted information</strong>
                <ul>
                  {errors.map((e) => (
                    <li key={e.fieldId}>
                      <a href={e.href}>{e.message}</a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          {current.id === 'contact' ? (
            <ContactStep draft={draft} update={update} errors={errors} />
          ) : null}
          {current.id === 'business' ? (
            <BusinessStep draft={draft} update={update} errors={errors} />
          ) : null}
          {current.id === 'setup' ? (
            <SetupStep draft={draft} update={update} errors={errors} />
          ) : null}
          {current.id === 'ownership' ? (
            <OwnershipStep draft={draft} update={update} errors={errors} />
          ) : null}
          {current.id === 'review' ? (
            <ReviewStep
              draft={draft}
              update={update}
              errors={errors}
              files={files}
              setFiles={setFiles}
              onEdit={(id) => moveTo(STEPS.findIndex((s) => s.id === id))}
            />
          ) : null}
          {['duplicate', 'rate-limited', 'unavailable', 'error'].includes(action.status) ? (
            <div className="application-outcome" role="alert">
              <AlertCircle aria-hidden />
              <p>{'message' in action ? action.message : ''}</p>
            </div>
          ) : null}
          <footer className="application-actions">
            <button
              type="button"
              className="application-button application-button--secondary"
              disabled={stepIndex === 0 || action.status === 'pending'}
              onClick={() => moveTo(stepIndex - 1)}
            >
              <ChevronLeft aria-hidden /> Back
            </button>
            {stepIndex < 4 ? (
              <button
                type="button"
                className="application-button"
                onClick={() => moveTo(stepIndex + 1)}
              >
                Continue <ChevronRight aria-hidden />
              </button>
            ) : (
              <button
                className="application-button"
                type="submit"
                disabled={action.status === 'pending'}
              >
                {action.status === 'pending' ? 'Preparing preview…' : 'Complete local preview'}{' '}
                <CheckCircle2 aria-hidden />
              </button>
            )}
          </footer>
        </form>
      </div>
      {resetOpen ? <ResetDialog close={() => setResetOpen(false)} reset={reset} /> : null}
    </section>
  );
}

type Errors = ReturnType<typeof validateApplication>['errors'];
type StepProps = {
  draft: ApplicationDraft;
  update: (a: ApplicationDraftAction) => void;
  errors: Errors;
};
const errorFor = (errors: Errors, id: string) => errors.find((e) => e.fieldId === id)?.message;
const FieldContext = createContext({
  id: '',
  describedBy: undefined as string | undefined,
  invalid: false,
});
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const describedBy =
    [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="application-field">
      <label htmlFor={id}>{label}</label>
      {hint ? <p id={`${id}-hint`}>{hint}</p> : null}
      <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
        {children}
      </FieldContext.Provider>
      {error ? (
        <p className="application-field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const a = useContext(FieldContext);
  return (
    <input
      {...props}
      id={a.id}
      aria-describedby={a.describedBy}
      aria-invalid={a.invalid || undefined}
    />
  );
}
function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const a = useContext(FieldContext);
  return (
    <textarea
      {...props}
      id={a.id}
      aria-describedby={a.describedBy}
      aria-invalid={a.invalid || undefined}
    />
  );
}
function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const a = useContext(FieldContext);
  return (
    <select
      {...props}
      id={a.id}
      aria-describedby={a.describedBy}
      aria-invalid={a.invalid || undefined}
    />
  );
}

function ContactStep({ draft, update, errors }: StepProps) {
  return (
    <div className="application-fields application-fields--two">
      <Field
        id="application-full-name"
        label="Full name"
        hint="As shown on your passport."
        error={errorFor(errors, 'application-full-name')}
      >
        <TextInput
          autoComplete="name"
          value={draft.contact.fullName}
          onChange={(e) =>
            update({ type: 'set-contact-field', field: 'fullName', value: e.target.value })
          }
        />
      </Field>
      <Field
        id="application-nationality"
        label="Nationality"
        error={errorFor(errors, 'application-nationality')}
      >
        <TextInput
          autoComplete="country-name"
          value={draft.contact.nationality}
          onChange={(e) =>
            update({ type: 'set-contact-field', field: 'nationality', value: e.target.value })
          }
        />
      </Field>
      <Field
        id="application-email"
        label="Email address"
        hint="Provide email or phone."
        error={
          errorFor(errors, 'application-email') ?? errorFor(errors, 'application-contact-channel')
        }
      >
        <TextInput
          type="email"
          autoComplete="email"
          value={draft.contact.email}
          onChange={(e) =>
            update({ type: 'set-contact-field', field: 'email', value: e.target.value })
          }
        />
      </Field>
      <Field
        id="application-phone"
        label="Phone number"
        hint="Include the country code."
        error={errorFor(errors, 'application-phone')}
      >
        <TextInput
          type="tel"
          autoComplete="tel"
          value={draft.contact.phone}
          onChange={(e) =>
            update({ type: 'set-contact-field', field: 'phone', value: e.target.value })
          }
        />
      </Field>
    </div>
  );
}
function BusinessStep({ draft, update, errors }: StepProps) {
  return (
    <div className="application-fields">
      <Field
        id="application-activity"
        label="Business activity"
        error={errorFor(errors, 'application-activity')}
      >
        <NativeSelect
          value={draft.business.activityId ?? ''}
          onChange={(e) => update({ type: 'set-activity', value: e.target.value || null })}
        >
          <option value="">Select an activity</option>
          {APPLICATION_DEFINITION.activities.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <fieldset>
        <legend>Preferred Company names</legend>
        <p>Enter up to three choices, in preference order.</p>
        <div className="application-fields application-fields--three">
          {draft.business.preferredNames.map((name, index) => (
            <Field
              key={index}
              id={`application-company-name-${index + 1}`}
              label={`Choice ${index + 1}`}
              error={index === 0 ? errorFor(errors, 'application-company-name-1') : undefined}
            >
              <TextInput
                autoComplete="off"
                value={name}
                onChange={(e) =>
                  update({
                    type: 'set-preferred-name',
                    index: index as 0 | 1 | 2,
                    value: e.target.value,
                  })
                }
              />
            </Field>
          ))}
        </div>
      </fieldset>
      <Field
        id="application-business-summary"
        label="Business summary"
        hint="10–2,000 characters."
        error={errorFor(errors, 'application-business-summary')}
      >
        <TextArea
          rows={5}
          value={draft.business.summary}
          onChange={(e) => update({ type: 'set-business-summary', value: e.target.value })}
        />
      </Field>
    </div>
  );
}

function SetupStep({ draft, update, errors }: StepProps) {
  const authorities = APPLICATION_DEFINITION.authorities.filter(
    (x) => x.jurisdiction === draft.setup.jurisdiction,
  );
  const authority = authorities.find((x) => x.id === draft.setup.authorityId);
  return (
    <div className="application-setup">
      <ol className="application-substeps" aria-label="Setup details">
        {SETUP_SUBSTEPS.map((x, i) => (
          <li key={x}>
            <span>{i + 1}</span>
            {x}
          </li>
        ))}
      </ol>
      <Field
        id="application-jurisdiction"
        label="Jurisdiction"
        error={errorFor(errors, 'application-jurisdiction')}
      >
        <NativeSelect
          value={draft.setup.jurisdiction ?? ''}
          onChange={(e) =>
            update({
              type: 'set-jurisdiction',
              value: (e.target.value || null) as ApplicationDraft['setup']['jurisdiction'],
            })
          }
        >
          <option value="">Select a jurisdiction</option>
          {APPLICATION_DEFINITION.jurisdictions.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field
        id="application-authority"
        label="Authority"
        error={errorFor(errors, 'application-authority')}
      >
        <NativeSelect
          disabled={!draft.setup.jurisdiction}
          value={draft.setup.authorityId ?? ''}
          onChange={(e) => update({ type: 'set-authority', value: e.target.value || null })}
        >
          <option value="">Select an authority</option>
          {authorities.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field
        id="application-legal-structure"
        label="Legal structure"
        error={errorFor(errors, 'application-legal-structure')}
      >
        <NativeSelect
          disabled={!authority}
          value={draft.setup.legalStructureId ?? ''}
          onChange={(e) =>
            update({
              type: 'set-legal-structure',
              value: (e.target.value || null) as ApplicationDraft['setup']['legalStructureId'],
            })
          }
        >
          <option value="">Select a structure</option>
          {APPLICATION_DEFINITION.legalStructures
            .filter((x) => authority?.legalStructureIds.includes(x.id))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
        </NativeSelect>
      </Field>
      <fieldset id="application-visas-required">
        <legend>Are visas required?</legend>
        <div className="application-choice-row">
          <Choice
            checked={draft.visas.required === true}
            label="Yes"
            onChange={() => update({ type: 'set-visas-required', value: true })}
          />
          <Choice
            checked={draft.visas.required === false}
            label="No"
            onChange={() => update({ type: 'set-visas-required', value: false })}
          />
        </div>
        {errorFor(errors, 'application-visas-required') ? (
          <p className="application-field__error">
            {errorFor(errors, 'application-visas-required')}
          </p>
        ) : null}
      </fieldset>
      {draft.visas.required ? (
        <div className="application-fields application-fields--three">
          {(['investorCount', 'employeeCount', 'familyCount'] as const).map((field) => {
            const id = `application-${field.replace('Count', '-visas')}`;
            return (
              <Field
                key={field}
                id={id}
                label={field.replace('Count', ' visas')}
                error={errorFor(errors, id)}
              >
                <TextInput
                  inputMode="numeric"
                  value={draft.visas[field]}
                  onChange={(e) => update({ type: 'set-visa-count', field, value: e.target.value })}
                />
              </Field>
            );
          })}
        </div>
      ) : null}
      <Field
        id="application-office-type"
        label="Office requirement"
        error={errorFor(errors, 'application-office-type')}
      >
        <NativeSelect
          disabled={!authority}
          value={draft.setup.officeTypeId ?? ''}
          onChange={(e) =>
            update({
              type: 'set-office-type',
              value: (e.target.value || null) as ApplicationDraft['setup']['officeTypeId'],
            })
          }
        >
          <option value="">Select an office option</option>
          {APPLICATION_DEFINITION.officeTypes
            .filter((x) => authority?.officeTypeIds.includes(x.id))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
        </NativeSelect>
      </Field>
      {draft.setup.officeTypeId && draft.setup.officeTypeId !== 'none' ? (
        <Field
          id="application-office-notes"
          label="Office notes"
          error={errorFor(errors, 'application-office-notes')}
        >
          <TextArea
            rows={3}
            value={draft.setup.officeNotes}
            onChange={(e) => update({ type: 'set-office-notes', value: e.target.value })}
          />
        </Field>
      ) : null}
      <fieldset id="application-add-ons">
        <legend>Additional services</legend>
        <div className="application-card-grid">
          {APPLICATION_DEFINITION.addOns
            .filter((x) => authority?.addOnIds.includes(x.id))
            .map((x) => (
              <Choice
                key={x.id}
                checked={draft.setup.addOnIds.includes(x.id)}
                label={x.label}
                description={x.description}
                onChange={() =>
                  update({
                    type: 'set-add-ons',
                    value: draft.setup.addOnIds.includes(x.id)
                      ? draft.setup.addOnIds.filter((id) => id !== x.id)
                      : [...draft.setup.addOnIds, x.id],
                  })
                }
              />
            ))}
        </div>
      </fieldset>
    </div>
  );
}
function Choice({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description?: string;
  onChange: () => void;
}) {
  return (
    <label className="application-choice">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
}

function OwnershipStep({ draft, update, errors }: StepProps) {
  const authority = APPLICATION_DEFINITION.authorities.find(
    (x) => x.id === draft.setup.authorityId,
  );
  const total = draft.shareholders.reduce(
    (sum, row) => sum + (Number(row.ownershipBasisPoints) || 0),
    0,
  );
  return (
    <div className="application-fields">
      <Field
        id="application-shareholder-count"
        label="Number of shareholders"
        hint={
          authority
            ? `Allowed: ${authority.shareholderRange.min}–${authority.shareholderRange.max}`
            : undefined
        }
        error={errorFor(errors, 'application-shareholder-count')}
      >
        <TextInput
          type="number"
          min={authority?.shareholderRange.min ?? 1}
          max={authority?.shareholderRange.max ?? 10}
          value={draft.shareholders.length}
          onChange={(e) => update({ type: 'set-shareholder-count', value: Number(e.target.value) })}
        />
      </Field>
      {draft.shareholders.map((row, index) => (
        <fieldset className="application-shareholder" key={row.id}>
          <legend>Shareholder {index + 1}</legend>
          <div className="application-fields application-fields--three">
            <Field
              id={`application-${row.id}-full-name`}
              label="Full name"
              error={errorFor(errors, `application-${row.id}-full-name`)}
            >
              <TextInput
                autoComplete="name"
                value={row.fullName}
                onChange={(e) =>
                  update({
                    type: 'set-shareholder-field',
                    shareholderId: row.id,
                    field: 'fullName',
                    value: e.target.value,
                  })
                }
              />
            </Field>
            <Field
              id={`application-${row.id}-nationality`}
              label="Nationality"
              error={errorFor(errors, `application-${row.id}-nationality`)}
            >
              <TextInput
                autoComplete="country-name"
                value={row.nationality}
                onChange={(e) =>
                  update({
                    type: 'set-shareholder-field',
                    shareholderId: row.id,
                    field: 'nationality',
                    value: e.target.value,
                  })
                }
              />
            </Field>
            <Field
              id={`application-${row.id}-ownership`}
              label="Ownership percentage"
              hint="For example, 50.00"
              error={errorFor(errors, `application-${row.id}-ownership`)}
            >
              <TextInput
                inputMode="decimal"
                value={basisPointsToPercent(row.ownershipBasisPoints)}
                onChange={(e) =>
                  update({
                    type: 'set-shareholder-field',
                    shareholderId: row.id,
                    field: 'ownershipBasisPoints',
                    value: percentToBasisPoints(e.target.value),
                  })
                }
              />
            </Field>
          </div>
        </fieldset>
      ))}
      <div
        id="application-ownership-total"
        className={`application-total ${total === 10000 ? 'is-complete' : ''}`}
      >
        <span>Ownership total</span>
        <strong>{(total / 100).toFixed(2)}%</strong>
        <p>{total === 10000 ? 'Complete' : 'Must equal exactly 100.00%'}</p>
      </div>
    </div>
  );
}

function ReviewStep({
  draft,
  update,
  errors,
  files,
  setFiles,
  onEdit,
}: StepProps & {
  files: FilePreviewState;
  setFiles: (x: FilePreviewState) => void;
  onEdit: (id: ApplicationStepId) => void;
}) {
  const authority = APPLICATION_DEFINITION.authorities.find(
    (x) => x.id === draft.setup.authorityId,
  );
  const activity = APPLICATION_DEFINITION.activities.find(
    (x) => x.id === draft.business.activityId,
  );
  const docs = [
    { id: 'passport-copy:contact', label: 'Contact passport copy' },
    { id: 'activity-summary:business', label: 'Business plan or activity summary' },
    ...draft.shareholders.map((row, i) => ({
      id: `passport-copy:${row.id}`,
      label: `Shareholder ${i + 1} passport copy`,
    })),
  ];
  const pick = (id: string, e: ChangeEvent<HTMLInputElement>) => {
    const result = selectPreviewFile({
      state: files,
      controlId: id,
      files: [...(e.target.files ?? [])],
      definition: APPLICATION_DEFINITION,
      draft,
    });
    if (result.status === 'accepted') setFiles(result.state);
  };
  return (
    <div className="application-review">
      <ReviewCard title="Personal" onEdit={() => onEdit('contact')}>
        <p>
          {draft.contact.fullName} · {draft.contact.nationality}
        </p>
        <p>{draft.contact.email || draft.contact.phone}</p>
      </ReviewCard>
      <ReviewCard title="Business" onEdit={() => onEdit('business')}>
        <p>{activity?.label}</p>
        <p>{draft.business.preferredNames.filter(Boolean).join(' · ')}</p>
      </ReviewCard>
      <ReviewCard title="Setup & services" onEdit={() => onEdit('setup')}>
        <p>
          {authority?.label} · {draft.setup.legalStructureId} · {draft.setup.officeTypeId}
        </p>
        <p>{draft.setup.addOnIds.join(', ') || 'No additional services selected'}</p>
      </ReviewCard>
      <ReviewCard title="Ownership" onEdit={() => onEdit('ownership')}>
        <p>{draft.shareholders.length} shareholder(s) · 100.00% required</p>
      </ReviewCard>
      <section className="application-documents">
        <h3>Document readiness</h3>
        <p>
          Selecting a file only validates its name, format and size in memory. It is not read,
          uploaded or saved.
        </p>
        {docs.map((doc) => (
          <div key={doc.id} className="application-document">
            <FileText aria-hidden />
            <div>
              <strong>{doc.label}</strong>
              {files[doc.id] ? (
                <small>
                  {files[doc.id].displayName} · {(files[doc.id].sizeBytes / 1024).toFixed(0)} KB ·
                  cleared on refresh
                </small>
              ) : (
                <small>PDF, JPG or PNG · maximum 10 MB</small>
              )}
            </div>
            <select
              aria-label={`${doc.label} readiness`}
              value={draft.documentReadiness[doc.id] ?? 'not-ready'}
              onChange={(e) =>
                update({
                  type: 'set-document-readiness',
                  documentId: doc.id,
                  value: e.target.value as 'ready' | 'not-ready',
                })
              }
            >
              <option value="not-ready">Not ready</option>
              <option value="ready">Ready</option>
            </select>
            <label className="application-file-button">
              Preview file
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => pick(doc.id, e)}
              />
            </label>
          </div>
        ))}
      </section>
      <fieldset className="application-consents">
        <legend>Confirm before completing the preview</legend>
        <Choice
          checked={draft.confirmations.informationIsTrue}
          label="I confirm the information above is true and accurate."
          onChange={() =>
            update({
              type: 'set-confirmation',
              field: 'informationIsTrue',
              value: !draft.confirmations.informationIsTrue,
            })
          }
        />
        {errorFor(errors, 'application-information-confirmation') ? (
          <p className="application-field__error">
            {errorFor(errors, 'application-information-confirmation')}
          </p>
        ) : null}
        <Choice
          checked={draft.confirmations.dataProcessingConsent}
          label="I consent to Mandoob processing this information for the application preview."
          onChange={() =>
            update({
              type: 'set-confirmation',
              field: 'dataProcessingConsent',
              value: !draft.confirmations.dataProcessingConsent,
            })
          }
        />
        {errorFor(errors, 'application-data-consent') ? (
          <p className="application-field__error">{errorFor(errors, 'application-data-consent')}</p>
        ) : null}
        <p>
          Read the <Link href={APPLICATION_DEFINITION.legalLinks.privacy}>Privacy Notice</Link> and{' '}
          <Link href={APPLICATION_DEFINITION.legalLinks.terms}>Terms of Use</Link>.
        </p>
      </fieldset>
    </div>
  );
}
function ReviewCard({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className="application-review-card">
      <header>
        <h3>{title}</h3>
        <button type="button" onClick={onEdit}>
          Edit <span className="sr-only">{title}</span>
        </button>
      </header>
      {children}
    </section>
  );
}
function Confirmation({
  action,
  onEdit,
  onReset,
  resetOpen,
  closeReset,
  reset,
}: {
  action: Extract<ApplicationActionState, { status: 'confirmed-preview' }>;
  onEdit: () => void;
  onReset: () => void;
  resetOpen: boolean;
  closeReset: () => void;
  reset: () => void;
}) {
  const s = action.confirmation.summary;
  return (
    <section className="application-confirmation" aria-labelledby="application-confirmation-title">
      <aside>
        <CheckCircle2 aria-hidden />
        <p className="eyebrow">Local preview</p>
        <h2>Application stages complete</h2>
        <ol>
          {STEPS.map((x) => (
            <li key={x.id}>
              <Check aria-hidden />
              {x.label}
            </li>
          ))}
        </ol>
      </aside>
      <section className="application-confirmation__main">
        <div className="application-success-card">
          <CheckCircle2 aria-hidden />
          <p className="eyebrow">Preview ready</p>
          <h1 id="application-confirmation-title">Application preview complete</h1>
          <p className="application-reference">
            {action.confirmation.demoReference ?? 'Local preview'}
          </p>
          <strong>No application was sent to Mandoob.</strong>
          <p>
            Your information remains on this device only. Online submission is not connected yet.
          </p>
        </div>
        <section className="application-next">
          <h2>What happens next</h2>
          <ol>
            <li>
              <span>1</span>
              <strong>Review</strong>
              <p>Check your local summary.</p>
            </li>
            <li>
              <span>2</span>
              <strong>Prepare</strong>
              <p>Gather the listed documents.</p>
            </li>
            <li>
              <span>3</span>
              <strong>Connect</strong>
              <p>Wait for online submission to launch.</p>
            </li>
            <li>
              <span>4</span>
              <strong>Submit later</strong>
              <p>Return when sending is available.</p>
            </li>
          </ol>
        </section>
        <div className="application-actions">
          <button
            className="application-button application-button--secondary"
            type="button"
            onClick={onEdit}
          >
            Edit application
          </button>
          <button className="application-button" type="button" onClick={onReset}>
            Start over
          </button>
        </div>
      </section>
      <aside className="application-confirmation__summary">
        <p className="eyebrow">Derived summary</p>
        <h2>Your setup</h2>
        <dl>
          <div>
            <dt>Jurisdiction</dt>
            <dd>{s.jurisdiction}</dd>
          </div>
          <div>
            <dt>Authority</dt>
            <dd>{s.authorityId}</dd>
          </div>
          <div>
            <dt>Activity</dt>
            <dd>{s.activityId}</dd>
          </div>
          <div>
            <dt>Structure</dt>
            <dd>{s.legalStructureId}</dd>
          </div>
          <div>
            <dt>Shareholders</dt>
            <dd>{s.shareholderCount}</dd>
          </div>
          <div>
            <dt>Visas</dt>
            <dd>{s.visaCount}</dd>
          </div>
          <div>
            <dt>Documents ready</dt>
            <dd>{s.readyDocumentCount}</dd>
          </div>
        </dl>
      </aside>
      {resetOpen ? <ResetDialog close={closeReset} reset={reset} /> : null}
    </section>
  );
}
function ResetDialog({ close, reset }: { close: () => void; reset: () => void }) {
  return (
    <div
      className="application-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="application-reset-title"
        className="application-dialog"
      >
        <h2 id="application-reset-title">Start over?</h2>
        <p>
          This clears the session draft, seven-day local draft, and all in-memory file previews from
          this device.
        </p>
        <div>
          <button
            className="application-button application-button--secondary"
            type="button"
            onClick={close}
          >
            Keep draft
          </button>
          <button className="application-button" type="button" onClick={reset}>
            Start over
          </button>
        </div>
      </section>
    </div>
  );
}

function draftFromHandoff(handoff: EstimatorHandoffResult): ApplicationDraft {
  let draft = structuredClone(EMPTY_APPLICATION_DRAFT);
  if (handoff.status === 'rejected') return draft;
  const h = handoff.value;
  draft = reduceApplicationDraft(
    draft,
    { type: 'set-jurisdiction', value: h.jurisdiction },
    APPLICATION_DEFINITION,
  );
  draft = reduceApplicationDraft(
    draft,
    { type: 'set-authority', value: h.authorityId },
    APPLICATION_DEFINITION,
  );
  draft = reduceApplicationDraft(
    draft,
    { type: 'set-activity', value: h.activityId },
    APPLICATION_DEFINITION,
  );
  draft = reduceApplicationDraft(
    draft,
    { type: 'set-legal-structure', value: h.legalStructureId },
    APPLICATION_DEFINITION,
  );
  draft = reduceApplicationDraft(
    draft,
    { type: 'set-office-type', value: h.officeTypeId },
    APPLICATION_DEFINITION,
  );
  draft = reduceApplicationDraft(
    draft,
    { type: 'set-add-ons', value: h.addOnIds },
    APPLICATION_DEFINITION,
  );
  draft = reduceApplicationDraft(
    draft,
    { type: 'set-shareholder-count', value: h.shareholderCount },
    APPLICATION_DEFINITION,
  );
  return { ...draft, visas: { ...draft.visas, estimatorTotalSuggestion: h.visaTotalSuggestion } };
}
function stepDescription(id: ApplicationStepId) {
  return {
    contact: 'How may Mandoob identify and contact you?',
    business: 'Tell us what the Company will do and its preferred names.',
    setup: 'Choose compatible setup details in order.',
    ownership: 'Add each individual shareholder and allocate exactly 100.00%.',
    review: 'Review every section, preview document readiness, and confirm your choices.',
  }[id];
}
function percentToBasisPoints(value: string) {
  if (!/^\d{0,3}(?:\.\d{0,2})?$/.test(value)) return value;
  if (value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n * 100)) : value;
}
function basisPointsToPercent(value: string) {
  if (value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? (n / 100).toFixed(2).replace(/\.00$/, '') : value;
}
