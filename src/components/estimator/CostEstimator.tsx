'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  Clock3,
  CircleAlert,
  FileCheck2,
  FileDown,
  FileText,
  FilePenLine,
  Globe2,
  Headset,
  Info,
  KeyRound,
  Landmark,
  Laptop,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  Store,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  calculateCatalogEstimate,
  NoMatchingEstimatorDataError,
  UnsupportedEstimatorCombinationError,
} from '@/lib/estimator/public-catalog';
import {
  applyDraftChange,
  buildEstimatorApplyHref,
  EMPTY_ESTIMATOR_DRAFT,
  getSelectedAuthority,
  validateEstimatorDraft,
  type EstimatorDraftField,
} from '@/lib/estimator/public-draft';
import {
  ESTIMATOR_DRAFT_STORAGE_KEY,
  parseSavedEstimatorDraft,
  serializeEstimatorDraft,
} from '@/lib/estimator/public-storage';
import type {
  EstimatorActionState,
  EstimatorCatalog,
  EstimatorDraft,
  EstimatorResult,
  EstimatorSourceState,
  EstimatorValidationError,
} from '@/lib/estimator/public-contracts';

/**
 * Nine wizard steps shown in the vertical step rail. Steps 1–8 map one-to-one to
 * the validation steps from `validateEstimatorDraft`; step 9 is the review.
 */
const STEPS = [
  { id: 'jurisdiction', label: 'Jurisdiction', hint: 'Choose your jurisdiction' },
  { id: 'authority', label: 'Emirate / Free Zone', hint: 'Select your location' },
  { id: 'activity', label: 'Business activity', hint: 'Choose your activity' },
  { id: 'legal', label: 'Legal structure', hint: 'Select legal structure' },
  { id: 'shareholders', label: 'Shareholders', hint: 'Number of shareholders' },
  { id: 'visas', label: 'Visas', hint: 'Select visa requirements' },
  { id: 'office', label: 'Office', hint: 'Choose office type' },
  { id: 'addons', label: 'Add-ons', hint: 'Additional services' },
  { id: 'review', label: 'Review estimate', hint: 'Check selections and calculate' },
] as const;

const LAST_STEP = STEPS.length;

/** Inclusions listed in the summary card (design HTML copy). */
const ESTIMATE_INCLUSIONS = [
  'Company registration',
  'Trade licence',
  'Memorandum of Association',
  'Lease agreement (Ejari)',
  'Establishment card',
  'PRO services',
  'Investor visa processing',
  'Bank account assistance',
  'VAT registration',
] as const;

/** Field focused for each validation step (index + 1 = step). */
const STEP_FIELDS = [
  'estimate-jurisdiction',
  'estimate-authority',
  'estimate-activity',
  'estimate-legal-structure',
  'estimate-shareholders',
  'estimate-visas',
  'estimate-office',
  'estimate-addons',
] as const;

type SectionState = 'completed' | 'current' | 'pending' | 'error';

const JURISDICTION_ICONS: Record<string, LucideIcon> = {
  mainland: Landmark,
  free_zone: Store,
  offshore: Globe2,
};

const OFFICE_ICONS: Record<string, LucideIcon> = {
  none: ShieldCheck,
  flexi: KeyRound,
  virtual: Laptop,
  physical: Building2,
};

type Props = {
  source: EstimatorSourceState;
  initialDraft: EstimatorDraft;
};

const idleAction: EstimatorActionState = { status: 'idle' };

export function CostEstimator({ source, initialDraft }: Props) {
  if (source.status !== 'ready' && source.status !== 'indicative-demo') {
    return <UnavailableWorkspace source={source} />;
  }
  return <ReadyEstimator catalog={source.catalog} initialDraft={initialDraft} />;
}

function ReadyEstimator({
  catalog,
  initialDraft,
}: {
  catalog: EstimatorCatalog;
  initialDraft: EstimatorDraft;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [errors, setErrors] = useState<EstimatorValidationError[]>([]);
  const [result, setResult] = useState<EstimatorResult | null>(null);
  const [calculateState, setCalculateState] = useState<EstimatorActionState>(idleAction);
  const [storageState, setStorageState] = useState<EstimatorActionState>(idleAction);
  const [restoreCandidate, setRestoreCandidate] = useState<{
    draft: EstimatorDraft;
    savedAt: string;
  } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const resetCancelRef = useRef<HTMLButtonElement>(null);

  const authority = getSelectedAuthority(draft, catalog);
  const liveValidation = useMemo(() => validateEstimatorDraft(draft, catalog), [draft, catalog]);
  const authorities = catalog.authorities.filter(
    (item) => item.jurisdiction === draft.jurisdiction,
  );
  const activities = catalog.activities.filter((item) => authority?.activityIds.includes(item.id));
  const legalStructures = catalog.legalStructures.filter((item) =>
    authority?.legalStructureIds.includes(item.id),
  );
  const officeTypes = catalog.officeTypes.filter((item) =>
    authority?.officeTypeIds.includes(item.id),
  );
  const addOns = catalog.addOns.filter((item) => authority?.addOnIds.includes(item.id));
  const [currentStep, setCurrentStep] = useState(1);
  const [focusRequest, setFocusRequest] = useState<{ id: string; at: number } | null>(null);
  const stepStates = STEPS.map((_, index) =>
    stepState(index + 1, currentStep, liveValidation.errors, errors, result !== null),
  );
  const activeStep = STEPS[currentStep - 1];

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(ESTIMATOR_DRAFT_STORAGE_KEY);
        if (!raw) return;
        const saved = parseSavedEstimatorDraft(raw, catalog);
        if (saved.status === 'ready') {
          setRestoreCandidate({ draft: saved.draft, savedAt: saved.savedAt });
          return;
        }
        window.localStorage.removeItem(ESTIMATOR_DRAFT_STORAGE_KEY);
        const message =
          saved.status === 'expired'
            ? 'The saved draft expired after 30 days and was cleared.'
            : saved.status === 'incompatible'
              ? 'The saved draft used an incompatible catalog version and was cleared.'
              : 'The saved draft was invalid and was cleared safely.';
        setStorageState({ status: 'error', message });
      } catch {
        setStorageState({
          status: 'unavailable',
          message: 'Local storage is unavailable in this browser. Your current draft remains open.',
        });
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [catalog]);

  useEffect(() => {
    if (result) resultHeadingRef.current?.focus({ preventScroll: true });
  }, [result]);

  useEffect(() => {
    if (resetOpen) resetCancelRef.current?.focus();
  }, [resetOpen]);

  // Focus runs after the requested step has rendered its fields.
  useEffect(() => {
    if (!focusRequest) return;
    const target = document.getElementById(focusRequest.id);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target?.focus({ preventScroll: true });
  }, [focusRequest]);

  function change<K extends EstimatorDraftField>(field: K, value: EstimatorDraft[K]) {
    const next = applyDraftChange(draft, field, value, catalog);
    setDraft(next);
    setResult(null);
    setCalculateState(idleAction);
    setErrors((current) => current.filter((error) => error.fieldId !== fieldIdFor(field)));
  }

  function focusField(fieldId: string) {
    const step = STEP_FIELDS.indexOf(fieldId as (typeof STEP_FIELDS)[number]) + 1;
    if (step > 0) setCurrentStep(step);
    setFocusRequest((previous) => ({ id: fieldId, at: (previous?.at ?? 0) + 1 }));
  }

  function goToStep(step: number) {
    setCurrentStep(step);
    const id = `estimate-section-${STEPS[step - 1].id}-heading`;
    setFocusRequest((previous) => ({ id, at: (previous?.at ?? 0) + 1 }));
  }

  function nextStep() {
    const stepErrors = liveValidation.errors.filter((error) => error.step === currentStep);
    setErrors((current) => [
      ...current.filter((error) => error.step !== currentStep),
      ...stepErrors,
    ]);
    if (stepErrors.length) {
      focusField(stepErrors[0].fieldId);
      return;
    }
    goToStep(Math.min(LAST_STEP, currentStep + 1));
  }

  function calculate() {
    if (calculateState.status === 'pending') return;
    const validation = validateEstimatorDraft(draft, catalog);
    if (!validation.valid) {
      setErrors(validation.errors);
      setCalculateState({
        status: 'error',
        message: 'Review the highlighted fields before calculating.',
      });
      focusField(validation.errors[0].fieldId);
      return;
    }

    setErrors([]);
    setCalculateState({ status: 'pending', message: 'Calculating your indicative estimate…' });
    window.setTimeout(() => {
      try {
        const nextResult = calculateCatalogEstimate(catalog, draft);
        setResult(nextResult);
        setCalculateState({ status: 'success', message: 'Indicative estimate calculated.' });
      } catch (error) {
        if (error instanceof NoMatchingEstimatorDataError) {
          setCalculateState({
            status: 'error',
            message:
              'No complete cost data matches this combination. Edit your choices or view contact options.',
          });
        } else if (error instanceof UnsupportedEstimatorCombinationError) {
          setCalculateState({
            status: 'error',
            message: 'This combination is unsupported. Review your selections.',
          });
        } else {
          setCalculateState({
            status: 'error',
            message: 'The estimate could not be calculated safely. Your selections were preserved.',
          });
        }
      }
    }, 350);
  }

  function saveDraft() {
    setStorageState({ status: 'pending', message: 'Saving on this device…' });
    try {
      window.localStorage.setItem(
        ESTIMATOR_DRAFT_STORAGE_KEY,
        serializeEstimatorDraft(draft, catalog.version),
      );
      setStorageState({
        status: 'success',
        message: 'Saved on this device for up to 30 days. It is not synced or submitted.',
      });
    } catch {
      setStorageState({
        status: 'unavailable',
        message: 'Local storage is unavailable. Your current draft remains open but is not saved.',
      });
    }
  }

  function restoreDraft() {
    if (!restoreCandidate) return;
    setDraft(restoreCandidate.draft);
    setResult(null);
    setErrors([]);
    setCalculateState(idleAction);
    setStorageState({
      status: 'success',
      message: 'Saved draft restored. Recalculate after review.',
    });
    setRestoreCandidate(null);
  }

  function clearSavedDraft() {
    try {
      window.localStorage.removeItem(ESTIMATOR_DRAFT_STORAGE_KEY);
      setRestoreCandidate(null);
      setStorageState({
        status: 'success',
        message: 'Saved draft cleared. Current selections are unchanged.',
      });
    } catch {
      setStorageState({
        status: 'unavailable',
        message: 'The saved draft could not be cleared in this browser.',
      });
    }
  }

  function resetEstimator() {
    try {
      window.localStorage.removeItem(ESTIMATOR_DRAFT_STORAGE_KEY);
    } catch {
      // Reset remains local and deterministic even when browser storage is blocked.
    }
    setDraft(EMPTY_ESTIMATOR_DRAFT);
    setErrors([]);
    setResult(null);
    setCalculateState(idleAction);
    setStorageState({ status: 'success', message: 'Estimator and saved draft reset.' });
    setRestoreCandidate(null);
    setResetOpen(false);
    focusField('estimate-jurisdiction');
  }

  function closeResetDialog() {
    setResetOpen(false);
    window.requestAnimationFrame(() => resetTriggerRef.current?.focus());
  }

  const visaRange = authority?.visaRange;
  const shareholderRange = authority?.shareholderRange;

  const selectedLabel = (collection: Array<{ id: string; label: string }>, id: string | null) =>
    collection.find((item) => item.id === id)?.label;
  const summaryMeta = [
    selectedLabel(catalog.jurisdictions, draft.jurisdiction),
    authority?.emirate ? humanize(authority.emirate) : authority?.label,
    selectedLabel(catalog.legalStructures, draft.legalStructureId),
  ].filter((item): item is string => Boolean(item));
  const oneTimeItems = result?.lineItems.filter((item) => item.recurrence === 'one_time');
  const stepSelections = [
    selectedLabel(catalog.jurisdictions, draft.jurisdiction),
    authority?.label,
    selectedLabel(catalog.activities, draft.activityId),
    selectedLabel(catalog.legalStructures, draft.legalStructureId),
    draft.shareholderCount || undefined,
    draft.visaCount || undefined,
    selectedLabel(catalog.officeTypes, draft.officeTypeId),
    draft.addOnIds.length
      ? draft.addOnIds.map((id) => selectedLabel(catalog.addOns, id) ?? id).join(', ')
      : undefined,
    result ? 'Estimate calculated' : undefined,
  ];

  return (
    <section
      id="estimator-workspace"
      className="estimator-workspace"
      aria-labelledby="estimator-workspace-title"
    >
      <div className="container">
        <div className="estimator-layout">
          <div className="estimator-main">
            {restoreCandidate ? (
              <div className="estimator-restore" role="status">
                <div>
                  <strong>Saved draft available</strong>
                  <p>
                    Saved on this device {formatDate(restoreCandidate.savedAt)}. Restoring will
                    replace the current unsaved selections.
                  </p>
                </div>
                <div>
                  <button type="button" className="btn btn--accent btn--sm" onClick={restoreDraft}>
                    Restore
                  </button>
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => setRestoreCandidate(null)}
                  >
                    Not now
                  </button>
                </div>
              </div>
            ) : null}

            {storageState.message ? (
              <p
                className={`estimator-status estimator-status--${storageState.status}`}
                role="status"
                aria-live="polite"
              >
                {storageState.message}
                {storageState.status === 'success' ? (
                  <button type="button" onClick={clearSavedDraft}>
                    Clear saved draft
                  </button>
                ) : null}
              </p>
            ) : null}

            <div className="estimator-card">
              <header className="estimator-card__head">
                <h2 id="estimator-workspace-title">Estimate Your Business Setup Cost</h2>
                <span aria-live="polite">
                  Step {currentStep} of {LAST_STEP}
                </span>
              </header>

              <div className="estimator-wizard">
                <nav className="estimator-steps" aria-label="Estimator steps">
                  <ol>
                    {STEPS.map((step, index) => {
                      const state = stepStates[index];
                      return (
                        <li key={step.id} data-step-state={state}>
                          <button
                            type="button"
                            onClick={() => goToStep(index + 1)}
                            aria-current={state === 'current' ? 'step' : undefined}
                          >
                            <span className="estimator-steps__number" aria-hidden="true">
                              {state === 'completed' ? <Check /> : index + 1}
                            </span>
                            <span className="estimator-steps__text">
                              <span className="estimator-steps__label">{step.label}</span>
                              <span className="estimator-steps__hint">{step.hint}</span>
                            </span>
                            <span className="sr-only">, {statusLabel(state)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </nav>

                <form
                  id="estimator-form"
                  className="estimator-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    calculate();
                  }}
                  noValidate
                >
                  {calculateState.status === 'error' && errors.length > 0 ? (
                    <div
                      className="estimator-error-summary"
                      role="alert"
                      aria-labelledby="estimate-errors-title"
                    >
                      <h3 id="estimate-errors-title">Review these fields</h3>
                      <ul>
                        {errors.map((error) => (
                          <li key={`${error.step}-${error.fieldId}`}>
                            <button type="button" onClick={() => focusField(error.fieldId)}>
                              {error.message}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <section
                    id={`estimate-section-${activeStep.id}`}
                    className="estimator-section"
                    data-step-state={stepStates[currentStep - 1]}
                    aria-labelledby={`estimate-section-${activeStep.id}-heading`}
                  >
                    <p className="estimator-step-notice">
                      <Info aria-hidden="true" />
                      <span>
                        {currentStep === 1
                          ? 'Select your jurisdiction to get started'
                          : `${activeStep.hint} to continue`}
                      </span>
                    </p>
                    <h3 id={`estimate-section-${activeStep.id}-heading`} tabIndex={-1}>
                      {currentStep}. {activeStep.label}
                    </h3>
                    <p className="estimator-section__hint">
                      {currentStep === 1
                        ? 'Select the type of company you want to set up in the UAE.'
                        : 'Update this step, then continue to the next section.'}
                    </p>

                    {currentStep === 1 ? (
                      <fieldset
                        id="estimate-jurisdiction"
                        tabIndex={-1}
                        className="estimator-choice-fieldset"
                        aria-describedby="estimate-jurisdiction-error"
                        aria-invalid={hasError(errors, 'estimate-jurisdiction')}
                      >
                        <legend>
                          Business jurisdiction <Required />
                        </legend>
                        <div className="estimator-choice-grid estimator-choice-grid--three">
                          {catalog.jurisdictions.map((item) => (
                            <ChoiceCard
                              key={item.id}
                              name="jurisdiction"
                              value={item.id}
                              checked={draft.jurisdiction === item.id}
                              label={item.label}
                              description={item.description}
                              icon={JURISDICTION_ICONS[item.id] ?? Landmark}
                              onChange={() => change('jurisdiction', item.id)}
                            />
                          ))}
                        </div>
                        <FieldError errors={errors} fieldId="estimate-jurisdiction" />
                      </fieldset>
                    ) : null}
                    {currentStep === 1 ? (
                      <p className="estimator-compare-notice">
                        <Info aria-hidden="true" />
                        <span>
                          Not sure which jurisdiction is right for you?{' '}
                          <Link href="/business-registration">
                            Compare Jurisdictions <ArrowRight aria-hidden="true" />
                          </Link>
                        </span>
                      </p>
                    ) : null}

                    {currentStep === 2 ? (
                      <SelectField
                        id="estimate-authority"
                        label={
                          draft.jurisdiction === 'mainland'
                            ? 'Preferred emirate / authority'
                            : draft.jurisdiction === 'free_zone'
                              ? 'Preferred free zone'
                              : draft.jurisdiction === 'offshore'
                                ? 'Offshore authority'
                                : 'Preferred emirate / free zone'
                        }
                        placeholder={
                          draft.jurisdiction ? 'Select an authority' : 'Choose a jurisdiction first'
                        }
                        value={draft.authorityId}
                        disabled={!draft.jurisdiction}
                        options={authorities.map((item) => ({
                          id: item.id,
                          label: item.emirate
                            ? `${item.label} · ${humanize(item.emirate)}`
                            : item.label,
                        }))}
                        errors={errors}
                        onChange={(id) => change('authorityId', id)}
                      />
                    ) : null}

                    {currentStep === 3 ? (
                      <SelectField
                        id="estimate-activity"
                        label="Business activity"
                        placeholder={
                          authority ? 'Select business activity' : 'Choose an authority first'
                        }
                        value={draft.activityId}
                        disabled={!authority}
                        options={activities.map((item) => ({
                          id: item.id,
                          label: `${item.label} · ${item.code}`,
                        }))}
                        help="Exact activity naming and external approvals need authority confirmation."
                        errors={errors}
                        onChange={(id) => change('activityId', id)}
                      />
                    ) : null}

                    {currentStep === 4 ? (
                      <SelectField
                        id="estimate-legal-structure"
                        label="Business legal structure"
                        placeholder={
                          authority ? 'Select legal structure' : 'Choose an authority first'
                        }
                        value={draft.legalStructureId}
                        disabled={!authority}
                        options={legalStructures}
                        help="Descriptions are planning context, not legal advice."
                        errors={errors}
                        onChange={(id) =>
                          change('legalStructureId', id as EstimatorDraft['legalStructureId'])
                        }
                      />
                    ) : null}

                    {currentStep === 5 ? (
                      <CountField
                        id="estimate-shareholders"
                        label="Number of shareholders"
                        value={draft.shareholderCount}
                        range={shareholderRange}
                        errors={errors}
                        onChange={(value) => change('shareholderCount', value)}
                      />
                    ) : null}

                    {currentStep === 6 ? (
                      <>
                        <CountField
                          id="estimate-visas"
                          label="Number of visas required"
                          value={draft.visaCount}
                          range={visaRange}
                          errors={errors}
                          onChange={(value) => change('visaCount', value)}
                        />
                        <p className="estimator-inline-note">
                          <Info aria-hidden="true" />
                          Visa cost may vary based on visa type, medical, Emirates ID, and
                          processing fees. Eligibility and quota depend on the setup, workspace, and
                          approvals.
                        </p>
                      </>
                    ) : null}

                    {currentStep === 7 ? (
                      <fieldset
                        id="estimate-office"
                        tabIndex={-1}
                        className="estimator-choice-fieldset"
                        aria-describedby="estimate-office-help estimate-office-error"
                        aria-invalid={hasError(errors, 'estimate-office')}
                      >
                        <legend>
                          Office requirement <Required />
                        </legend>
                        {officeTypes.length ? (
                          <div className="estimator-choice-grid estimator-choice-grid--three">
                            {officeTypes.map((item) => (
                              <ChoiceCard
                                key={item.id}
                                name="office"
                                value={item.id}
                                checked={draft.officeTypeId === item.id}
                                label={item.label}
                                description={item.description}
                                icon={OFFICE_ICONS[item.id] ?? Building2}
                                onChange={() => change('officeTypeId', item.id)}
                              />
                            ))}
                          </div>
                        ) : (
                          <NoOptions
                            title="Choose an authority first"
                            body="Office options depend on the selected authority."
                          />
                        )}
                        <p id="estimate-office-help" className="estimator-help">
                          Lease, workspace, size, and visa requirements vary by authority and
                          activity.
                        </p>
                        <FieldError errors={errors} fieldId="estimate-office" />
                      </fieldset>
                    ) : null}

                    {currentStep === 8 ? (
                      <fieldset
                        id="estimate-addons"
                        tabIndex={-1}
                        className="estimator-choice-fieldset"
                        aria-describedby="estimate-addons-help estimate-addons-error"
                        aria-invalid={hasError(errors, 'estimate-addons')}
                      >
                        <legend>Additional services (optional)</legend>
                        {addOns.length ? (
                          <div className="estimator-addon-grid">
                            {addOns.map((item) => {
                              const checked = draft.addOnIds.includes(item.id);
                              return (
                                <label key={item.id} data-selected={checked}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      change(
                                        'addOnIds',
                                        checked
                                          ? draft.addOnIds.filter((id) => id !== item.id)
                                          : [...draft.addOnIds, item.id],
                                      )
                                    }
                                  />
                                  <span>
                                    <strong>{item.label}</strong>
                                    <small>{item.description}</small>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <NoOptions
                            title="No optional services yet"
                            body="Optional services appear after you choose an authority."
                          />
                        )}
                        <p id="estimate-addons-help" className="estimator-help">
                          Assistance does not guarantee a bank, tax, attestation, or other external
                          outcome.
                        </p>
                        <FieldError errors={errors} fieldId="estimate-addons" />
                      </fieldset>
                    ) : null}

                    {currentStep === LAST_STEP ? (
                      <>
                        <dl className="estimator-review">
                          {summaryRows(draft, catalog).map((row) => (
                            <div key={row.label}>
                              <dt>{row.label}</dt>
                              <dd>{row.value}</dd>
                            </div>
                          ))}
                        </dl>
                        <div className="estimator-review__assumptions">
                          <strong>Confirm before relying on the result</strong>
                          <ul>
                            {catalog.assumptions.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </>
                    ) : null}
                  </section>

                  <div className="estimator-form__actions">
                    {currentStep > 1 ? (
                      <button
                        type="button"
                        className="btn btn--outline"
                        onClick={() => goToStep(currentStep - 1)}
                      >
                        <ArrowLeft aria-hidden="true" /> Back
                      </button>
                    ) : null}
                    <span className="estimator-form__spacer" />
                    {currentStep === LAST_STEP ? (
                      <button
                        type="submit"
                        className="btn btn--accent"
                        disabled={calculateState.status === 'pending'}
                      >
                        {calculateState.status === 'pending'
                          ? 'Calculating…'
                          : 'Calculate indicative estimate'}
                      </button>
                    ) : (
                      <button type="button" className="btn btn--accent" onClick={nextStep}>
                        Next Step <ArrowRight aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {calculateState.message ? (
                    <p
                      className={`estimator-status estimator-status--${calculateState.status}`}
                      aria-live="polite"
                      role="status"
                    >
                      {calculateState.message}
                    </p>
                  ) : null}

                  <ol className="estimator-accordion" aria-label="All estimator steps">
                    {STEPS.map((step, index) => {
                      const open = index + 1 === currentStep;
                      return (
                        <li
                          key={step.id}
                          className="estimator-accordion__item"
                          data-open={open ? 'true' : undefined}
                        >
                          <button
                            type="button"
                            className="estimator-accordion__trigger"
                            aria-expanded={open}
                            aria-controls={`estimator-accordion-${step.id}`}
                            onClick={() => goToStep(index + 1)}
                          >
                            <span className="estimator-accordion__num" aria-hidden="true">
                              {index + 1}
                            </span>
                            <span className="estimator-accordion__text">
                              <strong>
                                {index + 1}. {step.label}
                              </strong>
                              <small>{step.hint}</small>
                            </span>
                            <ChevronDown aria-hidden="true" />
                          </button>
                          <div
                            id={`estimator-accordion-${step.id}`}
                            className="estimator-accordion__panel"
                            role="region"
                            aria-label={step.label}
                          >
                            <div className="estimator-accordion__body">
                              {open ? (
                                'This step is currently open above.'
                              ) : (
                                <>
                                  Your selection:{' '}
                                  <strong>{stepSelections[index] ?? 'Not selected'}</strong>
                                </>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </form>
              </div>
            </div>

            {result ? <EstimateResultView result={result} catalog={catalog} /> : null}
          </div>

          <aside className="estimator-sidebar" aria-label="Estimate summary">
            <div
              className="estimator-summary-card"
              role="region"
              aria-labelledby="estimate-result-heading"
            >
              <div className="estimator-summary-card__head">
                <div>
                  <h2 id="estimate-result-heading" ref={resultHeadingRef} tabIndex={-1}>
                    Your Estimated Cost
                  </h2>
                </div>
                <button
                  type="button"
                  className="estimator-summary-card__edit"
                  onClick={() => goToStep(1)}
                >
                  <FilePenLine aria-hidden="true" /> Edit
                </button>
              </div>

              <div className="estimator-summary-card__total">
                <strong>{result ? formatAed(result.oneTimeTotalMinor) : 'AED —'}</strong>
                <span>Total One-time Setup Cost</span>
                <p className="estimator-summary-card__meta">
                  {summaryMeta.length ? summaryMeta.join(' • ') : 'No selections yet'}
                </p>
                {result ? null : <small>Complete the steps and calculate to see your total.</small>}
              </div>

              {oneTimeItems ? (
                <dl className="estimator-summary-card__items">
                  {oneTimeItems.map((item) => (
                    <div key={item.id}>
                      <dt>
                        <FileText aria-hidden="true" />
                        {item.label}
                      </dt>
                      <dd>{formatAed(item.totalMinor)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="estimator-help">Itemised costs appear after you calculate.</p>
              )}

              <div className="estimator-summary-card__recurring">
                <span>Annual Recurring Cost</span>
                <strong>
                  {result ? formatAed(result.annualTotalMinor) : 'AED —'}
                  <small> / Year</small>
                </strong>
              </div>

              <p className="estimator-summary-card__timeline">
                <Clock3 aria-hidden="true" />
                <span>
                  Estimated Timeline:{' '}
                  <strong>
                    {result?.timelineDays
                      ? `${result.timelineDays.min} – ${result.timelineDays.max} Working Days`
                      : 'shown after calculation'}
                  </strong>
                </span>
              </p>

              <div className="estimator-summary-card__included">
                <h3>What&apos;s Included in This Estimate?</h3>
                <ul className="estimator-check-list">
                  {ESTIMATE_INCLUSIONS.map((item) => (
                    <li key={item}>
                      <Check aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="estimator-summary-card__actions">
                <Link
                  className="btn btn--accent"
                  href={result ? buildEstimatorApplyHref(result) : '/apply'}
                >
                  Start Registration <ArrowRight aria-hidden="true" />
                </Link>
                <small>Priced to fit your requirements</small>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={saveDraft}
                  disabled={storageState.status === 'pending'}
                >
                  <FileCheck2 aria-hidden="true" /> Save Estimate
                </button>
                <div className="estimator-summary-card__links">
                  <button ref={resetTriggerRef} type="button" onClick={() => setResetOpen(true)}>
                    <RotateCcw aria-hidden="true" /> Reset
                  </button>
                  <Link href="/contact">
                    <Headset aria-hidden="true" /> Talk to our team
                  </Link>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {resetOpen ? (
        <div className="estimator-dialog-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="estimator-reset-title"
            aria-describedby="estimator-reset-description"
            className="estimator-dialog"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeResetDialog();
              }
            }}
          >
            <button
              type="button"
              className="estimator-dialog__close"
              onClick={closeResetDialog}
              aria-label="Close reset confirmation"
            >
              <X aria-hidden="true" />
            </button>
            <CircleAlert aria-hidden="true" className="estimator-dialog__icon" />
            <h2 id="estimator-reset-title">Reset this estimator?</h2>
            <p id="estimator-reset-description">
              This clears current selections, the calculated result, and any saved draft on this
              device.
            </p>
            <div>
              <button
                ref={resetCancelRef}
                type="button"
                className="btn btn--outline"
                onClick={closeResetDialog}
              >
                Keep my selections
              </button>
              <button type="button" className="btn btn--accent" onClick={resetEstimator}>
                Reset estimator
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Required() {
  return (
    <span className="estimator-required" aria-hidden="true">
      *
    </span>
  );
}

function SelectField({
  id,
  label,
  placeholder,
  value,
  options,
  disabled,
  help,
  errors,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string | null;
  options: Array<{ id: string; label: string }>;
  disabled?: boolean;
  help?: string;
  errors: EstimatorValidationError[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="estimator-field">
      <label htmlFor={id}>
        {label} <Required />
      </label>
      <div className="estimator-select">
        <select
          id={id}
          value={value ?? ''}
          disabled={disabled}
          required
          aria-invalid={hasError(errors, id)}
          aria-describedby={`${help ? `${id}-help ` : ''}${id}-error`}
          onChange={(event) => {
            if (event.target.value) onChange(event.target.value);
          }}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" />
      </div>
      {help ? (
        <p id={`${id}-help`} className="estimator-help">
          {help}
        </p>
      ) : null}
      <FieldError errors={errors} fieldId={id} />
    </div>
  );
}

function CountField({
  id,
  label,
  value,
  range,
  errors,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  range: { min: number; max: number } | undefined;
  errors: EstimatorValidationError[];
  onChange: (value: string) => void;
}) {
  const parsed = /^\d+$/u.test(value) ? Number(value) : null;
  const min = range?.min ?? 0;
  const max = range?.max ?? 0;
  const step = (delta: number) => {
    const base = parsed ?? min - (delta > 0 ? 1 : 0);
    onChange(String(Math.min(max, Math.max(min, base + delta))));
  };
  return (
    <div className="estimator-field">
      <label htmlFor={id}>
        {label} <Required />
      </label>
      <div className="estimator-count">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={!range || (parsed !== null && parsed <= min)}
          onClick={() => step(-1)}
        >
          <Minus aria-hidden="true" />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step="1"
          value={value}
          disabled={!range}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={hasError(errors, id)}
          aria-describedby={`${id}-help ${id}-error`}
          required
        />
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={!range || (parsed !== null && parsed >= max)}
          onClick={() => step(1)}
        >
          <Plus aria-hidden="true" />
        </button>
      </div>
      <p id={`${id}-help`} className="estimator-help">
        {range ? `Whole number (${min}–${max})` : 'Choose an authority to set the allowed range.'}
      </p>
      <FieldError errors={errors} fieldId={id} />
    </div>
  );
}

function EstimateResultView({
  result,
  catalog,
}: {
  result: EstimatorResult;
  catalog: EstimatorCatalog;
}) {
  const documentMap = new Map(catalog.documents.map((item) => [item.id, item.label]));
  return (
    <div id="estimate-breakdown" className="estimator-result">
      <div className="estimator-result__head">
        <h3>Detailed break-up</h3>
        <span>
          {result.sourceLabel} · {result.reference} · {formatDate(result.generatedAt)}
        </span>
      </div>
      <div className="estimator-result__totals">
        <div>
          <span>One-time setup</span>
          <strong>{formatAed(result.oneTimeTotalMinor)}</strong>
        </div>
        <div>
          <span>Annual recurring</span>
          <strong>{formatAed(result.annualTotalMinor)}</strong>
        </div>
      </div>
      <section aria-labelledby="estimate-items-title">
        <h4 id="estimate-items-title">Itemized cost breakdown</h4>
        <div className="estimator-result__items">
          {result.lineItems.map((item) => (
            <div key={item.id}>
              <div>
                <strong>{item.label}</strong>
                <small>
                  {humanize(item.category)} · {humanize(item.recurrence)}
                </small>
                <small>{item.sourceContext}</small>
              </div>
              <div>
                <span>
                  {item.quantity} × {formatAed(item.amountMinor)}
                </span>
                <strong>{formatAed(item.totalMinor)}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>
      <div className="estimator-result__columns">
        <section aria-labelledby="estimate-timeline-title">
          <h4 id="estimate-timeline-title">Indicative timeline</h4>
          <p>
            {result.timelineDays
              ? `${result.timelineDays.min}–${result.timelineDays.max} working days`
              : 'Timeline confirmation required.'}
          </p>
          <small>Working-day ranges are illustrative and do not promise authority approval.</small>
        </section>
        <section aria-labelledby="estimate-documents-title">
          <h4 id="estimate-documents-title">Required documents</h4>
          <ul className="estimator-check-list">
            {result.requiredDocumentKeys.map((key) => (
              <li key={key}>
                <Check aria-hidden="true" />
                {documentMap.get(key) ?? humanize(key)}
              </li>
            ))}
          </ul>
        </section>
        <ResultList title="Assumptions" items={result.assumptions} />
        <ResultList title="Excluded or additional" items={result.exclusions} />
      </div>
      <div className="estimator-result__actions">
        <button
          type="button"
          className="btn btn--outline"
          disabled
          aria-describedby="estimate-export-note"
        >
          <FileDown aria-hidden="true" /> Export unavailable
        </button>
        <Link className="btn btn--accent" href={buildEstimatorApplyHref(result)}>
          Continue to application <ArrowRight aria-hidden="true" />
        </Link>
        <p id="estimate-export-note">
          The existing PDF recalculates against a different live source, so export remains
          unavailable until Phase 3 parity review.
        </p>
      </div>
    </div>
  );
}

function ChoiceCard({
  name,
  value,
  checked,
  label,
  description,
  icon: Icon,
  onChange,
}: {
  name: string;
  value: string;
  checked: boolean;
  label: string;
  description: string;
  icon: LucideIcon;
  onChange: () => void;
}) {
  return (
    <label className="estimator-choice-card" data-selected={checked}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      <span className="estimator-choice-card__mark" aria-hidden="true">
        {checked ? <Check /> : null}
      </span>
      <span className="estimator-choice-card__icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="estimator-choice-card__text">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </label>
  );
}

function FieldError({ errors, fieldId }: { errors: EstimatorValidationError[]; fieldId: string }) {
  const error = errors.find((item) => item.fieldId === fieldId);
  return (
    <p id={`${fieldId}-error`} className="estimator-field-error">
      {error ? (
        <>
          <CircleAlert aria-hidden="true" />
          {error.message}
        </>
      ) : null}
    </p>
  );
}

function NoOptions({ title, body }: { title: string; body: string }) {
  return (
    <div className="estimator-no-options" role="status">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  const id = `estimate-${title.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <section aria-labelledby={id}>
      <h4 id={id}>{title}</h4>
      <ul className="estimator-check-list">
        {items.map((item) => (
          <li key={item}>
            <Check aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function UnavailableWorkspace({
  source,
}: {
  source: Exclude<EstimatorSourceState, { status: 'ready' | 'indicative-demo' }>;
}) {
  return (
    <section
      id="estimator-workspace"
      className="estimator-workspace"
      aria-labelledby="estimator-workspace-title"
    >
      <div className="container">
        <h2 id="estimator-workspace-title" className="sr-only">
          Estimate your business setup cost
        </h2>
        <div className="estimator-layout">
          <div className="estimator-source-state" role="status" aria-live="polite">
            <CircleAlert aria-hidden="true" />
            <span className="eyebrow">Safe unavailable state</span>
            <h3>Indicative values need an approved catalog.</h3>
            <p>
              {source.status === 'error'
                ? 'The estimator source could not be validated safely.'
                : 'No approved production numeric catalog is connected. The workflow remains visible without substituting sample totals or calling the privileged estimator endpoint.'}
            </p>
            <div>
              <Link className="btn btn--accent" href="/knowledge-base">
                Review setup guidance
              </Link>
              <Link className="btn btn--outline" href="/contact">
                View contact options
              </Link>
            </div>
          </div>
          <aside className="estimator-sidebar" aria-label="Estimate summary">
            <div
              className="estimator-total-card"
              role="region"
              aria-labelledby="estimate-result-heading"
            >
              <h2 id="estimate-result-heading">Estimate unavailable</h2>
              <p>
                No selection or amount has been manufactured. Your browser has not sent or saved any
                estimator data.
              </p>
              <button type="button" className="btn btn--light" disabled>
                <FileDown aria-hidden="true" /> Export unavailable
              </button>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function summaryRows(draft: EstimatorDraft, catalog: EstimatorCatalog) {
  const authority = getSelectedAuthority(draft, catalog);
  const value = (collection: Array<{ id: string; label: string }>, id: string | null) =>
    collection.find((item) => item.id === id)?.label ?? 'Not selected';
  return [
    { label: 'Jurisdiction', value: value(catalog.jurisdictions, draft.jurisdiction) },
    { label: 'Authority', value: authority?.label ?? 'Not selected' },
    { label: 'Business activity', value: value(catalog.activities, draft.activityId) },
    { label: 'Legal structure', value: value(catalog.legalStructures, draft.legalStructureId) },
    { label: 'Shareholders', value: draft.shareholderCount || 'Not entered' },
    { label: 'Visas', value: draft.visaCount || 'Not entered' },
    { label: 'Office', value: value(catalog.officeTypes, draft.officeTypeId) },
    {
      label: 'Add-ons',
      value: draft.addOnIds.length
        ? draft.addOnIds.map((id) => value(catalog.addOns, id)).join(', ')
        : 'None selected',
    },
  ];
}

function stepState(
  step: number,
  currentStep: number,
  liveErrors: EstimatorValidationError[],
  shownErrors: EstimatorValidationError[],
  calculated: boolean,
): SectionState {
  if (shownErrors.some((error) => error.step === step)) return 'error';
  if (step === currentStep) return 'current';
  if (step === LAST_STEP) return calculated ? 'completed' : 'pending';
  return liveErrors.some((error) => error.step === step) ? 'pending' : 'completed';
}

function statusLabel(state: SectionState) {
  if (state === 'completed') return 'Completed';
  if (state === 'current') return 'Current';
  if (state === 'error') return 'Needs attention';
  return 'Pending';
}

function fieldIdFor(field: EstimatorDraftField) {
  return (
    {
      jurisdiction: 'estimate-jurisdiction',
      authorityId: 'estimate-authority',
      activityId: 'estimate-activity',
      legalStructureId: 'estimate-legal-structure',
      shareholderCount: 'estimate-shareholders',
      visaCount: 'estimate-visas',
      officeTypeId: 'estimate-office',
      addOnIds: 'estimate-addons',
    } as const
  )[field];
}

function hasError(errors: EstimatorValidationError[], id: string) {
  return errors.some((error) => error.fieldId === id);
}

function formatAed(minor: number) {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED' }).format(minor / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function humanize(value: string) {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}
