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
  readAdminRegistrationIndex,
  readCustomerRegistration,
  readEmployeeVisaPerson,
  readOperatorRegistration,
  readProRegistration,
  type AdminRegistrationIndexRow,
  type CustomerRegistrationRead,
  type EmployeeVisaPersonRead,
  type OperatorRegistrationRead,
  type ProRegistrationRead,
  type RegistrationWorkflowDeps,
} from '@/lib/data/registration-workflow';
import type { AdminRegistrationIndexQueryInput } from '@/lib/validation/registration-workflow';

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
  tenantId: string;
  companyId: string;
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

// Customer scope: drop protected identifiers and other-people documents. The
// customer read RPC already omits operator notes and unapproved evidence.
function customerPresentation(read: CustomerRegistrationRead): RegistrationPresentation {
  const stages = buildStages(
    read.stages.map((stage) => ({
      code: stage.code,
      status: stage.status,
      startedAt: stage.startedAt,
      completedAt: stage.completedAt,
    })),
  );
  const documents = mapDocuments(
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
  // ordinal position. The customer is authorized to see every visible person.
  const visaPeople = read.visaProgress.map((person, index) =>
    buildVisaPerson({
      visaPersonId: `${read.registrationId}:visa:${index}`,
      displayName: person.displayName,
      personKind: person.personKind,
      status: person.status,
      currentStage: person.currentStage,
    }),
  );
  return {
    stages,
    currentBlocker: null,
    nextAction: null,
    documents,
    visaPeople,
    history: [],
  };
}

// Employee scope: the dedicated employee read RPC returns EXACTLY the actor's
// own visa person, keyed by their own employee_id (not an ordinal). The person's
// stable key is the registration_visa_people row id. The presentation carries
// ONLY that one person and no documents.
function employeeVisaPresentation(read: EmployeeVisaPersonRead): RegistrationPresentation {
  const person = buildVisaPerson({
    visaPersonId: read.visaPerson.visaPersonId,
    displayName: read.visaPerson.displayName,
    personKind: read.visaPerson.personKind,
    status: read.visaPerson.status,
    currentStage: read.visaPerson.currentStage,
  });
  return {
    stages: [],
    currentBlocker: null,
    nextAction: null,
    documents: [],
    visaPeople: [person],
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
    if (context.role === 'employee') {
      // Employee-scoped read: keyed by the actor's own employee_id inside the
      // RPC. Returns ONLY the employee's own visa person — never person[0].
      const read = await readEmployeeVisaPerson(
        registrationId,
        { actorId: context.actorId, tenantId: context.tenantId, companyId: context.companyId },
        deps,
      );
      return {
        kind: 'ready',
        value: employeeVisaPresentation(read),
        generatedAt: read.generatedAt,
      };
    }
    const read = await readCustomerRegistration(registrationId, context.actorId, deps);
    return {
      kind: 'ready',
      value: customerPresentation(read),
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

// ---------------------------------------------------------------------------
// Admin registration index (operator, AAL2). Returns a paginated list of safe
// summary rows plus an exact total — NOT full presentations. The list view does
// not need per-row stage/document detail, so this avoids an N+1 over the full
// read RPC. Fails closed to the unavailable/source-error states.
// ---------------------------------------------------------------------------
export type AdminRegistrationIndexSummary = {
  registrationId: string;
  companyId: string;
  companyName: string | null;
  proName: string | null;
  title: string | null;
  status: AdminRegistrationIndexRow['status'];
  currentStage: AdminRegistrationIndexRow['currentStage'];
  currentStageStatus: AdminRegistrationIndexRow['currentStageStatus'];
  completedStages: number;
  totalStages: 7;
  registrationVersion: number;
  updatedAt: string | null;
};

export type AdminRegistrationIndexState =
  | {
      kind: 'ready';
      value: AdminRegistrationIndexSummary[];
      total: number;
      page: number;
      pageSize: number;
    }
  | { kind: 'empty'; page: number; pageSize: number }
  | { kind: 'unavailable'; reason: 'registration_contract_unavailable' }
  | { kind: 'error'; code: 'source_error' };

export async function loadAdminRegistrationIndex(
  context: OperatorLoaderContext,
  query: AdminRegistrationIndexQueryInput,
  deps: RegistrationWorkflowDeps = {},
): Promise<AdminRegistrationIndexState> {
  try {
    const receipt = await readAdminRegistrationIndex(
      { actorId: context.actorId, actorAal: context.actorAal },
      query,
      deps,
    );
    if (receipt.items.length === 0) {
      return { kind: 'empty', page: receipt.page, pageSize: receipt.pageSize };
    }
    const value: AdminRegistrationIndexSummary[] = receipt.items.map((row) => ({
      registrationId: row.registrationId,
      companyId: row.companyId,
      companyName: row.companyName,
      proName: row.proName,
      title: row.title,
      status: row.status,
      currentStage: row.currentStage,
      currentStageStatus: row.currentStageStatus,
      completedStages: row.completedStages,
      totalStages: row.totalStages,
      registrationVersion: row.registrationVersion,
      updatedAt: row.updatedAt,
    }));
    return {
      kind: 'ready',
      value,
      total: receipt.total,
      page: receipt.page,
      pageSize: receipt.pageSize,
    };
  } catch (error) {
    const failure = classifyFailure(error);
    return failure.kind === 'unavailable'
      ? registrationUnavailable
      : { kind: 'error', code: 'source_error' };
  }
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
