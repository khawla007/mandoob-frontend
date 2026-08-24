import 'server-only';

import { z } from 'zod';

import { createBlindIndex, encrypt } from '@/lib/crypto/pii';
import { ApiError } from '@/lib/errors';
import { PRO_CREDENTIAL_STATES } from '@/lib/pro-lifecycle/contracts';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  proCredentialDraftSaveSchema,
  proCredentialEvidenceMetadataSchema,
  proCredentialReviewSchema,
} from '@/lib/validation/pro-lifecycle';

type RpcResult = { data: unknown; error: { message?: string } | null };
type CredentialClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
};
type CredentialDeps = { supabase?: CredentialClient };

const uuid = z.string().uuid();
const credentialMaskSchema = z
  .object({
    credentialId: uuid,
    type: z.literal('pro_license'),
    maskedIdentifier: z
      .string()
      .regex(/^•••• [A-Z0-9]{4}$/u)
      .nullable(),
    issuingAuthority: z.string().nullable(),
    issueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
    expiryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
    state: z.enum(PRO_CREDENTIAL_STATES),
    version: z.number().int().nonnegative(),
    evidenceCount: z.number().int().nonnegative(),
    submittedAt: z.string().datetime({ offset: true }).nullable(),
    supersedesCredentialId: uuid.nullable(),
  })
  .strict();
const evidenceSchema = z
  .object({
    evidenceId: uuid,
    credentialId: uuid,
    mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
    sizeBytes: z.number().int().positive(),
    originalNameSafe: z.string().min(1).max(255),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
const snapshotSchema = z
  .object({
    credentials: z.array(credentialMaskSchema),
    evidence: z.array(evidenceSchema),
  })
  .strict();
const openedEvidenceSchema = z
  .object({
    evidence_id: uuid,
    pro_profile_id: uuid,
    credential_id: uuid,
    storage_path: z.string().min(1),
    mime_type: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
    size_bytes: z.number().int().positive(),
    original_name_safe: z.string().min(1).max(255),
  })
  .strict();
const preparedEvidenceRemovalSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('prepared'),
      credentialId: uuid,
      evidenceId: uuid,
      storagePath: z.string().min(1),
    })
    .strict(),
  z.object({ status: z.literal('complete'), credential: credentialMaskSchema }).strict(),
]);

export type ProCredentialMask = z.infer<typeof credentialMaskSchema>;
export type ProCredentialSnapshot = z.infer<typeof snapshotSchema>;
export type OpenedProCredentialEvidence = z.infer<typeof openedEvidenceSchema>;
export type PreparedProCredentialEvidenceRemoval = z.infer<typeof preparedEvidenceRemovalSchema>;

const CREDENTIAL_INDEX_DOMAIN = 'pro-credential-license:v1';
const OPERATION_HASH_DOMAIN = 'pro-lifecycle-operation:v1';
const KNOWN_ERRORS: Record<string, { code: string; status: number }> = {
  NOT_FOUND: { code: 'NOT_FOUND', status: 404 },
  CREDENTIAL_IN_PROGRESS: { code: 'CREDENTIAL_IN_PROGRESS', status: 409 },
  STALE_CREDENTIAL_VERSION: { code: 'STALE_CREDENTIAL_VERSION', status: 409 },
  INVALID_CREDENTIAL_TRANSITION: { code: 'INVALID_CREDENTIAL_TRANSITION', status: 409 },
  CREDENTIAL_INCOMPLETE: { code: 'CREDENTIAL_INCOMPLETE', status: 409 },
  CREDENTIAL_IDENTIFIER_REQUIRED: { code: 'CREDENTIAL_IDENTIFIER_REQUIRED', status: 409 },
  OPERATION_REUSED: { code: 'OPERATION_REUSED', status: 409 },
  PRO_CREDENTIAL_EXPIRED: { code: 'PRO_CREDENTIAL_EXPIRED', status: 409 },
  EVIDENCE_PATH_INVALID: { code: 'EVIDENCE_PATH_INVALID', status: 422 },
  EVIDENCE_METADATA_INVALID: { code: 'EVIDENCE_METADATA_INVALID', status: 422 },
  DECISION_REASON_INVALID: { code: 'DECISION_REASON_INVALID', status: 422 },
  INVALID_DECISION_REASON: { code: 'DECISION_REASON_INVALID', status: 422 },
  EVIDENCE_REMOVAL_IN_PROGRESS: { code: 'EVIDENCE_REMOVAL_IN_PROGRESS', status: 409 },
};

function client(deps: CredentialDeps): CredentialClient {
  return deps.supabase ?? (createSupabaseServiceRoleClient() as unknown as CredentialClient);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function operationHash(name: string, value: unknown): string {
  return createBlindIndex(OPERATION_HASH_DOMAIN, canonicalJson({ operation: name, value }));
}

function publicError(message?: string): ApiError {
  const mapped = message ? KNOWN_ERRORS[message.trim()] : undefined;
  return mapped
    ? new ApiError(mapped.code, 'Unable to update PRO credential', mapped.status)
    : new ApiError('INTERNAL', 'Unable to update PRO credential', 500);
}

async function maskMutation(
  name: string,
  args: Record<string, unknown>,
  deps: CredentialDeps,
): Promise<ProCredentialMask> {
  const { data, error } = await client(deps).rpc(name, args);
  if (error) throw publicError(error.message);
  const parsed = credentialMaskSchema.safeParse(data);
  if (!parsed.success) throw publicError();
  return parsed.data;
}

export async function readProCredentialSnapshot(
  actorId: string,
  proProfileId: string,
  deps: CredentialDeps = {},
): Promise<ProCredentialSnapshot> {
  const { data, error } = await client(deps).rpc('read_pro_credential_snapshot', {
    p_actor_id: uuid.parse(actorId),
    p_pro_profile_id: uuid.parse(proProfileId),
  });
  if (error) throw new ApiError('INTERNAL', 'Unable to load PRO credentials', 500);
  const parsed = snapshotSchema.safeParse(data);
  if (!parsed.success) throw new ApiError('INTERNAL', 'Unable to load PRO credentials', 500);
  return parsed.data;
}

export async function createProCredentialDraft(
  actorId: string,
  proProfileId: string,
  operationId: string,
  deps: CredentialDeps = {},
): Promise<ProCredentialMask> {
  const parsedActor = uuid.parse(actorId);
  const parsedPro = uuid.parse(proProfileId);
  const parsedOperation = uuid.parse(operationId);
  return maskMutation(
    'create_pro_credential_draft',
    {
      p_actor_id: parsedActor,
      p_pro_profile_id: parsedPro,
      p_operation_id: parsedOperation,
      p_payload_hash: operationHash('create_pro_credential_draft', { proProfileId: parsedPro }),
    },
    deps,
  );
}

export async function saveProCredentialDraft(
  actorId: string,
  credentialId: string,
  input: z.input<typeof proCredentialDraftSaveSchema> & {
    command?: 'save';
    credentialId?: string;
  },
  deps: CredentialDeps = {},
): Promise<ProCredentialMask> {
  const {
    command: _alreadyBoundCommand,
    credentialId: _alreadyBoundCredentialId,
    ...draftInput
  } = input;
  const parsed = proCredentialDraftSaveSchema.parse(draftInput);
  const preserveIdentifier = parsed.identifier === '';
  const identifierHash = preserveIdentifier
    ? null
    : createBlindIndex(CREDENTIAL_INDEX_DOMAIN, parsed.identifier);
  const protectedIdentifier = preserveIdentifier ? null : encrypt(parsed.identifier);
  const logical = {
    credentialId: uuid.parse(credentialId),
    expectedVersion: parsed.expectedVersion,
    identifierHash,
    preserveIdentifier,
    issuingAuthority: parsed.issuingAuthority,
    issueDate: parsed.issueDate,
    expiryDate: parsed.expiryDate,
  };
  return maskMutation(
    'save_pro_credential_draft',
    {
      p_actor_id: uuid.parse(actorId),
      p_credential_id: logical.credentialId,
      p_expected_version: parsed.expectedVersion,
      p_operation_id: parsed.operationId,
      p_payload_hash: operationHash('save_pro_credential_draft', logical),
      p_preserve_identifier: preserveIdentifier,
      p_identifier_ciphertext: protectedIdentifier,
      p_identifier_hash: identifierHash,
      p_identifier_last4: preserveIdentifier ? null : parsed.identifier.slice(-4),
      p_issuing_authority: parsed.issuingAuthority,
      p_issue_date: parsed.issueDate,
      p_expiry_date: parsed.expiryDate,
    },
    deps,
  );
}

async function versionMutation(
  name: string,
  actorId: string,
  credentialId: string,
  expectedVersion: number,
  operationId: string,
  extra: Record<string, unknown>,
  deps: CredentialDeps,
): Promise<ProCredentialMask> {
  const logical = {
    credentialId: uuid.parse(credentialId),
    expectedVersion: z.number().int().nonnegative().parse(expectedVersion),
    ...extra,
  };
  return maskMutation(
    name,
    {
      p_actor_id: uuid.parse(actorId),
      p_credential_id: logical.credentialId,
      p_expected_version: logical.expectedVersion,
      p_operation_id: uuid.parse(operationId),
      p_payload_hash: operationHash(name, logical),
      ...extra,
    },
    deps,
  );
}

export function submitProCredential(
  actorId: string,
  credentialId: string,
  expectedVersion: number,
  operationId: string,
  deps: CredentialDeps = {},
) {
  return versionMutation(
    'submit_pro_credential',
    actorId,
    credentialId,
    expectedVersion,
    operationId,
    {},
    deps,
  );
}

export async function reviewProCredential(
  actorId: string,
  credentialId: string,
  input: z.input<typeof proCredentialReviewSchema> & { credentialId?: string },
  deps: CredentialDeps = {},
): Promise<ProCredentialMask> {
  const { credentialId: _alreadyBoundCredentialId, ...reviewInput } = input;
  const parsed = proCredentialReviewSchema.parse(reviewInput);
  const names = {
    begin_review: 'begin_pro_credential_review',
    verify: 'verify_pro_credential',
    reject: 'reject_pro_credential',
    revoke: 'revoke_pro_credential',
  } as const;
  const extra =
    parsed.command === 'reject' || parsed.command === 'revoke'
      ? { p_reason_code: parsed.reasonCode, p_reason: parsed.reason }
      : {};
  return versionMutation(
    names[parsed.command],
    actorId,
    credentialId,
    parsed.expectedVersion,
    parsed.operationId,
    extra,
    deps,
  );
}

export function createProCredentialReplacement(
  actorId: string,
  credentialId: string,
  expectedVersion: number,
  operationId: string,
  deps: CredentialDeps = {},
) {
  return versionMutation(
    'create_pro_credential_replacement',
    actorId,
    credentialId,
    expectedVersion,
    operationId,
    {},
    deps,
  );
}

export async function registerProCredentialEvidence(
  actorId: string,
  credentialId: string,
  expectedVersion: number,
  operationId: string,
  evidenceId: string,
  storagePath: string,
  metadata: z.input<typeof proCredentialEvidenceMetadataSchema>,
  deps: CredentialDeps = {},
): Promise<ProCredentialMask> {
  const parsed = proCredentialEvidenceMetadataSchema.parse(metadata);
  const logical = {
    credentialId: uuid.parse(credentialId),
    expectedVersion: z.number().int().nonnegative().parse(expectedVersion),
    evidenceId: uuid.parse(evidenceId),
    storagePath,
    mimeType: parsed.mimeType,
    sizeBytes: parsed.sizeBytes,
    sha256: parsed.sha256,
    originalNameSafe: parsed.originalNameSafe,
  };
  return maskMutation(
    'register_pro_credential_evidence',
    {
      p_actor_id: uuid.parse(actorId),
      p_credential_id: logical.credentialId,
      p_expected_version: logical.expectedVersion,
      p_operation_id: uuid.parse(operationId),
      p_payload_hash: operationHash('register_pro_credential_evidence', logical),
      p_evidence_id: logical.evidenceId,
      p_storage_path: storagePath,
      p_mime_type: parsed.mimeType,
      p_size_bytes: parsed.sizeBytes,
      p_sha256: parsed.sha256,
      p_original_name_safe: parsed.originalNameSafe,
      p_scan_provider: parsed.scanProvider,
      p_scan_completed_at: parsed.scanCompletedAt,
    },
    deps,
  );
}

function evidenceRemovalArgs(
  actorId: string,
  credentialId: string,
  evidenceId: string,
  expectedVersion: number,
  operationId: string,
): Record<string, unknown> {
  const logical = {
    credentialId: uuid.parse(credentialId),
    expectedVersion: z.number().int().nonnegative().parse(expectedVersion),
    p_evidence_id: uuid.parse(evidenceId),
  };
  return {
    p_actor_id: uuid.parse(actorId),
    p_credential_id: logical.credentialId,
    p_evidence_id: logical.p_evidence_id,
    p_expected_version: logical.expectedVersion,
    p_operation_id: uuid.parse(operationId),
    p_payload_hash: operationHash('remove_pro_credential_evidence', logical),
  };
}

export async function prepareProCredentialEvidenceRemoval(
  actorId: string,
  credentialId: string,
  evidenceId: string,
  expectedVersion: number,
  operationId: string,
  deps: CredentialDeps = {},
): Promise<PreparedProCredentialEvidenceRemoval> {
  const { data, error } = await client(deps).rpc(
    'prepare_pro_credential_evidence_removal',
    evidenceRemovalArgs(actorId, credentialId, evidenceId, expectedVersion, operationId),
  );
  if (error) throw publicError(error.message);
  const parsed = preparedEvidenceRemovalSchema.safeParse(data);
  if (!parsed.success) throw publicError();
  return parsed.data;
}

export async function finalizeProCredentialEvidenceRemoval(
  actorId: string,
  credentialId: string,
  evidenceId: string,
  expectedVersion: number,
  operationId: string,
  deps: CredentialDeps = {},
): Promise<ProCredentialMask> {
  return maskMutation(
    'finalize_pro_credential_evidence_removal',
    evidenceRemovalArgs(actorId, credentialId, evidenceId, expectedVersion, operationId),
    deps,
  );
}

export async function openProCredentialEvidenceMetadata(
  actorId: string,
  evidenceId: string,
  deps: CredentialDeps = {},
): Promise<OpenedProCredentialEvidence> {
  const { data, error } = await client(deps).rpc('open_pro_credential_evidence_metadata', {
    p_actor_id: uuid.parse(actorId),
    p_evidence_id: uuid.parse(evidenceId),
  });
  if (error) throw publicError(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  const parsed = openedEvidenceSchema.safeParse(row);
  if (!parsed.success) throw publicError();
  return parsed.data;
}
