import 'server-only';

import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  documentCenterIsoDateSchema,
  documentCenterSearchSchema,
  documentExpirySchema,
  type DocumentCenterSearch,
  type DocumentExpiryInput,
} from '@/lib/validation/pro-document-center';
import type { DocType } from '@/lib/validation/document';

const PAGE_SIZE = 50;

export type DocumentCenterQuery = Partial<DocumentCenterSearch>;

export type DocumentCenterRow = {
  entityKind: 'request' | 'document';
  entityId: string;
  tenantId: string;
  clientId: string;
  clientCompany: string;
  clientStatus: string;
  employeeId: string | null;
  employeeName: string | null;
  docType: DocType;
  label: string;
  requestId: string | null;
  requestStatus: 'pending' | 'fulfilled' | 'cancelled' | null;
  dueAt: string | null;
  requestedBy: string | null;
  requesterName: string | null;
  documentId: string | null;
  versionId: string | null;
  uploadedAt: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  reviewStatus: 'pending' | 'approved' | 'rejected' | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  expiresOn: string | null;
  expirySource: 'client_license' | 'employee_visa' | 'employee_emirates_id' | 'document' | null;
  createdAt: string;
  totalCount: number;
};

export type DocumentCenterWorkspace = {
  rows: DocumentCenterRow[];
  total: number;
  page: number;
  pageSize: 50;
};

export type DocumentCenterSummaryResult = { ok: true; value: number } | { ok: false };

export type DocumentCenterSummary = {
  awaitingUpload: DocumentCenterSummaryResult;
  awaitingReview: DocumentCenterSummaryResult;
  approved: DocumentCenterSummaryResult;
  rejected: DocumentCenterSummaryResult;
  expiring: DocumentCenterSummaryResult;
  overdue: DocumentCenterSummaryResult;
};

type RpcRow = Record<string, unknown>;

const uuidSchema = z.string().uuid();
const expiryContextSchema = z.object({
  tenantId: uuidSchema,
  actorId: uuidSchema,
  role: z.literal('pro'),
  ip: z.string(),
  userAgent: z.string().nullable(),
});

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return 0;
}

function mapRpcRow(row: RpcRow): DocumentCenterRow {
  return {
    entityKind: row.entity_kind as DocumentCenterRow['entityKind'],
    entityId: row.entity_id as string,
    tenantId: row.tenant_id as string,
    clientId: row.client_id as string,
    clientCompany: row.client_name as string,
    clientStatus: row.client_status as string,
    employeeId: asNullableString(row.employee_id),
    employeeName: asNullableString(row.employee_name),
    docType: row.doc_type as DocType,
    label: row.label as string,
    requestId: asNullableString(row.request_id),
    requestStatus: asNullableString(row.request_status) as DocumentCenterRow['requestStatus'],
    dueAt: asNullableString(row.due_at),
    requestedBy: asNullableString(row.requested_by),
    requesterName: asNullableString(row.requested_by_name),
    documentId: asNullableString(row.document_id),
    versionId: asNullableString(row.current_version_id),
    uploadedAt: asNullableString(row.current_version_created_at),
    mimeType: asNullableString(row.current_version_mime_type),
    sizeBytes:
      row.current_version_size_bytes == null ? null : asNumber(row.current_version_size_bytes),
    reviewStatus: asNullableString(row.review_status) as DocumentCenterRow['reviewStatus'],
    reviewNote: asNullableString(row.review_note),
    reviewedBy: asNullableString(row.reviewed_by),
    reviewerName: asNullableString(row.reviewed_by_name),
    reviewedAt: asNullableString(row.reviewed_at),
    expiresOn: asNullableString(row.effective_expires_on),
    expirySource: asNullableString(row.expiry_source) as DocumentCenterRow['expirySource'],
    createdAt: row.created_at as string,
    totalCount: asNumber(row.total_count),
  };
}

function dateAtOffset(date: string, days: number): string {
  const parsed = documentCenterIsoDateSchema.parse(date);
  const instant = new Date(`${parsed}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

export function dubaiToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isExpiringWithin30(expiresOn: string, todayDubai: string): boolean {
  const expiry = documentCenterIsoDateSchema.safeParse(expiresOn);
  const today = documentCenterIsoDateSchema.safeParse(todayDubai);
  if (!expiry.success || !today.success) return false;
  return expiry.data >= today.data && expiry.data <= dateAtOffset(today.data, 30);
}

function dateArguments(input: DocumentCenterSearch): {
  p_due_from: string | null;
  p_due_to: string | null;
  p_expiry_from: string | null;
  p_expiry_to: string | null;
} {
  const usesDueDates = input.view === 'requested' || input.view === 'overdue';
  let from = input.from ?? null;
  let to = input.to ?? null;

  if (input.window === 'overdue') {
    from = null;
    to = dateAtOffset(dubaiToday(), -1);
  } else if (input.window !== 'all') {
    from = dubaiToday();
    to = dateAtOffset(from, Number(input.window));
  }

  return usesDueDates
    ? { p_due_from: from, p_due_to: to, p_expiry_from: null, p_expiry_to: null }
    : { p_due_from: null, p_due_to: null, p_expiry_from: from, p_expiry_to: to };
}

function rpcArguments(input: DocumentCenterSearch, tenantId: string) {
  return {
    p_tenant_id: tenantId,
    p_view: input.view,
    p_search: input.search ?? null,
    p_client_id: input.clientId ?? null,
    p_doc_type: input.docType ?? null,
    ...dateArguments(input),
    p_sort: input.sort,
    p_focus_kind: input.focus?.kind ?? null,
    p_focus_id: input.focus?.id ?? null,
    p_page: input.page,
    p_page_size: PAGE_SIZE,
  };
}

export async function listProDocumentCenter(
  tenantId: string,
  input: DocumentCenterQuery,
): Promise<DocumentCenterWorkspace> {
  const validTenantId = uuidSchema.parse(tenantId);
  const validInput = documentCenterSearchSchema.parse(input);
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.rpc(
    'list_pro_document_center' as never,
    rpcArguments(validInput, validTenantId) as never,
  );
  if (error) {
    throw new ApiError('INTERNAL', 'Unable to load document center', 500);
  }

  const rows = ((data ?? []) as RpcRow[]).map(mapRpcRow);
  return {
    rows,
    total: rows[0]?.totalCount ?? 0,
    page: validInput.page,
    pageSize: PAGE_SIZE,
  };
}

function summaryRpcArguments(
  tenantId: string,
  view: DocumentCenterSearch['view'],
  todayDubai: string,
) {
  return {
    p_tenant_id: tenantId,
    p_view: view,
    p_search: null,
    p_client_id: null,
    p_doc_type: null,
    p_due_from: null,
    p_due_to: null,
    p_expiry_from: view === 'expiring' ? todayDubai : null,
    p_expiry_to: view === 'expiring' ? dateAtOffset(todayDubai, 30) : null,
    p_sort: 'urgency',
    p_focus_kind: null,
    p_focus_id: null,
    p_page: 1,
    p_page_size: 1,
  };
}

async function loadSummaryResult(
  tenantId: string,
  view: DocumentCenterSearch['view'],
  todayDubai: string,
): Promise<DocumentCenterSummaryResult> {
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin.rpc(
      'list_pro_document_center' as never,
      summaryRpcArguments(tenantId, view, todayDubai) as never,
    );
    if (error) return { ok: false };
    const first = ((data ?? []) as RpcRow[])[0];
    return { ok: true, value: first ? asNumber(first.total_count) : 0 };
  } catch {
    return { ok: false };
  }
}

export async function getDocumentCenterSummary(
  tenantId: string,
  todayDubai: string,
): Promise<DocumentCenterSummary> {
  const validTenantId = uuidSchema.parse(tenantId);
  const validToday = documentCenterIsoDateSchema.parse(todayDubai);
  const [awaitingUpload, awaitingReview, approved, rejected, expiring, overdue] = await Promise.all(
    [
      loadSummaryResult(validTenantId, 'requested', validToday),
      loadSummaryResult(validTenantId, 'submitted', validToday),
      loadSummaryResult(validTenantId, 'approved', validToday),
      loadSummaryResult(validTenantId, 'rejected', validToday),
      loadSummaryResult(validTenantId, 'expiring', validToday),
      loadSummaryResult(validTenantId, 'overdue', validToday),
    ],
  );

  return { awaitingUpload, awaitingReview, approved, rejected, expiring, overdue };
}

export type DocumentVersionHistoryEntry = {
  versionId: string;
  versionNumber: number;
  current: boolean;
  uploadedAt: string;
  uploadedBy: string | null;
  uploaderName: string | null;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  sizeBytes: number;
  mimeType: string;
};

function relatedOne(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export async function listDocumentVersionHistory(
  tenantId: string,
  documentId: string,
): Promise<DocumentVersionHistoryEntry[]> {
  const validTenantId = uuidSchema.parse(tenantId);
  const validDocumentId = uuidSchema.parse(documentId);
  const admin = createSupabaseServiceRoleClient();

  const { data: document, error: documentError } = await admin
    .from('documents')
    .select(
      'id, tenant_id, client_id, current_version_id, clients!inner(id, tenant_id), employees(id, tenant_id, client_id)',
    )
    .eq('id', validDocumentId)
    .maybeSingle();
  if (documentError) throw new ApiError('INTERNAL', 'Unable to load document history', 500);
  if (!document) throw new ApiError('NOT_FOUND', 'Document not found', 404);

  const ownership = document as Record<string, unknown>;
  const client = relatedOne(ownership.clients);
  if (
    ownership.tenant_id !== validTenantId ||
    ownership.client_id !== client?.id ||
    client?.tenant_id !== validTenantId
  ) {
    throw new ApiError('FORBIDDEN', 'Document is outside the firm scope', 403);
  }

  const { data, error } = await admin
    .from('document_versions')
    .select(
      'id, document_id, tenant_id, mime_type, size_bytes, uploaded_by, review_status, review_note, reviewed_by, reviewed_at, created_at, uploader:profiles!document_versions_uploaded_by_fkey(full_name), reviewer:profiles!document_versions_reviewed_by_fkey(full_name)',
    )
    .eq('document_id', validDocumentId)
    .eq('tenant_id', validTenantId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw new ApiError('INTERNAL', 'Unable to load document history', 500);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map((row, index) => ({
    versionId: row.id as string,
    versionNumber: rows.length - index,
    current: row.id === ownership.current_version_id,
    uploadedAt: row.created_at as string,
    uploadedBy: asNullableString(row.uploaded_by),
    uploaderName: asNullableString(relatedOne(row.uploader)?.full_name),
    reviewStatus: row.review_status as DocumentVersionHistoryEntry['reviewStatus'],
    reviewedBy: asNullableString(row.reviewed_by),
    reviewerName: asNullableString(relatedOne(row.reviewer)?.full_name),
    reviewedAt: asNullableString(row.reviewed_at),
    reviewNote: asNullableString(row.review_note),
    sizeBytes: asNumber(row.size_bytes),
    mimeType: row.mime_type as string,
  }));
}

export type SetDocumentExpiryContext = {
  tenantId: string;
  actorId: string;
  role: 'pro';
  ip: string;
  userAgent: string | null;
};

export async function setDocumentExpiry(
  ctx: SetDocumentExpiryContext,
  input: DocumentExpiryInput,
): Promise<void> {
  const validContext = expiryContextSchema.parse(ctx);
  const validInput = documentExpirySchema.parse({
    ...input,
    expires_on: input.expires_on ?? '',
  });
  const admin = createSupabaseServiceRoleClient();
  const { data: document, error: documentError } = await admin
    .from('documents')
    .select(
      'id, tenant_id, client_id, doc_type, employee_id, expires_on, clients!inner(id, tenant_id), employees(id, tenant_id, client_id)',
    )
    .eq('id', validInput.document_id)
    .maybeSingle();
  if (documentError) throw new ApiError('INTERNAL', 'Unable to update document expiry', 500);
  if (!document) throw new ApiError('NOT_FOUND', 'Document not found', 404);

  const row = document as Record<string, unknown>;
  const client = relatedOne(row.clients);
  if (
    row.tenant_id !== validContext.tenantId ||
    row.client_id !== client?.id ||
    client?.tenant_id !== validContext.tenantId
  ) {
    throw new ApiError('FORBIDDEN', 'Document is outside the firm scope', 403);
  }

  const employeeId = asNullableString(row.employee_id);
  const employee = relatedOne(row.employees);
  if (
    employeeId &&
    (employee?.id !== employeeId ||
      employee.tenant_id !== validContext.tenantId ||
      employee.client_id !== row.client_id)
  ) {
    throw new ApiError('FORBIDDEN', 'Document employee is outside the firm scope', 403);
  }

  const docType = row.doc_type as DocType;
  if (
    docType === 'trade_license' ||
    (employeeId !== null && (docType === 'visa' || docType === 'emirates_id'))
  ) {
    throw new ApiError(
      'EXPIRY_EXTERNALLY_MANAGED',
      'Expiry is managed by the linked client or employee',
      409,
    );
  }

  const { error: updateError } = await admin
    .from('documents')
    .update({ expires_on: validInput.expires_on })
    .eq('id', validInput.document_id)
    .eq('tenant_id', validContext.tenantId);
  if (updateError) throw new ApiError('INTERNAL', 'Unable to update document expiry', 500);

  const auditDetails = {
    entity: 'document',
    op: 'set_expiry',
    document_id: validInput.document_id,
    expires_on: validInput.expires_on,
  };
  const { error: auditError } = await admin.from('tenant_audit_log').insert({
    tenant_id: validContext.tenantId,
    actor_id: validContext.actorId,
    action: 'updated',
    source: 'self_serve',
    details: auditDetails,
  });
  if (auditError) console.error('tenant_audit_log insert failed', auditError);

  await recordAuthEvent({
    kind: 'tenant_self_updated',
    actorUserId: validContext.actorId,
    tenantId: validContext.tenantId,
    ip: validContext.ip,
    userAgent: validContext.userAgent,
    details: auditDetails,
  }).catch((error) => console.error('recordAuthEvent failed', error));
}
