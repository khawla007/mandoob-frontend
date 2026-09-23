import 'server-only';

import { randomBytes, timingSafeEqual } from 'node:crypto';

import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { LEAD_SCORE_VERSION, scoreLead } from '@/lib/leads/scoring';
import { hashOpaqueCredential, hashRequest } from './security';

// P3.05 public application drafts bind a high-entropy opaque resume credential.
// Only the HMAC of the credential is persisted; the plaintext is returned to the
// caller exactly once at creation and never stored or logged.
const RESUME_SECRET_BYTES = 32;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function resumePepper(): string {
  const pepper = process.env.ENCRYPTION_KEY;
  if (!pepper || pepper.length < 16) throw new Error('RESUME_PEPPER_UNAVAILABLE');
  return pepper;
}

export function generateResumeSecret(): string {
  return randomBytes(RESUME_SECRET_BYTES).toString('base64url');
}

function resumeHash(resumeSecret: string): string {
  return hashOpaqueCredential(resumeSecret, resumePepper());
}

// Exposed so the attachment adapter binds the same resume credential the draft RPCs expect.
export function hashResumeSecret(resumeSecret: string): string {
  return resumeHash(resumeSecret);
}

function timingSafeHashEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export type PublishedDefinitionRef = {
  definitionId: string;
  version: number;
};

export async function resolvePublishedDefinition(
  definitionKey: string,
): Promise<PublishedDefinitionRef | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('questionnaire_definitions')
    .select('id, current_published_version')
    .eq('definition_key', definitionKey)
    .maybeSingle();
  if (error || !data || !data.current_published_version) return null;
  return { definitionId: data.id, version: data.current_published_version };
}

export type CreateDraftInput = {
  operationId: string;
  definitionKey: string;
  now?: number;
};

export type DraftCreation = {
  draftId: string;
  version: number;
  expiresAt: string;
  resumeSecret: string;
};

export async function createApplicationDraft(input: CreateDraftInput): Promise<DraftCreation> {
  const published = await resolvePublishedDefinition(input.definitionKey);
  if (!published) throw new Error('DEFINITION_UNAVAILABLE');
  const resumeSecret = generateResumeSecret();
  const expiresAt = new Date((input.now ?? Date.now()) + DRAFT_TTL_MS).toISOString();
  const requestHash = hashRequest({
    definitionId: published.definitionId,
    version: published.version,
    scope: 'draft_create',
  });
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.rpc(
    'create_public_application_draft' as never,
    {
      p_operation_id: input.operationId,
      p_request_hash: requestHash,
      p_definition_id: published.definitionId,
      p_definition_version: published.version,
      p_resume_secret_hash: resumeHash(resumeSecret),
      p_expires_at: expiresAt,
    } as never,
  );
  if (error || !data) throw new Error('DRAFT_CREATE_UNAVAILABLE');
  const receipt = data as unknown as { draftId: string; version: number; expiresAt: string };
  return { ...receipt, resumeSecret };
}

export type DraftView = {
  draftId: string;
  version: number;
  answers: Record<string, unknown>;
  expiresAt: string;
  definitionId: string;
  definitionVersion: number;
};

export async function resumeApplicationDraft(
  draftId: string,
  resumeSecret: string,
): Promise<DraftView | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('public_application_drafts')
    .select(
      'id, resume_secret_hash, answers, row_version, expires_at, definition_id, definition_version, state',
    )
    .eq('id', draftId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.state !== 'draft' || new Date(data.expires_at).getTime() <= Date.now()) return null;
  if (!timingSafeHashEqual(data.resume_secret_hash, resumeHash(resumeSecret))) return null;
  return {
    draftId: data.id,
    version: data.row_version,
    answers: (data.answers ?? {}) as Record<string, unknown>,
    expiresAt: data.expires_at,
    definitionId: data.definition_id,
    definitionVersion: data.definition_version,
  };
}

export type SaveDraftInput = {
  draftId: string;
  resumeSecret: string;
  operationId: string;
  expectedVersion: number;
  answers: Record<string, unknown>;
};

export type DraftSave = { draftId: string; version: number; saved: true };

export async function saveApplicationDraft(input: SaveDraftInput): Promise<DraftSave> {
  const admin = createSupabaseServiceRoleClient();
  const requestHash = hashRequest({
    answers: input.answers,
    expectedVersion: input.expectedVersion,
    scope: 'draft_save',
  });
  const { data, error } = await admin.rpc(
    'save_public_application_draft' as never,
    {
      p_draft_id: input.draftId,
      p_resume_secret_hash: resumeHash(input.resumeSecret),
      p_operation_id: input.operationId,
      p_request_hash: requestHash,
      p_expected_version: input.expectedVersion,
      p_answers: input.answers,
    } as never,
  );
  if (error || !data) throw new Error(mapRpcError(error));
  return data as unknown as DraftSave;
}

export type SubmitApplicationInput = {
  draftId: string;
  resumeSecret: string;
  operationId: string;
  expectedVersion: number;
  answers: Record<string, unknown>;
  estimateData?: Record<string, unknown> | null;
  consentProvenance: Record<string, unknown>;
};

export type ApplicationSubmission = {
  applicationId: string;
  leadId: string;
  accepted: true;
  deliveryState: 'pending' | 'suppressed' | 'unavailable' | 'delivered';
};

export async function submitApplication(
  input: SubmitApplicationInput,
): Promise<ApplicationSubmission> {
  const scored = scoreLead({ answers: input.answers, estimateData: input.estimateData });
  const admin = createSupabaseServiceRoleClient();
  const requestHash = hashRequest({
    expectedVersion: input.expectedVersion,
    scope: 'application_submit',
  });
  const { data, error } = await admin.rpc(
    'submit_public_application' as never,
    {
      p_draft_id: input.draftId,
      p_resume_secret_hash: resumeHash(input.resumeSecret),
      p_operation_id: input.operationId,
      p_request_hash: requestHash,
      p_expected_version: input.expectedVersion,
      p_score: scored.score,
      p_score_version: LEAD_SCORE_VERSION,
      p_score_factors: scored.factors,
      p_consent_provenance: input.consentProvenance,
    } as never,
  );
  if (error || !data) throw new Error(mapRpcError(error));
  return data as unknown as ApplicationSubmission;
}

// Translate Postgres SQLSTATE from the intake RPCs into stable, non-leaking codes.
function mapRpcError(error: { code?: string; message?: string } | null): string {
  if (error?.code === '40001' || error?.message?.includes('STALE')) return 'VERSION_CONFLICT';
  if (error?.code === '23505' || error?.message?.includes('OPERATION_REUSED'))
    return 'OPERATION_CONFLICT';
  if (error?.message?.includes('DRAFT_UNAVAILABLE')) return 'DRAFT_UNAVAILABLE';
  if (error?.message?.includes('ATTACHMENT_NOT_READY')) return 'ATTACHMENT_NOT_READY';
  return 'INTAKE_UNAVAILABLE';
}
