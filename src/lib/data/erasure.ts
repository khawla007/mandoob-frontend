import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { ApiError } from '@/lib/errors';
import { env } from '@/lib/env';
import { enqueueEmail } from '@/lib/mail/send';
import { consumeRateLimit } from '@/lib/rate-limit';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export const ERASURE_STATUSES = [
  'pending_verification',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'completed',
  'cancelled',
] as const;

export type ErasureRequestStatus = (typeof ERASURE_STATUSES)[number];

export type FieldDiff = {
  before: unknown;
  after: unknown;
};

type DiffMap = Record<string, FieldDiff>;

const REDACTED = '[redacted]';
const PII_DOCUMENT_TYPES = ['passport', 'visa', 'emirates_id', 'shareholder_id'] as const;
const ACTIVE_ERASURE_STATUSES = new Set<ErasureRequestStatus>([
  'pending_verification',
  'submitted',
  'under_review',
  'approved',
]);

export type EmployeeErasureRow = {
  name: string | null;
  email: string | null;
  phone: string | null;
  passport_no_encrypted: string | null;
  visa_no_encrypted: string | null;
  emirates_id_encrypted: string | null;
  nationality?: string | null;
  status?: string | null;
};

export type CustomerErasureRows = {
  profile: {
    full_name: string | null;
    phone: string | null;
    username: string | null;
    title: string | null;
    bio: string | null;
  };
  customerProfile: {
    nationality: string | null;
    passport_no_encrypted: string | null;
    linked_client_id: string | null;
  };
};

export type ErasureSubjectKind = 'customer' | 'employee';

export type ErasureRequestSummary = {
  id: string;
  subjectKind: ErasureSubjectKind;
  subjectUserId: string;
  subjectTenantId: string;
  subjectName: string | null;
  subjectEmail: string | null;
  tenantName: string | null;
  reason: string | null;
  recoveryEmail: string;
  status: ErasureRequestStatus;
  submittedAt: string;
  verifiedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
  rejectionReason: string | null;
  anonymizationDiff: Record<string, unknown> | null;
};

type SupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

function setDiff(
  diff: DiffMap,
  update: Record<string, unknown>,
  key: string,
  before: unknown,
  after: unknown,
) {
  update[key] = after;
  diff[key] = { before, after };
}

export function isActiveErasureStatus(status: ErasureRequestStatus): boolean {
  return ACTIVE_ERASURE_STATUSES.has(status);
}

export function anonymizeEmployeeFields(row: EmployeeErasureRow): {
  update: Record<string, unknown>;
  diff: DiffMap;
} {
  const update: Record<string, unknown> = {};
  const diff: DiffMap = {};

  setDiff(diff, update, 'name', row.name, REDACTED);
  setDiff(diff, update, 'email', row.email, null);
  setDiff(diff, update, 'phone', row.phone, null);
  setDiff(diff, update, 'passport_no_encrypted', row.passport_no_encrypted, REDACTED);
  setDiff(diff, update, 'visa_no_encrypted', row.visa_no_encrypted, REDACTED);
  setDiff(diff, update, 'emirates_id_encrypted', row.emirates_id_encrypted, REDACTED);

  return { update, diff };
}

export function anonymizeCustomerFields(row: CustomerErasureRows): {
  profileUpdate: Record<string, unknown>;
  customerProfileUpdate: Record<string, unknown>;
  diff: { profile: DiffMap; customerProfile: DiffMap };
} {
  const profileUpdate: Record<string, unknown> = {};
  const customerProfileUpdate: Record<string, unknown> = {};
  const profile: DiffMap = {};
  const customerProfile: DiffMap = {};

  setDiff(profile, profileUpdate, 'full_name', row.profile.full_name, REDACTED);
  setDiff(profile, profileUpdate, 'phone', row.profile.phone, null);
  setDiff(profile, profileUpdate, 'username', row.profile.username, null);
  setDiff(profile, profileUpdate, 'title', row.profile.title, null);
  setDiff(profile, profileUpdate, 'bio', row.profile.bio, null);
  setDiff(customerProfile, customerProfileUpdate, 'nationality', row.customerProfile.nationality, null);
  setDiff(
    customerProfile,
    customerProfileUpdate,
    'passport_no_encrypted',
    row.customerProfile.passport_no_encrypted,
    REDACTED,
  );

  return { profileUpdate, customerProfileUpdate, diff: { profile, customerProfile } };
}

function client(deps: { supabase?: SupabaseClient } = {}) {
  return deps.supabase ?? createSupabaseServiceRoleClient();
}

function appUrl(path: string): string {
  const protocol = env.NEXT_PUBLIC_ROOT_DOMAIN.startsWith('localhost') ? 'http' : 'https';
  return `${protocol}://${env.NEXT_PUBLIC_ROOT_DOMAIN}${path}`;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateVerificationToken(): string {
  return randomBytes(32).toString('base64url');
}

function toSummary(row: Record<string, unknown>): ErasureRequestSummary {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
  const p = (profile ?? {}) as Record<string, unknown>;
  const t = (tenant ?? {}) as Record<string, unknown>;
  return {
    id: row.id as string,
    subjectKind: row.subject_kind as ErasureSubjectKind,
    subjectUserId: row.subject_user_id as string,
    subjectTenantId: row.subject_tenant_id as string,
    subjectName: (p.full_name as string | null | undefined) ?? null,
    subjectEmail: null,
    tenantName: (t.name as string | null | undefined) ?? null,
    reason: (row.reason as string | null | undefined) ?? null,
    recoveryEmail: row.recovery_email as string,
    status: row.status as ErasureRequestStatus,
    submittedAt: row.submitted_at as string,
    verifiedAt: (row.verified_at as string | null | undefined) ?? null,
    reviewedBy: (row.reviewed_by as string | null | undefined) ?? null,
    reviewedAt: (row.reviewed_at as string | null | undefined) ?? null,
    completedAt: (row.completed_at as string | null | undefined) ?? null,
    rejectionReason: (row.rejection_reason as string | null | undefined) ?? null,
    anonymizationDiff: (row.anonymization_diff as Record<string, unknown> | null | undefined) ?? null,
  };
}

async function audit(args: {
  supabase: SupabaseClient;
  tenantId: string;
  actorId: string | null;
  action:
    | 'erasure_requested'
    | 'erasure_verified'
    | 'erasure_approved'
    | 'erasure_rejected'
    | 'erasure_completed';
  source: 'admin' | 'self_serve' | 'system';
  details: Record<string, unknown>;
}) {
  const { error } = await args.supabase.from('tenant_audit_log').insert({
    tenant_id: args.tenantId,
    actor_id: args.actorId,
    action: args.action,
    source: args.source,
    details: args.details,
  });
  if (error) throw new ApiError('AUDIT_FAILED', error.message, 500);
}

export async function getActiveErasureRequestForSubject(
  subjectUserId: string,
): Promise<ErasureRequestSummary | null> {
  const { data, error } = await client()
    .from('erasure_requests')
    .select('*, profiles!erasure_requests_subject_user_id_fkey(full_name), tenants(name)')
    .eq('subject_user_id', subjectUserId)
    .in('status', Array.from(ACTIVE_ERASURE_STATUSES))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return data ? toSummary(data as Record<string, unknown>) : null;
}

export async function listAdminErasureRequests(): Promise<ErasureRequestSummary[]> {
  const { data, error } = await client()
    .from('erasure_requests')
    .select('*, profiles!erasure_requests_subject_user_id_fkey(full_name), tenants(name)')
    .in('status', ['submitted', 'under_review', 'approved'])
    .order('submitted_at', { ascending: true })
    .limit(100);
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return ((data as Record<string, unknown>[] | null) ?? []).map(toSummary);
}

export async function getErasureRequestDetail(
  requestId: string,
): Promise<ErasureRequestSummary | null> {
  const { data, error } = await client()
    .from('erasure_requests')
    .select('*, profiles!erasure_requests_subject_user_id_fkey(full_name), tenants(name)')
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  if (!data) return null;
  const summary = toSummary(data as Record<string, unknown>);
  const user = await client().auth.admin.getUserById(summary.subjectUserId);
  summary.subjectEmail = user.data.user?.email ?? null;
  return summary;
}

export async function createErasureRequest(args: {
  subjectKind: ErasureSubjectKind;
  subjectUserId: string;
  subjectTenantId: string;
  tenantSlug: string;
  subjectName: string | null;
  subjectEmail: string | null;
  recoveryEmail: string;
  reason: string | null;
  ip: string;
}): Promise<{ requestId: string }> {
  const allowedForUser = await consumeRateLimit({
    key: `erasure:${args.subjectUserId}`,
    capacity: 1,
    refillPerSec: 1 / 86400,
  });
  if (!allowedForUser) {
    throw new ApiError('RATE_LIMITED', 'An erasure request is already being processed', 429);
  }

  const allowedForIp = await consumeRateLimit({
    key: `erasure_request:${args.ip}`,
    capacity: 5,
    refillPerSec: 5 / 3600,
  });
  if (!allowedForIp) throw new ApiError('RATE_LIMITED', 'Too many erasure attempts', 429);

  const supabase = client();
  const token = generateVerificationToken();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', args.subjectTenantId)
    .maybeSingle();

  const { data, error } = await supabase
    .from('erasure_requests')
    .insert({
      subject_kind: args.subjectKind,
      subject_user_id: args.subjectUserId,
      subject_tenant_id: args.subjectTenantId,
      reason: args.reason,
      recovery_email: args.recoveryEmail,
      verification_token_hash: tokenHash(token),
      verification_sent_at: new Date().toISOString(),
      status: 'pending_verification',
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new ApiError('ACTIVE_ERASURE_EXISTS', 'An erasure request is already active', 409);
    }
    throw new ApiError('ERASURE_CREATE_FAILED', error.message, 500);
  }

  const requestId = data.id as string;
  await audit({
    supabase,
    tenantId: args.subjectTenantId,
    actorId: args.subjectUserId,
    action: 'erasure_requested',
    source: 'self_serve',
    details: { request_id: requestId, subject_kind: args.subjectKind },
  });

  const verificationUrl = appUrl(
    `/t/${args.tenantSlug}/portal/account/erasure/verify?token=${encodeURIComponent(token)}`,
  );
  await enqueueEmail({
    tenantId: args.subjectTenantId,
    templateId: 'erasure-verification',
    toAddress: args.subjectEmail ?? args.recoveryEmail,
    input: {
      subjectName: args.subjectName ?? 'there',
      tenantName: ((tenant as { name?: string } | null)?.name ?? 'your PRO firm') as string,
      verificationUrl,
    },
    linked: { entityType: 'erasure_request', entityId: requestId },
  });

  return { requestId };
}

export async function verifyErasureRequest(token: string): Promise<{ requestId: string }> {
  const supabase = client();
  const { data, error } = await supabase
    .from('erasure_requests')
    .select('id, subject_tenant_id, subject_user_id, status')
    .eq('verification_token_hash', tokenHash(token))
    .eq('status', 'pending_verification')
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  if (!data) throw new ApiError('INVALID_TOKEN', 'Verification link is invalid or expired', 400);

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('erasure_requests')
    .update({
      status: 'submitted',
      verified_at: now,
      verification_token_hash: null,
    })
    .eq('id', data.id);
  if (updateError) throw new ApiError('ERASURE_VERIFY_FAILED', updateError.message, 500);

  await audit({
    supabase,
    tenantId: data.subject_tenant_id as string,
    actorId: data.subject_user_id as string,
    action: 'erasure_verified',
    source: 'self_serve',
    details: { request_id: data.id },
  });

  return { requestId: data.id as string };
}

export async function rejectErasureRequest(args: {
  requestId: string;
  actorId: string;
  reason: string;
}): Promise<void> {
  const supabase = client();
  const detail = await getErasureRequestDetail(args.requestId);
  if (!detail) throw new ApiError('NOT_FOUND', 'Erasure request not found', 404);
  if (!['submitted', 'under_review'].includes(detail.status)) {
    throw new ApiError('INVALID_STATUS', 'Only submitted requests can be rejected', 409);
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('erasure_requests')
    .update({
      status: 'rejected',
      reviewed_by: args.actorId,
      reviewed_at: now,
      rejection_reason: args.reason,
    })
    .eq('id', args.requestId);
  if (error) throw new ApiError('ERASURE_REJECT_FAILED', error.message, 500);

  await audit({
    supabase,
    tenantId: detail.subjectTenantId,
    actorId: args.actorId,
    action: 'erasure_rejected',
    source: 'admin',
    details: { request_id: args.requestId, reason: args.reason },
  });

  await enqueueEmail({
    tenantId: detail.subjectTenantId,
    templateId: 'erasure-rejected',
    toAddress: detail.recoveryEmail,
    input: {
      subjectName: detail.subjectName ?? 'there',
      tenantName: detail.tenantName ?? 'your PRO firm',
      requestId: detail.id,
      reason: args.reason,
    },
    linked: { entityType: 'erasure_request_rejected', entityId: detail.id },
  });
}

async function deletePiiDocuments(args: {
  supabase: SupabaseClient;
  tenantId: string;
  clientId: string;
  uploadedBy?: string;
}): Promise<{ documentIds: string[]; storagePaths: string[] }> {
  const query = args.supabase
    .from('documents')
    .select('id, doc_type, document_versions(id, storage_path, uploaded_by)')
    .eq('tenant_id', args.tenantId)
    .eq('client_id', args.clientId)
    .in('doc_type', [...PII_DOCUMENT_TYPES]);
  const { data, error } = await query;
  if (error) throw new ApiError('DOCUMENT_LOOKUP_FAILED', error.message, 500);
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const documentIds: string[] = [];
  const storagePaths: string[] = [];

  for (const row of rows) {
    const versions = ((row.document_versions as Record<string, unknown>[] | null) ?? []).filter(
      (v) => !args.uploadedBy || v.uploaded_by === args.uploadedBy,
    );
    if (versions.length === 0) continue;
    documentIds.push(row.id as string);
    versions.forEach((v) => storagePaths.push(v.storage_path as string));
  }

  if (documentIds.length > 0) {
    const { error: deleteError } = await args.supabase.from('documents').delete().in('id', documentIds);
    if (deleteError) throw new ApiError('DOCUMENT_DELETE_FAILED', deleteError.message, 500);
  }
  return { documentIds, storagePaths };
}

export async function executeErasure(
  requestId: string,
  actorId: string,
): Promise<{ ok: true; diff: Record<string, unknown> }> {
  const supabase = client();
  const detail = await getErasureRequestDetail(requestId);
  if (!detail) throw new ApiError('NOT_FOUND', 'Erasure request not found', 404);
  if (!['submitted', 'under_review', 'approved'].includes(detail.status)) {
    throw new ApiError('INVALID_STATUS', 'Request is not ready for execution', 409);
  }

  const now = new Date().toISOString();
  await supabase
    .from('erasure_requests')
    .update({ status: 'approved', reviewed_by: actorId, reviewed_at: now })
    .eq('id', requestId);
  await audit({
    supabase,
    tenantId: detail.subjectTenantId,
    actorId,
    action: 'erasure_approved',
    source: 'admin',
    details: { request_id: requestId },
  });

  const diff: Record<string, unknown> = { subject_kind: detail.subjectKind };
  if (detail.subjectKind === 'employee') {
    const { data: employee, error } = await supabase
      .from('employees')
      .select(
        'id, client_id, name, email, phone, passport_no_encrypted, visa_no_encrypted, emirates_id_encrypted, nationality, status',
      )
      .eq('profile_id', detail.subjectUserId)
      .eq('tenant_id', detail.subjectTenantId)
      .maybeSingle();
    if (error) throw new ApiError('EMPLOYEE_LOOKUP_FAILED', error.message, 500);
    if (!employee) throw new ApiError('EMPLOYEE_NOT_FOUND', 'Employee row missing', 404);
    const employeePatch = anonymizeEmployeeFields(employee as EmployeeErasureRow);
    const { error: updateError } = await supabase
      .from('employees')
      .update(employeePatch.update)
      .eq('id', (employee as { id: string }).id);
    if (updateError) throw new ApiError('EMPLOYEE_ERASURE_FAILED', updateError.message, 500);
    const docs = await deletePiiDocuments({
      supabase,
      tenantId: detail.subjectTenantId,
      clientId: (employee as { client_id: string }).client_id,
      uploadedBy: detail.subjectUserId,
    });
    diff.employee = employeePatch.diff;
    diff.documents = docs;
  } else {
    const [{ data: profile, error: profileError }, { data: customer, error: customerError }] =
      await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, phone, username, title, bio')
          .eq('id', detail.subjectUserId)
          .maybeSingle(),
        supabase
          .from('customer_profiles')
          .select('nationality, passport_no_encrypted, linked_client_id')
          .eq('profile_id', detail.subjectUserId)
          .maybeSingle(),
      ]);
    if (profileError) throw new ApiError('PROFILE_LOOKUP_FAILED', profileError.message, 500);
    if (customerError) throw new ApiError('CUSTOMER_LOOKUP_FAILED', customerError.message, 500);
    if (!profile || !customer) throw new ApiError('CUSTOMER_NOT_FOUND', 'Customer row missing', 404);
    const customerPatch = anonymizeCustomerFields({
      profile: profile as CustomerErasureRows['profile'],
      customerProfile: customer as CustomerErasureRows['customerProfile'],
    });
    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update(customerPatch.profileUpdate)
      .eq('id', detail.subjectUserId);
    if (profileUpdateError) throw new ApiError('PROFILE_ERASURE_FAILED', profileUpdateError.message, 500);
    const { error: customerUpdateError } = await supabase
      .from('customer_profiles')
      .update(customerPatch.customerProfileUpdate)
      .eq('profile_id', detail.subjectUserId);
    if (customerUpdateError) {
      throw new ApiError('CUSTOMER_ERASURE_FAILED', customerUpdateError.message, 500);
    }
    const linkedClientId = (customer as { linked_client_id: string | null }).linked_client_id;
    const docs = linkedClientId
      ? await deletePiiDocuments({
          supabase,
          tenantId: detail.subjectTenantId,
          clientId: linkedClientId,
          uploadedBy: detail.subjectUserId,
        })
      : { documentIds: [], storagePaths: [] };
    diff.profile = customerPatch.diff.profile;
    diff.customerProfile = customerPatch.diff.customerProfile;
    diff.documents = docs;
  }

  await supabase.auth.admin.updateUserById(detail.subjectUserId, {
    email: `erased-${requestId}@erased.local`,
    user_metadata: { erased: true, erased_request_id: requestId },
    app_metadata: { erased: true, erased_request_id: requestId },
  });

  const { error: completeError } = await supabase
    .from('erasure_requests')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      anonymization_diff: diff,
    })
    .eq('id', requestId);
  if (completeError) throw new ApiError('ERASURE_COMPLETE_FAILED', completeError.message, 500);

  await audit({
    supabase,
    tenantId: detail.subjectTenantId,
    actorId,
    action: 'erasure_completed',
    source: 'admin',
    details: {
      request_id: requestId,
      subject_kind: detail.subjectKind,
      fields_anonymized: Object.keys(diff),
      documents_deleted: (diff.documents as { documentIds?: string[] } | undefined)?.documentIds ?? [],
    },
  });

  await enqueueEmail({
    tenantId: detail.subjectTenantId,
    templateId: 'erasure-completed',
    toAddress: detail.recoveryEmail,
    input: {
      subjectName: detail.subjectName ?? 'there',
      tenantName: detail.tenantName ?? 'your PRO firm',
      requestId,
    },
    linked: { entityType: 'erasure_request_completed', entityId: requestId },
  });

  return { ok: true, diff };
}
