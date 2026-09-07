export const REGISTRATION_STAGE_CODES = [
  'application_submitted',
  'initial_approval',
  'name_reservation',
  'license_issuance',
  'visa_processing',
  'bank_account',
  'completed',
] as const;

export const REGISTRATION_STAGE_STATUSES = [
  'not_started',
  'in_progress',
  'blocked',
  'completed',
  'skipped',
] as const;

export const VISA_MILESTONE_CODES = [
  'documents_ready',
  'entry_permit',
  'status_adjustment',
  'medical_fitness',
  'emirates_id',
  'residency_issued',
] as const;

export const VISA_PRESENTATION_STATUSES = [
  'not_started',
  'active',
  'blocked',
  'completed',
  'unavailable',
  'cancelled',
] as const;

export const REGISTRATION_ACTION_AVAILABILITIES = [
  'enabled',
  'permission',
  'prerequisite-blocked',
  'contract-unavailable',
  'terminal',
] as const;

export const REGISTRATION_ACTION_PREREQUISITES = [
  'none',
  'stage_predecessor',
  'authority_response',
  'customer_document',
  'payment',
  'visa_completion',
  'source_contract',
] as const;

export const REGISTRATION_HISTORY_TRANSITIONS = [
  'registration_created',
  'stage_started',
  'stage_blocked',
  'stage_unblocked',
  'stage_completed',
  'stage_skipped',
  'document_linked',
  'document_unlinked',
  'visa_person_created',
  'visa_milestone_changed',
  'visa_person_cancelled',
  'registration_recovered',
] as const;

export const REGISTRATION_BLOCKER_CATEGORIES = [
  'authority_review',
  'customer_document',
  'government_processing',
  'identity_document',
  'payment_prerequisite',
  'safe_other',
] as const;

export type RegistrationStageCode = (typeof REGISTRATION_STAGE_CODES)[number];
export type RegistrationStageStatus = (typeof REGISTRATION_STAGE_STATUSES)[number];
export type VisaMilestoneCode = (typeof VISA_MILESTONE_CODES)[number];
export type VisaPresentationStatus = (typeof VISA_PRESENTATION_STATUSES)[number];
export type RegistrationActionAvailability = (typeof REGISTRATION_ACTION_AVAILABILITIES)[number];
export type RegistrationActionPrerequisite = (typeof REGISTRATION_ACTION_PREREQUISITES)[number];
export type RegistrationHistoryTransition = (typeof REGISTRATION_HISTORY_TRANSITIONS)[number];
export type RegistrationBlockerCategory = (typeof REGISTRATION_BLOCKER_CATEGORIES)[number];

export type OnboardingPanelState<T> =
  | { kind: 'ready'; value: T }
  | { kind: 'empty' }
  | { kind: 'error'; code: 'source_error' }
  | { kind: 'permission' }
  | { kind: 'unavailable'; reason: string };

export type RegistrationSourceState<T> =
  | { kind: 'ready'; value: T; generatedAt: string | null }
  | { kind: 'empty' }
  | { kind: 'partial'; value: T; unavailableRegions: string[]; generatedAt: string | null }
  | {
      kind: 'unavailable';
      reason: 'registration_contract_unavailable' | 'visa_contract_unavailable';
    }
  | { kind: 'error'; code: 'source_error' };

export type RegistrationBlockerView = {
  category: RegistrationBlockerCategory;
  destination: string | null;
};

export type RegistrationNextActionView = {
  actor: 'operator' | 'pro' | 'customer' | 'employee' | 'system';
  prerequisite: RegistrationActionPrerequisite;
  destination: string | null;
  availability: RegistrationActionAvailability;
};

export type RegistrationDocumentSummary = {
  key: string;
  documentType: string;
  displayLabel: string;
  reviewStatus: 'requested' | 'submitted' | 'under_review' | 'approved' | 'rejected';
  versionTimestamp: string | null;
  action: RegistrationActionAvailability;
  actionHref: string | null;
};

export type RegistrationStageView = {
  code: RegistrationStageCode;
  ordinal: number;
  status: RegistrationStageStatus;
  startedAt: string | null;
  completedAt: string | null;
  blocker: RegistrationBlockerView | null;
  nextAction: RegistrationNextActionView | null;
  documents: RegistrationDocumentSummary[];
};

export type RegistrationHistoryView = {
  key: string;
  actorCategory: 'operator' | 'pro' | 'customer' | 'employee' | 'system' | 'redacted';
  transition: RegistrationHistoryTransition;
  reasonCategory: RegistrationBlockerCategory | null;
  occurredAt: string;
};

export type VisaMilestoneView = {
  code: VisaMilestoneCode;
  ordinal: number;
  status: VisaPresentationStatus;
  completedAt: string | null;
};

export type VisaPersonView = {
  key: string;
  displayName: string;
  category: 'shareholder' | 'employee' | 'dependent' | 'other';
  status: VisaPresentationStatus;
  stages: VisaMilestoneView[];
  blocker: RegistrationBlockerView | null;
  nextAction: RegistrationNextActionView | null;
  documents: RegistrationDocumentSummary[];
  history: RegistrationHistoryView[];
};

export type RegistrationPresentation = {
  stages: RegistrationStageView[];
  currentBlocker: RegistrationBlockerView | null;
  nextAction: RegistrationNextActionView | null;
  documents: RegistrationDocumentSummary[];
  visaPeople: VisaPersonView[];
  history: RegistrationHistoryView[];
};

export class RegistrationPresentationError extends Error {
  readonly code = 'REGISTRATION_PRESENTATION_INVALID' as const;

  constructor() {
    super('REGISTRATION_PRESENTATION_INVALID');
    this.name = 'RegistrationPresentationError';
  }
}

function invalid(): never {
  throw new RegistrationPresentationError();
}

export function maySkipRegistrationStage(code: RegistrationStageCode): boolean {
  return code === 'visa_processing' || code === 'bank_account';
}

export function validateRegistrationStages(
  stages: readonly RegistrationStageView[],
): RegistrationStageView[] {
  if (stages.length !== REGISTRATION_STAGE_CODES.length) invalid();
  let predecessorResolved = true;
  return stages.map((stage, index) => {
    if (
      stage.code !== REGISTRATION_STAGE_CODES[index] ||
      stage.ordinal !== index + 1 ||
      !REGISTRATION_STAGE_STATUSES.includes(stage.status)
    ) {
      return invalid();
    }
    if (stage.status === 'skipped' && !maySkipRegistrationStage(stage.code)) invalid();
    if (index > 0 && stage.status !== 'not_started' && !predecessorResolved) invalid();
    predecessorResolved = stage.status === 'completed' || stage.status === 'skipped';
    return { ...stage, documents: [...stage.documents] };
  });
}

export function countRegistrationProgress(stages: readonly RegistrationStageView[]): {
  completed: number;
  resolved: number;
  total: 7;
} {
  const valid = validateRegistrationStages(stages);
  return {
    completed: valid.filter(({ status }) => status === 'completed').length,
    resolved: valid.filter(({ status }) => status === 'completed' || status === 'skipped').length,
    total: 7,
  };
}

export function validateVisaPerson(person: VisaPersonView): VisaPersonView {
  if (person.stages.length !== VISA_MILESTONE_CODES.length) invalid();
  let predecessorComplete = true;
  const stages = person.stages.map((stage, index) => {
    if (
      stage.code !== VISA_MILESTONE_CODES[index] ||
      stage.ordinal !== index + 1 ||
      !VISA_PRESENTATION_STATUSES.includes(stage.status)
    ) {
      return invalid();
    }
    if (
      index > 0 &&
      !['not_started', 'unavailable', 'cancelled'].includes(stage.status) &&
      !predecessorComplete
    ) {
      invalid();
    }
    predecessorComplete = stage.status === 'completed';
    return { ...stage };
  });
  return { ...person, stages, history: sortRegistrationHistory(person.history) };
}

export function sortRegistrationHistory(
  events: readonly RegistrationHistoryView[],
): RegistrationHistoryView[] {
  return [...events].sort((left, right) => {
    const time = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    if (!Number.isFinite(time)) invalid();
    return time || left.key.localeCompare(right.key);
  });
}

export function formatDubaiRegistrationTimestamp(value: string, locale: string): string | null {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Dubai',
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(timestamp);
}
