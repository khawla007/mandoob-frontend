import 'server-only';

import {
  REGISTRATION_STAGE_CODES,
  VISA_MILESTONE_CODES,
  validateRegistrationStages,
  validateVisaPerson,
  type RegistrationDocumentSummary,
  type RegistrationPresentation,
  type RegistrationSourceState,
  type RegistrationStageCode,
  type RegistrationStageStatus,
  type RegistrationStageView,
  type VisaMilestoneView,
  type VisaPresentationStatus,
  type VisaPersonView,
} from './contracts';
import {
  loadRegistrationIndex as unavailableIndex,
  loadRegistrationPresentation as unavailablePresentation,
  loadVisaPresentation as unavailableVisa,
} from './unavailable-adapter';
import {
  readCustomerRegistration,
  readOperatorRegistration,
  readProRegistration,
  type CustomerRegistrationRead,
  type OperatorRegistrationRead,
  type ProRegistrationRead,
  type RegistrationWorkflowDeps,
} from '@/lib/data/registration-workflow';

// ---------------------------------------------------------------------------
// Role scoping. Each loader takes a role/context param so redaction is applied
// at the source. PRO/operator see full state; customer/employee variants drop
// bank/protected details, operator notes, and other people.
// ---------------------------------------------------------------------------
export type RegistrationRole = 'pro' | 'operator' | 'customer' | 'employee';

export type ProLoaderContext = {
  role: 'pro';
  actorId: string;
  tenantId: string;
  companyId: string;
};
export type OperatorLoaderContext = {
  role: 'operator';
  actorId: string;
  actorAal: string;
};
export type CustomerLoaderContext = {
  role: 'customer';
  actorId: string;
};
export type EmployeeLoaderContext = {
  role: 'employee';
  actorId: string;
  // Restricts the visa presentation to this employee's own person row.
  employeeVisaPersonKey: string;
};
export type RegistrationLoaderContext =
  | ProLoaderContext
  | OperatorLoaderContext
  | CustomerLoaderContext
  | EmployeeLoaderContext;

const registrationUnavailable = {
  kind: 'unavailable',
  reason: 'registration_contract_unavailable',
} as const;
const visaUnavailable = { kind: 'unavailable', reason: 'visa_contract_unavailable' } as const;
const sourceError = { kind: 'error', code: 'source_error' } as const;

// ---------------------------------------------------------------------------
// Stage mapping. DB read RPCs return rows keyed by contract stage codes with
// contract stage statuses, but a snapshot may omit rows; backfill all seven in
// fixed order so validateRegistrationStages accepts the result.
// ---------------------------------------------------------------------------
type StageSourceRow = {
  code: RegistrationStageCode;
  status: RegistrationStageStatus;
  startedAt: string | null;
  completedAt: string | null;
};

function buildStages(rows: readonly StageSourceRow[]): RegistrationStageView[] {
  const byCode = new Map<RegistrationStageCode, StageSourceRow>();
  for (const row of rows) byCode.set(row.code, row);
  const stages: RegistrationStageView[] = REGISTRATION_STAGE_CODES.map((code, index) => {
    const row = byCode.get(code);
    return {
      code,
      ordinal: index + 1,
      status: row?.status ?? 'not_started',
      startedAt: row?.startedAt ?? null,
      completedAt: row?.completedAt ?? null,
      blocker: null,
      nextAction: null,
      documents: [],
    };
  });
  // Throws RegistrationPresentationError on any ordering/predecessor breach.
  return validateRegistrationStages(stages);
}

// ---------------------------------------------------------------------------
// Visa milestone mapping. DB carries a single current_stage + status per
// person; expand into six ordered milestones passing validateVisaPerson.
//   before current  -> completed
//   at current      -> mapped person status (active/blocked/completed/cancelled)
//   after current   -> not_started (or cancelled for a cancelled person)
// DB 'in_progress' maps onto contract 'active'.
// ---------------------------------------------------------------------------
type VisaSourceRow = {
  visaPersonId: string;
  displayName: string;
  personKind: 'shareholder' | 'employee' | 'dependent' | 'other';
  status: 'not_started' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  currentStage: (typeof VISA_MILESTONE_CODES)[number];
};

function mapVisaStatus(status: VisaSourceRow['status']): VisaPresentationStatus {
  return status === 'in_progress' ? 'active' : status;
}

function buildVisaPerson(row: VisaSourceRow): VisaPersonView {
  const currentOrdinal = VISA_MILESTONE_CODES.indexOf(row.currentStage) + 1;
  const personStatus = mapVisaStatus(row.status);
  const stages: VisaMilestoneView[] = VISA_MILESTONE_CODES.map((code, index) => {
    const ordinal = index + 1;
    let status: VisaPresentationStatus;
    if (ordinal < currentOrdinal) {
      status = 'completed';
    } else if (ordinal === currentOrdinal) {
      status = personStatus;
    } else {
      status = row.status === 'cancelled' ? 'cancelled' : 'not_started';
    }
    return {
      code,
      ordinal,
      status,
      completedAt: null,
    };
  });
  const person: VisaPersonView = {
    key: row.visaPersonId,
    displayName: row.displayName,
    category: row.personKind,
    status: personStatus,
    stages,
    blocker: null,
    nextAction: null,
    documents: [],
    history: [],
  };
  // Throws on any milestone ordering/predecessor breach.
  return validateVisaPerson(person);
}

// ---------------------------------------------------------------------------
// Document mapping (PRO/operator only). Never surfaces storage paths or URLs.
// ---------------------------------------------------------------------------
type DocumentSourceRow = {
  linkId: string;
  documentType: string;
  displayLabel: string | null;
  reviewStatus: string;
  versionTimestamp: string | null;
};

const REVIEW_STATUSES = new Set(['requested', 'submitted', 'under_review', 'approved', 'rejected']);

function mapDocuments(rows: readonly DocumentSourceRow[]): RegistrationDocumentSummary[] {
  return rows.map((row) => ({
    key: row.linkId,
    documentType: row.documentType,
    displayLabel: row.displayLabel ?? row.documentType,
    reviewStatus: REVIEW_STATUSES.has(row.reviewStatus)
      ? (row.reviewStatus as RegistrationDocumentSummary['reviewStatus'])
      : 'submitted',
    versionTimestamp: row.versionTimestamp,
    action: 'contract-unavailable',
    actionHref: null,
  }));
}

// ---------------------------------------------------------------------------
// Presentation assembly from the PRO/operator read shapes.
// ---------------------------------------------------------------------------
function proPresentation(read: ProRegistrationRead): RegistrationPresentation {
  return {
    stages: buildStages(read.stages),
    currentBlocker: null,
    nextAction: null,
    documents: mapDocuments(
      read.documents.map((doc) => ({
        linkId: doc.linkId,
        documentType: doc.role,
        displayLabel: doc.label,
        reviewStatus: doc.reviewStatus,
        versionTimestamp: doc.linkedAt,
      })),
    ),
    visaPeople: read.visaPeople.map((person) =>
      buildVisaPerson({
        visaPersonId: person.visaPersonId,
        displayName: person.displayName,
        personKind: person.personKind,
        status: person.status,
        currentStage: person.currentStage,
      }),
    ),
    history: [],
  };
}

function operatorPresentation(read: OperatorRegistrationRead): RegistrationPresentation {
  return {
    stages: buildStages(read.stages),
    currentBlocker: null,
    nextAction: null,
    // Operator read RPC does not project document links; leave empty.
    documents: [],
    visaPeople: read.visaPeople.map((person) =>
      buildVisaPerson({
        visaPersonId: person.visaPersonId,
        displayName: person.displayName,
        personKind: person.personKind,
        status: person.status,
        currentStage: person.currentStage,
      }),
    ),
    history: [],
  };
}

// Customer/employee scope: drop bank_account stage timestamps beyond status,
// drop protected identifiers, and drop other-people documents entirely. The
// customer read RPC already omits operator notes and unapproved evidence.
function customerPresentation(
  read: CustomerRegistrationRead,
  scope: 'customer' | 'employee',
  employeeVisaPersonKey?: string,
): RegistrationPresentation {
  const stages = buildStages(
    read.stages.map((stage) => ({
      code: stage.code,
      status: stage.status,
      startedAt: stage.startedAt,
      completedAt: stage.completedAt,
    })),
  );
  const documents =
    scope === 'employee'
      ? []
      : mapDocuments(
          read.documents.map((doc) => ({
            linkId: doc.evidenceId,
            documentType: doc.role,
            displayLabel: doc.label,
            // Customer-facing evidence is always approved (RPC filter); mark it.
            reviewStatus: 'approved',
            versionTimestamp: doc.linkedAt,
          })),
        );
  // Customer read visa rows carry no person id; synthesize a stable key from
  // ordinal position. Employees are restricted to their own person key upstream
  // (the RPC/RLS already returns only the employee's own row), so redact to the
  // matching key when provided.
  let visaPeople = read.visaProgress.map((person, index) =>
    buildVisaPerson({
      visaPersonId: `${read.registrationId}:visa:${index}`,
      displayName: person.displayName,
      personKind: person.personKind,
      status: person.status,
      currentStage: person.currentStage,
    }),
  );
  if (scope === 'employee' && employeeVisaPersonKey) {
    visaPeople = visaPeople.filter((person) => person.key === employeeVisaPersonKey);
  }
  return {
    stages,
    currentBlocker: null,
    nextAction: null,
    documents,
    visaPeople,
    history: [],
  };
}

// ---------------------------------------------------------------------------
// Loaders. Fail closed to the unavailable adapter on absence/source error.
// ---------------------------------------------------------------------------
export async function loadRegistrationPresentation(
  registrationId: string,
  context: RegistrationLoaderContext,
  deps: RegistrationWorkflowDeps = {},
): Promise<RegistrationSourceState<RegistrationPresentation>> {
  try {
    if (context.role === 'pro') {
      const read = await readProRegistration(
        registrationId,
        { actorId: context.actorId, tenantId: context.tenantId, companyId: context.companyId },
        deps,
      );
      return { kind: 'ready', value: proPresentation(read), generatedAt: read.generatedAt };
    }
    if (context.role === 'operator') {
      const read = await readOperatorRegistration(
        registrationId,
        { actorId: context.actorId, actorAal: context.actorAal },
        deps,
      );
      return { kind: 'ready', value: operatorPresentation(read), generatedAt: read.generatedAt };
    }
    const read = await readCustomerRegistration(registrationId, context.actorId, deps);
    const scope = context.role;
    const employeeKey = context.role === 'employee' ? context.employeeVisaPersonKey : undefined;
    return {
      kind: 'ready',
      value: customerPresentation(read, scope, employeeKey),
      generatedAt: read.generatedAt,
    };
  } catch (error) {
    return classifyFailure(error);
  }
}

export async function loadVisaPresentation(
  registrationId: string,
  context: RegistrationLoaderContext,
  deps: RegistrationWorkflowDeps = {},
): Promise<RegistrationSourceState<RegistrationPresentation['visaPeople']>> {
  const state = await loadRegistrationPresentation(registrationId, context, deps);
  if (state.kind === 'ready') {
    return { kind: 'ready', value: state.value.visaPeople, generatedAt: state.generatedAt };
  }
  if (state.kind === 'partial') {
    return {
      kind: 'partial',
      value: state.value.visaPeople,
      unavailableRegions: state.unavailableRegions,
      generatedAt: state.generatedAt,
    };
  }
  if (state.kind === 'error') return sourceError;
  if (state.kind === 'empty') return { kind: 'empty' };
  return visaUnavailable;
}

// Index loads a list of presentations. For the PRO/operator/customer single
// registration reads there is at most one; a caller with several registration
// ids can compose loadRegistrationPresentation. This keeps the fail-closed
// index contract intact without inventing a list RPC that the migration does
// not expose.
export async function loadRegistrationIndex(
  registrationIds: readonly string[],
  context: RegistrationLoaderContext,
  deps: RegistrationWorkflowDeps = {},
): Promise<RegistrationSourceState<RegistrationPresentation[]>> {
  if (registrationIds.length === 0) return { kind: 'empty' };
  const value: RegistrationPresentation[] = [];
  let generatedAt: string | null = null;
  for (const id of registrationIds) {
    const state = await loadRegistrationPresentation(id, context, deps);
    if (state.kind === 'ready') {
      value.push(state.value);
      generatedAt = state.generatedAt ?? generatedAt;
    } else if (state.kind === 'error') {
      return sourceError;
    } else if (state.kind === 'unavailable') {
      return registrationUnavailable;
    }
  }
  if (value.length === 0) return { kind: 'empty' };
  return { kind: 'ready', value, generatedAt };
}

// A NOT_FOUND / FORBIDDEN read is treated as contract-unavailable (fail
// closed); any other error is a source error. The registration presentation
// error thrown by the validators also surfaces as source_error.
function classifyFailure(
  error: unknown,
): Extract<RegistrationSourceState<never>, { kind: 'unavailable' | 'error' }> {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code: unknown }).code
      : undefined;
  if (code === 'FORBIDDEN' || code === 'REGISTRATION_NOT_FOUND') {
    return registrationUnavailable;
  }
  return sourceError;
}

// Re-export the fail-closed fallbacks so callers can degrade uniformly when no
// source context is available.
export {
  unavailableIndex as fallbackRegistrationIndex,
  unavailablePresentation as fallbackRegistrationPresentation,
  unavailableVisa as fallbackVisaPresentation,
};
