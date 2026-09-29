import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  adminRegistrationIndexQuerySchema,
  cancelVisaPersonSchema,
  createRegistrationSchema,
  createVisaPersonSchema,
  linkStageDocumentSchema,
  readRegistrationSchema,
  recoverUnlinkStageDocumentSchema,
  transitionStageSchema,
  transitionVisaPersonSchema,
  unlinkStageDocumentSchema,
  type AdminRegistrationIndexQueryInput,
  type CancelVisaPersonInput,
  type CreateRegistrationInput,
  type CreateVisaPersonInput,
  type LinkStageDocumentInput,
  type RecoverUnlinkStageDocumentInput,
  type TransitionStageInput,
  type TransitionVisaPersonInput,
  type UnlinkStageDocumentInput,
} from '@/lib/validation/registration-workflow';
import { mapRegistrationWorkflowError } from './registration-workflow-errors';

// ---------------------------------------------------------------------------
// Injectable RPC client (mirrors company-assignments.ts / documents.ts).
// ---------------------------------------------------------------------------
type DbError = { message?: string; code?: string } | null;
type DbResult = { data: unknown; error: DbError };
type RegistrationWorkflowClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<DbResult>;
};
export type RegistrationWorkflowDeps = { supabase?: RegistrationWorkflowClient };

function client(deps: RegistrationWorkflowDeps = {}): RegistrationWorkflowClient {
  return (
    deps.supabase ?? (createSupabaseServiceRoleClient() as unknown as RegistrationWorkflowClient)
  );
}

// ---------------------------------------------------------------------------
// Server-derived actor context. Never sourced from untrusted request input;
// callers must derive it from the authenticated session (PRO assignment, or an
// operator with confirmed AAL).
// ---------------------------------------------------------------------------
export type RegistrationActorContext = {
  actorId: string;
  tenantId: string;
  companyId: string;
};
// Mutations additionally carry the session AAL; the DB grants the operator
// path only at aal2 and re-checks authority after row locks.
export type RegistrationMutationActorContext = RegistrationActorContext & { actorAal: string };

const actorAalSchema = z.enum(['aal1', 'aal2']);
export type OperatorActorContext = {
  actorId: string;
  actorAal: string;
};

const uuidSchema = z.string().uuid();

function parseActor(context: RegistrationActorContext): RegistrationActorContext {
  return {
    actorId: uuidSchema.parse(context.actorId),
    tenantId: uuidSchema.parse(context.tenantId),
    companyId: uuidSchema.parse(context.companyId),
  };
}

// ---------------------------------------------------------------------------
// Deterministic replay-safe payload hash. The DB requires ^[0-9a-f]{64}$; a
// SHA-256 of a canonical serialization of the mutating inputs satisfies the
// idempotency contract (same operation + same inputs -> same hash).
// ---------------------------------------------------------------------------
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function payloadHash(operationKind: string, logicalPayload: Record<string, unknown>): string {
  return createHash('sha256')
    .update(canonicalJson({ operation: operationKind, payload: logicalPayload }))
    .digest('hex');
}

function mutationError(error: DbError): ApiError {
  const mapped = mapRegistrationWorkflowError(error);
  return new ApiError(mapped.code, mapped.error, mapped.status, mapped.details);
}

function internalReadError(): ApiError {
  return new ApiError('INTERNAL', 'Unable to load registration workflow', 500);
}

async function callMutation<T>(
  deps: RegistrationWorkflowDeps,
  name: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await client(deps).rpc(name, args);
  if (error) throw mutationError(error);
  const parsed = schema.safeParse(data);
  // A receipt that does not match the contract is a server-side invariant
  // breach, not a client fault; surface it as an internal error.
  if (!parsed.success) throw mutationError(null);
  return parsed.data;
}

async function callRead<T>(
  deps: RegistrationWorkflowDeps,
  name: string,
  args: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await client(deps).rpc(name, args);
  if (error) throw mutationError(error);
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw internalReadError();
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Receipt schemas (exact shapes per migration RETURNS jsonb_build_object).
// ---------------------------------------------------------------------------
const registrationStatus = z.enum(['draft', 'in_progress', 'blocked', 'completed', 'cancelled']);
const stageCode = z.enum([
  'application_submitted',
  'initial_approval',
  'name_reservation',
  'license_issuance',
  'visa_processing',
  'bank_account',
  'completed',
]);
const stageStatus = z.enum(['not_started', 'in_progress', 'blocked', 'completed', 'skipped']);
const visaStageCode = z.enum([
  'documents_ready',
  'entry_permit',
  'status_adjustment',
  'medical_fitness',
  'emirates_id',
  'residency_issued',
]);
// The RPC receipts surface the internal working state token ('not_started' |
// 'in_progress' | ... | 'cancelled'); the read adapter maps in_progress ->
// active for presentation. Mutation callers see the raw command result.
const visaReceiptStatus = z.enum([
  'not_started',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
]);
const versionInt = z.number().int().nonnegative();

const createRegistrationReceipt = z
  .object({
    registrationId: uuidSchema,
    serviceCaseId: uuidSchema,
    status: registrationStatus,
    currentStage: stageCode,
    registrationVersion: versionInt,
    currentStageVersion: versionInt,
  })
  .strip();

const transitionStageReceipt = z
  .object({
    registrationId: uuidSchema,
    stageId: uuidSchema,
    stageCode,
    stageStatus,
    status: registrationStatus,
    currentStage: stageCode,
    transitionCode: z.enum(['started', 'advanced', 'blocked', 'unblocked', 'skipped', 'completed']),
    registrationVersion: versionInt,
    stageVersion: versionInt,
  })
  .strip();

const linkStageDocumentReceipt = z
  .object({
    registrationId: uuidSchema,
    stageId: uuidSchema,
    linkId: uuidSchema,
    documentId: uuidSchema,
    documentVersionId: uuidSchema,
    role: z.enum([
      'application_form',
      'approval_letter',
      'trade_name_approval',
      'trade_license',
      'visa_evidence',
      'bank_evidence',
      'other',
    ]),
  })
  .strip();

const unlinkStageDocumentReceipt = z
  .object({
    registrationId: uuidSchema,
    stageId: uuidSchema,
    linkId: uuidSchema,
    unlinked: z.literal(true),
  })
  .strip();

const recoverUnlinkStageDocumentReceipt = z
  .object({
    registrationId: uuidSchema,
    stageId: uuidSchema,
    linkId: uuidSchema,
    unlinked: z.literal(true),
    recovery: z.literal(true),
  })
  .strip();

const createVisaPersonReceipt = z
  .object({
    registrationId: uuidSchema,
    visaPersonId: uuidSchema,
    displayName: z.string(),
    personKind: z.enum(['shareholder', 'employee', 'dependent', 'other']),
    visaKind: z.enum(['investor', 'employee', 'family']),
    status: visaReceiptStatus,
    currentStage: visaStageCode,
    visaVersion: versionInt,
  })
  .strip();

const transitionVisaPersonReceipt = z
  .object({
    registrationId: uuidSchema,
    visaPersonId: uuidSchema,
    status: visaReceiptStatus,
    currentStage: visaStageCode,
    visaVersion: versionInt,
  })
  .strip();

export type CreateRegistrationReceipt = z.infer<typeof createRegistrationReceipt>;
export type TransitionStageReceipt = z.infer<typeof transitionStageReceipt>;
export type LinkStageDocumentReceipt = z.infer<typeof linkStageDocumentReceipt>;
export type UnlinkStageDocumentReceipt = z.infer<typeof unlinkStageDocumentReceipt>;
export type RecoverUnlinkStageDocumentReceipt = z.infer<typeof recoverUnlinkStageDocumentReceipt>;
export type CreateVisaPersonReceipt = z.infer<typeof createVisaPersonReceipt>;
export type TransitionVisaPersonReceipt = z.infer<typeof transitionVisaPersonReceipt>;

// ---------------------------------------------------------------------------
// Read receipt schemas (jsonb read RPCs). Kept permissive on nested rows —
// the db-adapter performs contract-shaping validation.
// ---------------------------------------------------------------------------
const readStageRow = z
  .object({
    stageId: uuidSchema.optional(),
    code: stageCode,
    ordinal: z.number().int(),
    status: stageStatus,
    details: z.record(z.string(), z.unknown()).optional(),
    stageVersion: versionInt.optional(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
  })
  .strip();

const readDocumentRow = z
  .object({
    linkId: uuidSchema,
    stageId: uuidSchema,
    documentId: uuidSchema,
    documentVersionId: uuidSchema,
    role: z.string(),
    label: z.string().nullable(),
    mimeType: z.string().nullable(),
    reviewStatus: z.string(),
    linkedAt: z.string(),
  })
  .strip();

const readVisaPersonRow = z
  .object({
    visaPersonId: uuidSchema,
    displayName: z.string(),
    personKind: z.enum(['shareholder', 'employee', 'dependent', 'other']),
    visaKind: z.enum(['investor', 'employee', 'family']),
    status: visaReceiptStatus,
    currentStage: visaStageCode,
    visaVersion: versionInt,
  })
  .strip();

export const proRegistrationReadSchema = z
  .object({
    registrationId: uuidSchema,
    serviceCaseId: uuidSchema,
    status: registrationStatus,
    currentStage: stageCode,
    registrationVersion: versionInt,
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    stages: z.array(readStageRow),
    documents: z.array(readDocumentRow),
    visaPeople: z.array(readVisaPersonRow),
    generatedAt: z.string(),
  })
  .strip();

export const operatorRegistrationReadSchema = z
  .object({
    registrationId: uuidSchema,
    tenantId: uuidSchema,
    companyId: uuidSchema,
    serviceCaseId: uuidSchema,
    status: registrationStatus,
    currentStage: stageCode,
    registrationVersion: versionInt,
    stages: z.array(readStageRow),
    visaPeople: z.array(readVisaPersonRow),
    generatedAt: z.string(),
  })
  .strip();

const customerStageRow = z
  .object({
    code: stageCode,
    ordinal: z.number().int(),
    status: stageStatus,
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
  })
  .strip();

const customerDocumentRow = z
  .object({
    evidenceId: uuidSchema,
    documentId: uuidSchema,
    stageCode,
    role: z.string(),
    label: z.string().nullable(),
    mimeType: z.string().nullable(),
    linkedAt: z.string(),
  })
  .strip();

const customerVisaRow = z
  .object({
    displayName: z.string(),
    personKind: z.enum(['shareholder', 'employee', 'dependent', 'other']),
    visaKind: z.enum(['investor', 'employee', 'family']),
    status: visaReceiptStatus,
    currentStage: visaStageCode,
  })
  .strip();

export const customerRegistrationReadSchema = z
  .object({
    registrationId: uuidSchema,
    status: registrationStatus,
    currentStage: stageCode,
    completedStages: z.number().int().nonnegative(),
    totalStages: z.literal(7),
    generatedAt: z.string(),
    stages: z.array(customerStageRow),
    documents: z.array(customerDocumentRow),
    visaProgress: z.array(customerVisaRow),
  })
  .strip();

// Employee-scoped single-person visa read. The RPC returns EXACTLY the actor's
// own visa person (keyed by their own employee_id) wrapped so the adapter can
// build a single-element visaPeople presentation. The stable visaPersonId is the
// registration_visa_people row id — not an ordinal position.
const employeeVisaPersonRow = z
  .object({
    visaPersonId: uuidSchema,
    displayName: z.string(),
    personKind: z.enum(['shareholder', 'employee', 'dependent', 'other']),
    visaKind: z.enum(['investor', 'employee', 'family']),
    status: visaReceiptStatus,
    currentStage: visaStageCode,
  })
  .strip();

export const employeeVisaPersonReadSchema = z
  .object({
    registrationId: uuidSchema,
    generatedAt: z.string(),
    visaPerson: employeeVisaPersonRow,
  })
  .strip();

export type ProRegistrationRead = z.infer<typeof proRegistrationReadSchema>;
export type OperatorRegistrationRead = z.infer<typeof operatorRegistrationReadSchema>;
export type CustomerRegistrationRead = z.infer<typeof customerRegistrationReadSchema>;
export type EmployeeVisaPersonRead = z.infer<typeof employeeVisaPersonReadSchema>;

// ---------------------------------------------------------------------------
// Admin registration index receipt. The RPC returns safe summary rows only
// (no per-row full presentation): id + scope labels + stage/status + counters.
// ---------------------------------------------------------------------------
const adminRegistrationIndexRow = z
  .object({
    registrationId: uuidSchema,
    tenantId: uuidSchema,
    companyId: uuidSchema,
    companyName: z.string().nullable(),
    proName: z.string().nullable(),
    title: z.string().nullable(),
    status: registrationStatus,
    currentStage: stageCode,
    currentStageStatus: stageStatus,
    completedStages: z.number().int().nonnegative(),
    totalStages: z.literal(7),
    registrationVersion: versionInt,
    updatedAt: z.string().nullable(),
  })
  .strip();

export const adminRegistrationIndexReceiptSchema = z
  .object({
    items: z.array(adminRegistrationIndexRow),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    pageSize: z.number().int().positive(),
  })
  .strip();

// resolve_company_active_registration `returns uuid` (a bare scalar).
const resolveCompanyActiveRegistrationReceipt = uuidSchema;

export type AdminRegistrationIndexRow = z.infer<typeof adminRegistrationIndexRow>;
export type AdminRegistrationIndexReceipt = z.infer<typeof adminRegistrationIndexReceiptSchema>;

// ---------------------------------------------------------------------------
// Command wrappers
// ---------------------------------------------------------------------------
export async function createRegistration(
  input: CreateRegistrationInput,
  actor: RegistrationActorContext,
  deps: RegistrationWorkflowDeps = {},
): Promise<CreateRegistrationReceipt> {
  const parsed = createRegistrationSchema.parse(input);
  const { actorId, tenantId } = parseActor({ ...actor, companyId: parsed.companyId });
  const logical = {
    companyId: parsed.companyId,
    title: parsed.title,
    priority: parsed.priority,
    dueAt: parsed.dueAt,
    operationId: parsed.operationId,
  };
  return callMutation(
    deps,
    'create_company_registration',
    {
      p_actor_id: actorId,
      p_tenant_id: tenantId,
      p_company_id: parsed.companyId,
      p_title: parsed.title,
      p_priority: parsed.priority,
      p_due_at: parsed.dueAt,
      p_operation_id: parsed.operationId,
      p_payload_hash: payloadHash('create_registration', logical),
    },
    createRegistrationReceipt,
  );
}

export async function transitionStage(
  input: TransitionStageInput,
  actor: RegistrationMutationActorContext,
  deps: RegistrationWorkflowDeps = {},
): Promise<TransitionStageReceipt> {
  const parsed = transitionStageSchema.parse(input);
  const { actorId, tenantId, companyId } = parseActor(actor);
  const actorAal = actorAalSchema.parse(actor.actorAal);
  const logical = {
    registrationId: parsed.registrationId,
    stageId: parsed.stageId,
    command: parsed.command,
    expectedRegistrationVersion: parsed.expectedRegistrationVersion,
    expectedStageVersion: parsed.expectedStageVersion,
    details: parsed.details,
    reasonCode: parsed.reasonCode,
    reasonText: parsed.reasonText,
    operationId: parsed.operationId,
  };
  return callMutation(
    deps,
    'transition_registration_stage',
    {
      p_actor_id: actorId,
      p_actor_aal: actorAal,
      p_tenant_id: tenantId,
      p_company_id: companyId,
      p_registration_id: parsed.registrationId,
      p_stage_id: parsed.stageId,
      p_command: parsed.command,
      p_expected_registration_version: parsed.expectedRegistrationVersion,
      p_expected_stage_version: parsed.expectedStageVersion,
      p_details: parsed.details,
      p_reason_code: parsed.reasonCode,
      p_reason_text: parsed.reasonText,
      p_operation_id: parsed.operationId,
      p_payload_hash: payloadHash('transition_stage', logical),
    },
    transitionStageReceipt,
  );
}

export async function linkStageDocument(
  input: LinkStageDocumentInput,
  actor: RegistrationMutationActorContext,
  deps: RegistrationWorkflowDeps = {},
): Promise<LinkStageDocumentReceipt> {
  const parsed = linkStageDocumentSchema.parse(input);
  const { actorId, tenantId, companyId } = parseActor(actor);
  const actorAal = actorAalSchema.parse(actor.actorAal);
  const logical = {
    registrationId: parsed.registrationId,
    stageId: parsed.stageId,
    documentId: parsed.documentId,
    documentVersionId: parsed.documentVersionId,
    role: parsed.role,
    operationId: parsed.operationId,
  };
  return callMutation(
    deps,
    'link_registration_stage_document',
    {
      p_actor_id: actorId,
      p_actor_aal: actorAal,
      p_tenant_id: tenantId,
      p_company_id: companyId,
      p_registration_id: parsed.registrationId,
      p_stage_id: parsed.stageId,
      p_document_id: parsed.documentId,
      p_document_version_id: parsed.documentVersionId,
      p_role: parsed.role,
      p_operation_id: parsed.operationId,
      p_payload_hash: payloadHash('link_document', logical),
    },
    linkStageDocumentReceipt,
  );
}

export async function unlinkStageDocument(
  input: UnlinkStageDocumentInput,
  actor: RegistrationMutationActorContext,
  deps: RegistrationWorkflowDeps = {},
): Promise<UnlinkStageDocumentReceipt> {
  const parsed = unlinkStageDocumentSchema.parse(input);
  const { actorId, tenantId, companyId } = parseActor(actor);
  const actorAal = actorAalSchema.parse(actor.actorAal);
  const logical = {
    registrationId: parsed.registrationId,
    stageId: parsed.stageId,
    linkId: parsed.linkId,
    operationId: parsed.operationId,
  };
  return callMutation(
    deps,
    'unlink_registration_stage_document',
    {
      p_actor_id: actorId,
      p_actor_aal: actorAal,
      p_tenant_id: tenantId,
      p_company_id: companyId,
      p_registration_id: parsed.registrationId,
      p_stage_id: parsed.stageId,
      p_link_id: parsed.linkId,
      p_operation_id: parsed.operationId,
      p_payload_hash: payloadHash('unlink_document', logical),
    },
    unlinkStageDocumentReceipt,
  );
}

// Admin AAL2 recovery path. Actor context is operator-scoped: it still carries
// tenant + company for the RPC, plus the confirmed AAL.
export async function recoverUnlinkStageDocument(
  input: RecoverUnlinkStageDocumentInput,
  actor: RegistrationActorContext & { actorAal: string },
  deps: RegistrationWorkflowDeps = {},
): Promise<RecoverUnlinkStageDocumentReceipt> {
  const parsed = recoverUnlinkStageDocumentSchema.parse(input);
  const { actorId, tenantId, companyId } = parseActor(actor);
  const actorAal = z.string().parse(actor.actorAal);
  const logical = {
    registrationId: parsed.registrationId,
    stageId: parsed.stageId,
    linkId: parsed.linkId,
    reason: parsed.reason,
    operationId: parsed.operationId,
  };
  return callMutation(
    deps,
    'recover_unlink_registration_stage_document',
    {
      p_actor_id: actorId,
      p_actor_aal: actorAal,
      p_tenant_id: tenantId,
      p_company_id: companyId,
      p_registration_id: parsed.registrationId,
      p_stage_id: parsed.stageId,
      p_link_id: parsed.linkId,
      p_reason: parsed.reason,
      p_operation_id: parsed.operationId,
      p_payload_hash: payloadHash('recover_unlink_document', logical),
    },
    recoverUnlinkStageDocumentReceipt,
  );
}

export async function createVisaPerson(
  input: CreateVisaPersonInput,
  actor: RegistrationActorContext,
  deps: RegistrationWorkflowDeps = {},
): Promise<CreateVisaPersonReceipt> {
  const parsed = createVisaPersonSchema.parse(input);
  const { actorId, tenantId, companyId } = parseActor(actor);
  const shareholderId = parsed.personKind === 'shareholder' ? parsed.shareholderId : null;
  const employeeId = parsed.personKind === 'employee' ? parsed.employeeId : null;
  const logical = {
    registrationId: parsed.registrationId,
    personKind: parsed.personKind,
    shareholderId,
    employeeId,
    displayName: parsed.displayName,
    visaKind: parsed.visaKind,
    operationId: parsed.operationId,
  };
  return callMutation(
    deps,
    'create_registration_visa_person',
    {
      p_actor_id: actorId,
      p_tenant_id: tenantId,
      p_company_id: companyId,
      p_registration_id: parsed.registrationId,
      p_person_kind: parsed.personKind,
      p_shareholder_id: shareholderId,
      p_employee_id: employeeId,
      p_display_name: parsed.displayName,
      p_visa_kind: parsed.visaKind,
      p_operation_id: parsed.operationId,
      p_payload_hash: payloadHash('create_visa_person', logical),
    },
    createVisaPersonReceipt,
  );
}

export async function transitionVisaPerson(
  input: TransitionVisaPersonInput,
  actor: RegistrationMutationActorContext,
  deps: RegistrationWorkflowDeps = {},
): Promise<TransitionVisaPersonReceipt> {
  const parsed = transitionVisaPersonSchema.parse(input);
  const { actorId, tenantId, companyId } = parseActor(actor);
  const actorAal = actorAalSchema.parse(actor.actorAal);
  const logical = {
    registrationId: parsed.registrationId,
    visaPersonId: parsed.visaPersonId,
    command: parsed.command,
    toStage: parsed.toStage,
    expectedVisaVersion: parsed.expectedVisaVersion,
    reasonCode: parsed.reasonCode,
    reasonText: parsed.reasonText,
    operationId: parsed.operationId,
  };
  return callMutation(
    deps,
    'transition_registration_visa_person',
    {
      p_actor_id: actorId,
      p_actor_aal: actorAal,
      p_tenant_id: tenantId,
      p_company_id: companyId,
      p_registration_id: parsed.registrationId,
      p_visa_person_id: parsed.visaPersonId,
      p_command: parsed.command,
      p_to_stage: parsed.toStage,
      p_expected_visa_version: parsed.expectedVisaVersion,
      p_reason_code: parsed.reasonCode,
      p_reason_text: parsed.reasonText,
      p_operation_id: parsed.operationId,
      p_payload_hash: payloadHash('transition_visa_person', logical),
    },
    transitionVisaPersonReceipt,
  );
}

export async function cancelVisaPerson(
  input: CancelVisaPersonInput,
  actor: RegistrationMutationActorContext,
  deps: RegistrationWorkflowDeps = {},
): Promise<TransitionVisaPersonReceipt> {
  const parsed = cancelVisaPersonSchema.parse(input);
  const { actorId, tenantId, companyId } = parseActor(actor);
  const actorAal = actorAalSchema.parse(actor.actorAal);
  const logical = {
    registrationId: parsed.registrationId,
    visaPersonId: parsed.visaPersonId,
    expectedVisaVersion: parsed.expectedVisaVersion,
    reasonCode: parsed.reasonCode,
    reasonText: parsed.reasonText,
    operationId: parsed.operationId,
  };
  return callMutation(
    deps,
    'cancel_registration_visa_person',
    {
      p_actor_id: actorId,
      p_actor_aal: actorAal,
      p_tenant_id: tenantId,
      p_company_id: companyId,
      p_registration_id: parsed.registrationId,
      p_visa_person_id: parsed.visaPersonId,
      p_expected_visa_version: parsed.expectedVisaVersion,
      p_reason_code: parsed.reasonCode,
      p_reason_text: parsed.reasonText,
      p_operation_id: parsed.operationId,
      p_payload_hash: payloadHash('cancel_visa_person', logical),
    },
    transitionVisaPersonReceipt,
  );
}

// ---------------------------------------------------------------------------
// Read wrappers
// ---------------------------------------------------------------------------
export async function readProRegistration(
  registrationId: string,
  actor: RegistrationActorContext,
  deps: RegistrationWorkflowDeps = {},
): Promise<ProRegistrationRead> {
  const parsed = readRegistrationSchema.parse({ registrationId });
  const { actorId, tenantId, companyId } = parseActor(actor);
  return callRead(
    deps,
    'read_pro_registration_workflow',
    {
      p_actor_id: actorId,
      p_tenant_id: tenantId,
      p_company_id: companyId,
      p_registration_id: parsed.registrationId,
    },
    proRegistrationReadSchema,
  );
}

export async function readOperatorRegistration(
  registrationId: string,
  actor: OperatorActorContext,
  deps: RegistrationWorkflowDeps = {},
): Promise<OperatorRegistrationRead> {
  const parsed = readRegistrationSchema.parse({ registrationId });
  const actorId = uuidSchema.parse(actor.actorId);
  const actorAal = z.string().parse(actor.actorAal);
  return callRead(
    deps,
    'read_operator_registration_workflow',
    {
      p_actor_id: actorId,
      p_actor_aal: actorAal,
      p_registration_id: parsed.registrationId,
    },
    operatorRegistrationReadSchema,
  );
}

export async function readCustomerRegistration(
  registrationId: string,
  actorId: string,
  deps: RegistrationWorkflowDeps = {},
): Promise<CustomerRegistrationRead> {
  const parsed = readRegistrationSchema.parse({ registrationId });
  const parsedActorId = uuidSchema.parse(actorId);
  return callRead(
    deps,
    'read_customer_registration_progress',
    {
      p_actor_id: parsedActorId,
      p_registration_id: parsed.registrationId,
    },
    customerRegistrationReadSchema,
  );
}

// Employee-scoped visa read. Keyed by the actor's OWN employee_id inside the
// RPC (via the active employees link), so an employee only ever sees their own
// visa person — never person[0] or anyone else's. Absence raises
// REGISTRATION_NOT_FOUND (fail closed at the caller).
export async function readEmployeeVisaPerson(
  registrationId: string,
  context: RegistrationActorContext,
  deps: RegistrationWorkflowDeps = {},
): Promise<EmployeeVisaPersonRead> {
  const parsed = readRegistrationSchema.parse({ registrationId });
  const { actorId } = parseActor(context);
  return callRead(
    deps,
    'read_employee_visa_person',
    {
      p_actor_id: actorId,
      p_registration_id: parsed.registrationId,
    },
    employeeVisaPersonReadSchema,
  );
}

// ---------------------------------------------------------------------------
// Admin registration index (operator, AAL2). Returns safe summary rows plus an
// exact total for pagination. Filters are Zod-parsed to a nullable uuid/enum
// contract before being handed to the RPC.
// ---------------------------------------------------------------------------
export async function readAdminRegistrationIndex(
  context: OperatorActorContext,
  query: AdminRegistrationIndexQueryInput,
  deps: RegistrationWorkflowDeps = {},
): Promise<AdminRegistrationIndexReceipt> {
  const parsedQuery = adminRegistrationIndexQuerySchema.parse(query);
  const actorId = uuidSchema.parse(context.actorId);
  const actorAal = z.string().parse(context.actorAal);
  return callRead(
    deps,
    'read_admin_registration_index',
    {
      p_actor_id: actorId,
      p_actor_aal: actorAal,
      p_company: parsedQuery.company,
      p_pro: parsedQuery.pro,
      p_stage: parsedQuery.stage,
      p_status: parsedQuery.status,
      p_page: parsedQuery.page,
    },
    adminRegistrationIndexReceiptSchema,
  );
}

// ---------------------------------------------------------------------------
// Resolve the single active registration for a company from fresh DB state.
// The RPC enforces the caller's scope (assigned PRO / linked customer / active
// employee) against tenant + company; returns the registration id, or null when
// the RPC raises REGISTRATION_NOT_FOUND (no active registration in scope).
// ---------------------------------------------------------------------------
export type ResolveActiveRegistrationRole = 'pro' | 'customer' | 'employee';

export async function resolveCompanyActiveRegistration(
  context: RegistrationActorContext & { role: ResolveActiveRegistrationRole },
  deps: RegistrationWorkflowDeps = {},
): Promise<string | null> {
  const { actorId, tenantId, companyId } = parseActor(context);
  const role = z.enum(['pro', 'customer', 'employee']).parse(context.role);
  try {
    return await callRead(
      deps,
      'resolve_company_active_registration',
      {
        p_actor_id: actorId,
        p_tenant_id: tenantId,
        p_company_id: companyId,
        p_role: role,
      },
      resolveCompanyActiveRegistrationReceipt,
    );
  } catch (error) {
    if (error instanceof ApiError && error.code === 'REGISTRATION_NOT_FOUND') return null;
    throw error;
  }
}
