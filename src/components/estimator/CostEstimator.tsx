'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  FileDown,
  Info,
  RotateCcw,
  Save,
  Search,
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
  getEstimatorResumeStep,
  EMPTY_ESTIMATOR_DRAFT,
  ESTIMATOR_STEPS,
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

const STEP_META = [
  { label: 'Jurisdiction', description: 'Choose your setup context' },
  { label: 'Authority', description: 'Select an emirate or authority' },
  { label: 'Business activity', description: 'Choose one primary activity' },
  { label: 'Legal structure', description: 'Select a compatible structure' },
  { label: 'Shareholders', description: 'Enter the shareholder count' },
  { label: 'Visas', description: 'Enter the planned visa count' },
  { label: 'Office', description: 'Choose a workspace option' },
  { label: 'Add-ons', description: 'Select optional assistance' },
  { label: 'Summary', description: 'Review and calculate' },
] as const;

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
  const [currentStep, setCurrentStep] = useState(initialDraft.jurisdiction ? 2 : 1);
  const [maxVisited, setMaxVisited] = useState(initialDraft.jurisdiction ? 2 : 1);
  const [errors, setErrors] = useState<EstimatorValidationError[]>([]);
  const [result, setResult] = useState<EstimatorResult | null>(null);
  const [calculateState, setCalculateState] = useState<EstimatorActionState>(idleAction);
  const [storageState, setStorageState] = useState<EstimatorActionState>(idleAction);
  const [restoreCandidate, setRestoreCandidate] = useState<{
    draft: EstimatorDraft;
    savedAt: string;
  } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [authorityQuery, setAuthorityQuery] = useState('');
  const [activityQuery, setActivityQuery] = useState('');
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const resetCancelRef = useRef<HTMLButtonElement>(null);

  const authority = getSelectedAuthority(draft, catalog);
  const authorities = useMemo(
    () =>
      catalog.authorities.filter(
        (item) =>
          item.jurisdiction === draft.jurisdiction &&
          `${item.label} ${item.emirate ?? ''}`
            .toLowerCase()
            .includes(authorityQuery.toLowerCase()),
      ),
    [authorityQuery, catalog.authorities, draft.jurisdiction],
  );
  const activities = useMemo(
    () =>
      catalog.activities.filter(
        (item) =>
          authority?.activityIds.includes(item.id) &&
          `${item.label} ${item.code} ${item.category}`
            .toLowerCase()
            .includes(activityQuery.toLowerCase()),
      ),
    [activityQuery, authority, catalog.activities],
  );

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

  function change<K extends EstimatorDraftField>(field: K, value: EstimatorDraft[K]) {
    const next = applyDraftChange(draft, field, value, catalog);
    setDraft(next);
    setResult(null);
    setCalculateState(idleAction);
    setErrors((current) => current.filter((error) => error.fieldId !== fieldIdFor(field)));
  }

  function openStep(step: number, fieldId?: string) {
    if (step > maxVisited) return;
    setCurrentStep(step);
    window.requestAnimationFrame(() => {
      const target = fieldId
        ? document.getElementById(fieldId)
        : document.getElementById(`estimate-step-${step}-heading`);
      target?.focus({ preventScroll: true });
    });
  }

  function continueFromStep() {
    const validation = validateEstimatorDraft(draft, catalog);
    const currentErrors = validation.errors.filter((error) => error.step === currentStep);
    if (currentErrors.length > 0) {
      setErrors((existing) => [
        ...existing.filter((error) => error.step !== currentStep),
        ...currentErrors,
      ]);
      document.getElementById(currentErrors[0].fieldId)?.focus();
      return;
    }
    const nextStep = Math.min(9, currentStep + 1);
    setErrors((existing) => existing.filter((error) => error.step !== currentStep));
    setCurrentStep(nextStep);
    setMaxVisited((visited) => Math.max(visited, nextStep));
    window.requestAnimationFrame(() =>
      document.getElementById(`estimate-step-${nextStep}-heading`)?.focus({ preventScroll: true }),
    );
  }

  function calculate() {
    if (calculateState.status === 'pending') return;
    const validation = validateEstimatorDraft(draft, catalog);
    if (!validation.valid) {
      setErrors(validation.errors);
      setCalculateState({
        status: 'error',
        message: 'Review the highlighted steps before calculating.',
      });
      const first = validation.errors[0];
      setCurrentStep(first.step);
      setMaxVisited((visited) => Math.max(visited, first.step));
      window.requestAnimationFrame(() => document.getElementById(first.fieldId)?.focus());
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
              'No complete cost data matches this combination. Edit the highlighted choices or view contact options.',
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
    const resumeStep = getEstimatorResumeStep(restoreCandidate.draft, catalog);
    setDraft(restoreCandidate.draft);
    setResult(null);
    setErrors([]);
    setCalculateState(idleAction);
    setCurrentStep(resumeStep);
    setMaxVisited(resumeStep);
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
    setCurrentStep(1);
    setMaxVisited(1);
    setErrors([]);
    setResult(null);
    setCalculateState(idleAction);
    setStorageState({ status: 'success', message: 'Estimator and saved draft reset.' });
    setRestoreCandidate(null);
    setAuthorityQuery('');
    setActivityQuery('');
    setResetOpen(false);
    window.requestAnimationFrame(() => document.getElementById('estimate-jurisdiction')?.focus());
  }

  function closeResetDialog() {
    setResetOpen(false);
    window.requestAnimationFrame(() => resetTriggerRef.current?.focus());
  }

  return (
    <section
      id="estimator-workspace"
      className="estimator-workspace"
      aria-labelledby="estimator-workspace-title"
    >
      <div className="container">
        <div className="estimator-workspace__shell">
          <header className="estimator-workspace__header">
            <div>
              <span className="eyebrow eyebrow--accent">Nine-step planner</span>
              <h2 id="estimator-workspace-title">Estimate your business setup cost</h2>
            </div>
            <div className="estimator-workspace__tools">
              <span className="estimator-source-badge">Illustrative local data</span>
              <button
                type="button"
                className="estimator-tool-button"
                onClick={saveDraft}
                disabled={storageState.status === 'pending'}
              >
                <Save aria-hidden="true" /> Save locally
              </button>
              <button
                ref={resetTriggerRef}
                type="button"
                className="estimator-tool-button"
                onClick={() => setResetOpen(true)}
              >
                <RotateCcw aria-hidden="true" /> Reset
              </button>
            </div>
          </header>

          <div className="estimator-source-notice" role="note">
            <Info aria-hidden="true" />
            <div>
              <strong>{catalog.sourceLabel}</strong>
              <p>{catalog.sourceContext}</p>
            </div>
          </div>

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
                <button type="button" className="btn btn--accent" onClick={restoreDraft}>
                  Restore
                </button>
                <button
                  type="button"
                  className="btn btn--outline"
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

          <div className="estimator-workspace__grid">
            <nav className="estimator-step-rail" aria-label="Estimator steps">
              <ol>
                {STEP_META.map((step, index) => {
                  const number = index + 1;
                  const state = stepState(number, currentStep, maxVisited, errors);
                  return (
                    <li key={step.label} data-step-state={state}>
                      <button
                        type="button"
                        onClick={() => openStep(number)}
                        disabled={number > maxVisited}
                        aria-current={state === 'current' ? 'step' : undefined}
                      >
                        <span className="estimator-step-rail__number" aria-hidden="true">
                          {state === 'completed' ? <Check /> : number}
                        </span>
                        <span>
                          <strong>{step.label}</strong>
                          <small>{step.description}</small>
                          <em>{statusLabel(state)}</em>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <form
              className="estimator-form"
              onSubmit={(event) => event.preventDefault()}
              noValidate
            >
              {calculateState.status === 'error' && errors.length > 0 ? (
                <div
                  className="estimator-error-summary"
                  role="alert"
                  aria-labelledby="estimate-errors-title"
                >
                  <h3 id="estimate-errors-title">Review these steps</h3>
                  <ul>
                    {errors.map((error) => (
                      <li key={`${error.step}-${error.fieldId}`}>
                        <button type="button" onClick={() => openStep(error.step, error.fieldId)}>
                          {error.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {STEP_META.map((step, index) => {
                const number = index + 1;
                const active = currentStep === number;
                const state = stepState(number, currentStep, maxVisited, errors);
                return (
                  <section
                    key={step.label}
                    className="estimator-step-panel"
                    data-step-state={state}
                    aria-labelledby={`estimate-step-${number}-heading`}
                  >
                    <button
                      type="button"
                      className="estimator-step-panel__toggle"
                      onClick={() => openStep(number)}
                      disabled={number > maxVisited}
                      aria-expanded={active}
                    >
                      <span aria-hidden="true">{number.toString().padStart(2, '0')}</span>
                      <span>
                        <strong
                          id={`estimate-step-${number}-heading`}
                          tabIndex={active ? -1 : undefined}
                        >
                          {step.label}
                        </strong>
                        {!active ? <small>{stepSummary(number, draft, catalog)}</small> : null}
                      </span>
                      <ChevronDown aria-hidden="true" />
                    </button>
                    {active ? (
                      <div className="estimator-step-panel__body">
                        <StepContent
                          step={number}
                          draft={draft}
                          catalog={catalog}
                          authorityQuery={authorityQuery}
                          activityQuery={activityQuery}
                          authorities={authorities}
                          activities={activities}
                          errors={errors}
                          onAuthorityQuery={setAuthorityQuery}
                          onActivityQuery={setActivityQuery}
                          onChange={change}
                          onEdit={openStep}
                        />
                        <div className="estimator-step-panel__actions">
                          {number > 1 ? (
                            <button
                              type="button"
                              className="btn btn--outline"
                              onClick={() => openStep(number - 1)}
                            >
                              Back
                            </button>
                          ) : (
                            <span />
                          )}
                          {number < 9 ? (
                            <button
                              type="button"
                              className="btn btn--accent"
                              onClick={continueFromStep}
                            >
                              Next step <ArrowRight aria-hidden="true" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn--accent"
                              onClick={calculate}
                              disabled={calculateState.status === 'pending'}
                            >
                              {calculateState.status === 'pending'
                                ? 'Calculating…'
                                : 'Calculate indicative estimate'}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </form>

            <EstimatorSummary
              draft={draft}
              catalog={catalog}
              result={result}
              calculateState={calculateState}
              resultHeadingRef={resultHeadingRef}
              onEdit={openStep}
            />
          </div>
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

type StepContentProps = {
  step: number;
  draft: EstimatorDraft;
  catalog: EstimatorCatalog;
  authorityQuery: string;
  activityQuery: string;
  authorities: EstimatorCatalog['authorities'];
  activities: EstimatorCatalog['activities'];
  errors: EstimatorValidationError[];
  onAuthorityQuery: (value: string) => void;
  onActivityQuery: (value: string) => void;
  onChange: <K extends EstimatorDraftField>(field: K, value: EstimatorDraft[K]) => void;
  onEdit: (step: number, fieldId?: string) => void;
};

function StepContent(props: StepContentProps) {
  const { step, draft, catalog, errors, onChange } = props;
  const authority = getSelectedAuthority(draft, catalog);
  if (step === 1) {
    return (
      <fieldset
        id="estimate-jurisdiction"
        className="estimator-choice-fieldset"
        aria-describedby="estimate-jurisdiction-help estimate-jurisdiction-error"
        aria-invalid={hasError(errors, 'estimate-jurisdiction')}
      >
        <legend>1. Choose jurisdiction</legend>
        <p id="estimate-jurisdiction-help">
          Select the company setup context you want to explore in the UAE.
        </p>
        <div className="estimator-choice-grid estimator-choice-grid--three">
          {catalog.jurisdictions.map((item) => (
            <ChoiceCard
              key={item.id}
              name="jurisdiction"
              value={item.id}
              checked={draft.jurisdiction === item.id}
              label={item.label}
              description={item.description}
              onChange={() => onChange('jurisdiction', item.id)}
            />
          ))}
        </div>
        <FieldError errors={errors} fieldId="estimate-jurisdiction" />
        <Link className="estimator-guidance-link" href="/knowledge-base">
          Compare setup guidance <ArrowRight aria-hidden="true" />
        </Link>
      </fieldset>
    );
  }
  if (step === 2) {
    const label =
      draft.jurisdiction === 'mainland'
        ? 'Emirate / authority'
        : draft.jurisdiction === 'free_zone'
          ? 'Free Zone / authority'
          : 'Offshore authority';
    return (
      <fieldset
        id="estimate-authority"
        className="estimator-choice-fieldset"
        aria-describedby="estimate-authority-help estimate-authority-error"
        aria-invalid={hasError(errors, 'estimate-authority')}
      >
        <legend>2. Choose {label}</legend>
        <p id="estimate-authority-help">
          Only choices supported by this same demo catalog are shown.
        </p>
        {draft.jurisdiction === 'free_zone' ? (
          <SearchField
            id="estimate-authority-search"
            label="Search Free Zone choices"
            value={props.authorityQuery}
            onChange={props.onAuthorityQuery}
          />
        ) : null}
        {props.authorities.length ? (
          <div className="estimator-choice-grid">
            {props.authorities.map((item) => (
              <ChoiceCard
                key={item.id}
                name="authority"
                value={item.id}
                checked={draft.authorityId === item.id}
                label={item.label}
                description={`${item.description}${item.emirate ? ` · ${humanize(item.emirate)}` : ''}`}
                onChange={() => onChange('authorityId', item.id)}
              />
            ))}
          </div>
        ) : (
          <NoOptions
            title="No authority choices match"
            body="Clear the search or return to Jurisdiction. No substitute authority was selected."
          />
        )}
        <FieldError errors={errors} fieldId="estimate-authority" />
      </fieldset>
    );
  }
  if (step === 3) {
    return (
      <fieldset
        id="estimate-activity"
        className="estimator-choice-fieldset"
        aria-describedby="estimate-activity-help estimate-activity-error"
        aria-invalid={hasError(errors, 'estimate-activity')}
      >
        <legend>3. Choose one primary business activity</legend>
        <p id="estimate-activity-help">
          Exact activity naming and any external approvals require authority confirmation.
        </p>
        <SearchField
          id="estimate-activity-search"
          label="Search activity name, code, or category"
          value={props.activityQuery}
          onChange={props.onActivityQuery}
        />
        {props.activities.length ? (
          <div className="estimator-choice-grid">
            {props.activities.map((item) => (
              <ChoiceCard
                key={item.id}
                name="activity"
                value={item.id}
                checked={draft.activityId === item.id}
                label={`${item.label} · ${item.code}`}
                description={`${item.category}. ${item.description}`}
                onChange={() => onChange('activityId', item.id)}
              />
            ))}
          </div>
        ) : (
          <NoOptions
            title="No activities match"
            body="Change the search or return to the authority step. An unrelated activity will not be substituted."
          />
        )}
        <FieldError errors={errors} fieldId="estimate-activity" />
      </fieldset>
    );
  }
  if (step === 4) {
    const items = catalog.legalStructures.filter((item) =>
      authority?.legalStructureIds.includes(item.id),
    );
    return (
      <ChoiceStep
        id="estimate-legal-structure"
        legend="4. Choose a legal structure"
        help="Descriptions are planning context, not legal advice."
        items={items}
        selected={draft.legalStructureId}
        name="legal-structure"
        errors={errors}
        onSelect={(id) => onChange('legalStructureId', id as EstimatorDraft['legalStructureId'])}
      />
    );
  }
  if (step === 5) {
    return (
      <NumberStep
        id="estimate-shareholders"
        legend="5. Number of shareholders"
        help="Shareholder count can affect documentation and fees; it does not guarantee a specific result."
        value={draft.shareholderCount}
        min={authority?.shareholderRange.min ?? 1}
        max={authority?.shareholderRange.max ?? 1}
        errors={errors}
        onChange={(value) => onChange('shareholderCount', value)}
      />
    );
  }
  if (step === 6) {
    return (
      <NumberStep
        id="estimate-visas"
        legend="6. Planned visas"
        help="Eligibility and quota depend on the setup, workspace, immigration rules, and approvals."
        value={draft.visaCount}
        min={authority?.visaRange.min ?? 0}
        max={authority?.visaRange.max ?? 0}
        errors={errors}
        onChange={(value) => onChange('visaCount', value)}
      />
    );
  }
  if (step === 7) {
    const items = catalog.officeTypes.filter((item) => authority?.officeTypeIds.includes(item.id));
    return (
      <ChoiceStep
        id="estimate-office"
        legend="7. Choose an office option"
        help="Lease, workspace, size, and visa requirements vary by authority and activity."
        items={items}
        selected={draft.officeTypeId}
        name="office"
        errors={errors}
        onSelect={(id) => onChange('officeTypeId', id as EstimatorDraft['officeTypeId'])}
      />
    );
  }
  if (step === 8) {
    const items = catalog.addOns.filter((item) => authority?.addOnIds.includes(item.id));
    return (
      <fieldset
        id="estimate-addons"
        className="estimator-choice-fieldset"
        aria-describedby="estimate-addons-help estimate-addons-error"
        aria-invalid={hasError(errors, 'estimate-addons')}
      >
        <legend>8. Optional assistance</legend>
        <p id="estimate-addons-help">
          Assistance does not guarantee a bank, tax, attestation, or other external outcome.
        </p>
        {items.length ? (
          <div className="estimator-addon-list">
            {items.map((item) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  checked={draft.addOnIds.includes(item.id)}
                  onChange={() =>
                    onChange(
                      'addOnIds',
                      draft.addOnIds.includes(item.id)
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
            ))}
          </div>
        ) : (
          <NoOptions
            title="No optional services available"
            body="You can continue with the base estimate."
          />
        )}
        <FieldError errors={errors} fieldId="estimate-addons" />
      </fieldset>
    );
  }
  return <ReviewDraft draft={draft} catalog={catalog} onEdit={props.onEdit} />;
}

function EstimatorSummary({
  draft,
  catalog,
  result,
  calculateState,
  resultHeadingRef,
  onEdit,
}: {
  draft: EstimatorDraft;
  catalog: EstimatorCatalog;
  result: EstimatorResult | null;
  calculateState: EstimatorActionState;
  resultHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  onEdit: (step: number, fieldId?: string) => void;
}) {
  const selections = summaryRows(draft, catalog);
  return (
    <div className="estimator-summary" role="region" aria-labelledby="estimate-result-heading">
      <div className="estimator-summary__header">
        <div>
          <span className="eyebrow">Live summary</span>
          <h2 id="estimate-result-heading" ref={resultHeadingRef} tabIndex={-1}>
            Your indicative estimate
          </h2>
        </div>
        <button type="button" onClick={() => onEdit(1, 'estimate-jurisdiction')}>
          Edit
        </button>
      </div>
      <dl className="estimator-summary__selections">
        {selections.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {calculateState.message ? (
        <p
          className={`estimator-status estimator-status--${calculateState.status}`}
          aria-live="polite"
          role="status"
        >
          {calculateState.message}
        </p>
      ) : null}
      {result ? (
        <EstimateResultView result={result} catalog={catalog} />
      ) : (
        <div className="estimator-summary__empty">
          <strong>Estimate not calculated</strong>
          <p>Complete all nine steps. No sample total is shown before a coherent result exists.</p>
        </div>
      )}
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
    <div className="estimator-result">
      <div className="estimator-result__source">
        <strong>{result.sourceLabel}</strong>
        <span>
          {result.reference} · {formatDate(result.generatedAt)}
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
        <h3 id="estimate-items-title">Itemized cost breakdown</h3>
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
      <section aria-labelledby="estimate-timeline-title">
        <h3 id="estimate-timeline-title">Indicative timeline</h3>
        <p>
          {result.timelineDays
            ? `${result.timelineDays.min}–${result.timelineDays.max} working days`
            : 'Timeline confirmation required.'}
        </p>
        <small>Working-day ranges are illustrative and do not promise authority approval.</small>
      </section>
      <section aria-labelledby="estimate-documents-title">
        <h3 id="estimate-documents-title">Required documents</h3>
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
      <ResultList title="Included in this result" items={result.inclusions} />
      <ResultList title="Excluded or additional" items={result.exclusions} />
      <div className="estimator-result__actions">
        <button
          type="button"
          className="btn btn--outline"
          disabled
          aria-describedby="estimate-export-note"
        >
          <FileDown aria-hidden="true" /> Export unavailable
        </button>
        <p id="estimate-export-note">
          The existing PDF recalculates against a different live source, so export remains
          unavailable until Phase 3 parity review.
        </p>
        <Link className="btn btn--accent" href={buildEstimatorApplyHref(result)}>
          Continue to application <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function ReviewDraft({
  draft,
  catalog,
  onEdit,
}: {
  draft: EstimatorDraft;
  catalog: EstimatorCatalog;
  onEdit: (step: number, fieldId?: string) => void;
}) {
  return (
    <div className="estimator-review">
      <h3>9. Review your selections</h3>
      <p>Confirm each normalized choice and the unresolved assumptions before calculating.</p>
      <dl>
        {summaryRows(draft, catalog).map((row, index) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              <span>{row.value}</span>
              <button type="button" onClick={() => onEdit(index + 1)}>
                Edit {row.label}
              </button>
            </dd>
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
    </div>
  );
}

function ChoiceStep({
  id,
  legend,
  help,
  items,
  selected,
  name,
  errors,
  onSelect,
}: {
  id: string;
  legend: string;
  help: string;
  items: Array<{ id: string; label: string; description: string }>;
  selected: string | null;
  name: string;
  errors: EstimatorValidationError[];
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset
      id={id}
      className="estimator-choice-fieldset"
      aria-describedby={`${id}-help ${id}-error`}
      aria-invalid={hasError(errors, id)}
    >
      <legend>{legend}</legend>
      <p id={`${id}-help`}>{help}</p>
      <div className="estimator-choice-grid">
        {items.map((item) => (
          <ChoiceCard
            key={item.id}
            name={name}
            value={item.id}
            checked={selected === item.id}
            label={item.label}
            description={item.description}
            onChange={() => onSelect(item.id)}
          />
        ))}
      </div>
      <FieldError errors={errors} fieldId={id} />
    </fieldset>
  );
}

function NumberStep({
  id,
  legend,
  help,
  value,
  min,
  max,
  errors,
  onChange,
}: {
  id: string;
  legend: string;
  help: string;
  value: string;
  min: number;
  max: number;
  errors: EstimatorValidationError[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="estimator-number-fieldset">
      <legend>{legend}</legend>
      <p id={`${id}-help`}>{help}</p>
      <label htmlFor={id}>
        Whole number ({min}–{max})
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={hasError(errors, id)}
        aria-describedby={`${id}-help ${id}-error`}
        required
      />
      <FieldError errors={errors} fieldId={id} />
    </fieldset>
  );
}

function ChoiceCard({
  name,
  value,
  checked,
  label,
  description,
  onChange,
}: {
  name: string;
  value: string;
  checked: boolean;
  label: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <label className="estimator-choice-card" data-selected={checked}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      <span className="estimator-choice-card__mark" aria-hidden="true">
        {checked ? <Check /> : null}
      </span>
      <strong>{label}</strong>
      <small>{description}</small>
    </label>
  );
}

function SearchField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="estimator-search" htmlFor={id}>
      <span>{label}</span>
      <span>
        <Search aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
        />
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
      <h3 id={id}>{title}</h3>
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
        <div className="estimator-workspace__shell">
          <header className="estimator-workspace__header">
            <div>
              <span className="eyebrow eyebrow--accent">Nine-step planner</span>
              <h2 id="estimator-workspace-title">Estimate your business setup cost</h2>
            </div>
            <span className="estimator-source-badge estimator-source-badge--unavailable">
              Source unavailable
            </span>
          </header>
          <div className="estimator-workspace__grid">
            <nav className="estimator-step-rail" aria-label="Estimator steps">
              <ol>
                {ESTIMATOR_STEPS.map((label, index) => (
                  <li key={label} data-step-state="pending">
                    <span className="estimator-step-rail__static">
                      <span className="estimator-step-rail__number">{index + 1}</span>
                      <span>
                        <strong>{label}</strong>
                        <small>Pending source</small>
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </nav>
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
            <div
              className="estimator-summary"
              role="region"
              aria-labelledby="estimate-result-heading"
            >
              <span className="eyebrow">Live summary</span>
              <h2 id="estimate-result-heading">Estimate unavailable</h2>
              <p>
                No selection or amount has been manufactured. Your browser has not sent or saved any
                estimator data.
              </p>
              <button type="button" className="btn btn--outline" disabled>
                <FileDown aria-hidden="true" /> Export unavailable
              </button>
            </div>
          </div>
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
    { label: 'Activity', value: value(catalog.activities, draft.activityId) },
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

function stepSummary(step: number, draft: EstimatorDraft, catalog: EstimatorCatalog) {
  if (step === 9) return 'Review your selections and calculate';
  return summaryRows(draft, catalog)[step - 1]?.value ?? 'Not selected';
}

function stepState(
  step: number,
  current: number,
  maxVisited: number,
  errors: EstimatorValidationError[],
) {
  if (errors.some((error) => error.step === step)) return 'error';
  if (step === current) return 'current';
  if (step < maxVisited) return 'completed';
  return 'pending';
}

function statusLabel(state: string) {
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
