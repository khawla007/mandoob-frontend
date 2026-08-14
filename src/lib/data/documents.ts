import 'server-only';
import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { logSafeActionError } from '@/lib/actions/server-action-security';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { scanFile } from '@/lib/security/scan-file';
import { enqueueEmail } from '@/lib/mail/send';
import { enqueueWhatsApp } from '@/lib/whatsapp/send';
import { enqueueSms } from '@/lib/sms/send';
import { z } from 'zod';
import {
  DOC_TYPES,
  createDocumentRequestSchema,
  documentReviewSchema,
  sanitizeFilename,
  uploadDocumentMetadataSchema,
  type CreateDocumentRequestInput,
  type DocType,
  type DocumentReviewInput,
} from '@/lib/validation/document';

const STORAGE_BUCKET = 'tenant-documents';
const MAX_FILE_BYTES = 25 * 1024 * 1024;
// PostgreSQL accepts canonical UUID text regardless of RFC version bits.
// DAL identifiers can come from trusted database/auth rows, while form and
// route schemas continue to enforce Zod's stricter RFC UUID contract.
const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);
const DOC_TYPE_SET = new Set<string>(DOC_TYPES);
const GENERATED_STORAGE_FILENAME =
  /^(\d{4}-\d{2}-\d{2})_(?:[a-z0-9]+_)?[0-9a-f]{12}_([A-Za-z0-9._-]{1,100})\.(pdf|jpg|png|docx|xlsx)$/;

const ALLOWED_MIMES = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function normalizeUuid(value: string): string | null {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data.toLowerCase() : null;
}

function isGeneratedStoragePath(path: string, tenantId: string, clientId: string): boolean {
  if (
    path.includes('\\') ||
    path.includes('%') ||
    /[\u0000-\u001f\u007f]/.test(path) ||
    normalizeUuid(tenantId) !== tenantId ||
    normalizeUuid(clientId) !== clientId
  ) {
    return false;
  }

  const segments = path.split('/');
  if (
    segments.length !== 4 ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    return false;
  }

  const [pathTenantId, pathClientId, docType, filename] = segments;
  if (pathTenantId !== tenantId || pathClientId !== clientId || !DOC_TYPE_SET.has(docType)) {
    return false;
  }

  const filenameMatch = GENERATED_STORAGE_FILENAME.exec(filename);
  if (!filenameMatch) return false;
  const generatedDate = new Date(`${filenameMatch[1]}T00:00:00.000Z`);
  return (
    !Number.isNaN(generatedDate.getTime()) &&
    generatedDate.toISOString().slice(0, 10) === filenameMatch[1]
  );
}

export type UploadDocumentInput = {
  tenantId: string;
  clientId: string;
  docType: DocType;
  requestId?: string;
  label?: string;
  file: {
    data: Uint8Array;
    originalName: string;
    mimeType: string;
  };
  actor: {
    id: string;
    role: 'pro' | 'customer';
    ip: string;
    userAgent: string | null;
  };
};

export type UploadDocumentResult = {
  documentId: string;
  versionId: string;
  storagePath: string;
};

async function logDocumentAudit(
  tenantId: string,
  actorId: string,
  details: Record<string, unknown>,
) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from('tenant_audit_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    action: 'updated',
    source: 'self_serve',
    details,
  });
  if (error) logSafeActionError('document.audit.write', error);
}

async function logBlockedScanAudit(args: {
  tenantId: string;
  actorId: string;
  requestId?: string;
  docType: DocType;
  filename: string;
  fileHash: string;
  reason: string | null;
  provider: string | null;
}) {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from('tenant_audit_log').insert({
    tenant_id: args.tenantId,
    actor_id: args.actorId,
    action: 'infected_blocked',
    source: 'system',
    details: {
      entity: args.requestId ? 'document_request' : 'document',
      op: 'upload_blocked',
      request_id: args.requestId ?? null,
      doc_type: args.docType,
      filename: args.filename,
      file_hash: args.fileHash,
      reason: args.reason,
      scanner_provider: args.provider,
    },
  });
  if (error) logSafeActionError('document.audit.scan_blocked', error);
}

function buildStoragePath(args: {
  tenantId: string;
  clientId: string;
  docType: DocType;
  sha256: string;
  originalName: string;
  ext: string;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const shortHash = args.sha256.slice(0, 12);
  const sanitised = sanitizeFilename(args.originalName);
  // Drop any extension that snuck through the sanitiser; we append the
  // sniffed extension below for consistency with the magic-byte check.
  const baseNoExt = sanitised.replace(/\.[^/.]+$/, '');
  const safeBase = baseNoExt || 'file';
  // Epoch-ms keeps the storage path unique even when a customer re-uploads
  // identical bytes (same sha256). Without this, the second PUT collides
  // because the bucket is configured upsert: false.
  const stamp = Date.now().toString(36);
  return `${args.tenantId}/${args.clientId}/${args.docType}/${today}_${stamp}_${shortHash}_${safeBase}.${args.ext}`;
}

export async function uploadDocument(input: UploadDocumentInput): Promise<UploadDocumentResult> {
  uploadDocumentMetadataSchema.parse({
    client_id: input.clientId,
    doc_type: input.docType,
    request_id: input.requestId,
    label: input.label,
  });

  const { data, originalName, mimeType: declaredMime } = input.file;
  if (data.byteLength === 0) {
    throw new ApiError('PAYLOAD_EMPTY', 'file is empty', 400);
  }
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new ApiError('PAYLOAD_TOO_LARGE', `file exceeds ${MAX_FILE_BYTES} bytes`, 413, {
      max_bytes: MAX_FILE_BYTES,
      actual_bytes: data.byteLength,
    });
  }

  const sniffed = await fileTypeFromBuffer(data);
  if (!sniffed || !ALLOWED_MIMES.has(sniffed.mime)) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'file type not allowed', 415, {
      sniffed_mime: sniffed?.mime ?? null,
      declared_mime: declaredMime,
    });
  }
  if (declaredMime && declaredMime !== sniffed.mime) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'declared MIME does not match content', 415, {
      sniffed_mime: sniffed.mime,
      declared_mime: declaredMime,
    });
  }

  const sha256 = createHash('sha256').update(data).digest('hex');
  const scan = await scanFile(data, { filename: originalName });
  if (!scan.clean) {
    await logBlockedScanAudit({
      tenantId: input.tenantId,
      actorId: input.actor.id,
      requestId: input.requestId,
      docType: input.docType,
      filename: originalName,
      fileHash: sha256,
      reason: scan.reason ?? null,
      provider: scan.provider ?? null,
    });

    if (scan.reason === 'scanner_unavailable') {
      console.warn('virus scanner unavailable', {
        feature: 'virus-scan',
        provider: scan.provider ?? 'unknown',
      });
      throw new ApiError(
        'SCANNER_UNAVAILABLE',
        'Virus scanner is temporarily unavailable. Try again shortly.',
        503,
        {
          reason: scan.reason,
          scanner_provider: scan.provider ?? null,
        },
      );
    }

    throw new ApiError('FILE_REJECTED_BY_SCAN', 'file failed virus scan', 422, {
      reason: scan.reason ?? null,
      scanner_provider: scan.provider ?? null,
    });
  }

  const storagePath = buildStoragePath({
    tenantId: input.tenantId,
    clientId: input.clientId,
    docType: input.docType,
    sha256,
    originalName,
    ext: sniffed.ext,
  });

  const admin = createSupabaseServiceRoleClient();

  const { error: uploadErr } = await admin.storage.from(STORAGE_BUCKET).upload(storagePath, data, {
    contentType: sniffed.mime,
    upsert: false,
  });
  if (uploadErr) {
    throw new ApiError('STORAGE_UPLOAD_FAILED', uploadErr.message, 502);
  }

  const headQuery = admin
    .from('documents')
    .select('id')
    .eq('tenant_id', input.tenantId)
    .eq('client_id', input.clientId)
    .eq('doc_type', input.docType);
  const headFilter = input.requestId
    ? headQuery.eq('request_id', input.requestId)
    : headQuery.is('request_id', null);
  const { data: existingHead, error: headReadErr } = await headFilter.maybeSingle();
  if (headReadErr) {
    throw new ApiError('INTERNAL', headReadErr.message, 500);
  }

  let documentId: string;
  if (existingHead?.id) {
    documentId = existingHead.id as string;
  } else {
    const { data: createdHead, error: headInsertErr } = await admin
      .from('documents')
      .insert({
        tenant_id: input.tenantId,
        client_id: input.clientId,
        request_id: input.requestId ?? null,
        doc_type: input.docType,
        label: input.label ?? null,
      })
      .select('id')
      .single();
    if (headInsertErr || !createdHead) {
      throw new ApiError('INTERNAL', headInsertErr?.message ?? 'document insert failed', 500);
    }
    documentId = createdHead.id as string;
  }

  const { data: createdVersion, error: versionInsertErr } = await admin
    .from('document_versions')
    .insert({
      document_id: documentId,
      tenant_id: input.tenantId,
      storage_path: storagePath,
      mime_type: sniffed.mime,
      size_bytes: data.byteLength,
      sha256,
      uploaded_by: input.actor.id,
      review_status: 'pending',
    })
    .select('id')
    .single();
  if (versionInsertErr || !createdVersion) {
    throw new ApiError('INTERNAL', versionInsertErr?.message ?? 'version insert failed', 500);
  }
  const versionId = createdVersion.id as string;

  // Point the head at the just-uploaded version so list views always show the
  // latest. Re-uploads after a rejection would otherwise keep the head pinned
  // to the rejected version, breaking the "Pending review" badge.
  const { error: linkErr } = await admin
    .from('documents')
    .update({ current_version_id: versionId, updated_at: new Date().toISOString() })
    .eq('id', documentId);
  if (linkErr) {
    throw new ApiError('INTERNAL', linkErr.message, 500);
  }

  await logDocumentAudit(input.tenantId, input.actor.id, {
    entity: 'document',
    op: 'upload',
    document_id: documentId,
    version_id: versionId,
    doc_type: input.docType,
    request_id: input.requestId ?? null,
  });
  await recordAuthEvent({
    kind: 'tenant_self_updated',
    actorUserId: input.actor.id,
    tenantId: input.tenantId,
    ip: input.actor.ip,
    userAgent: input.actor.userAgent,
    details: {
      entity: 'document',
      op: 'upload',
      document_id: documentId,
      version_id: versionId,
    },
  }).catch((error) => logSafeActionError('document.upload.auth_event', error));

  return { documentId, versionId, storagePath };
}

export type DocumentListEntry = {
  documentId: string;
  docType: DocType;
  label: string | null;
  createdAt: string;
  updatedAt: string;
  request: {
    id: string;
    status: 'pending' | 'fulfilled' | 'cancelled';
    label: string;
    dueAt: string | null;
  } | null;
  currentVersion: {
    id: string;
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
    reviewStatus: 'pending' | 'approved' | 'rejected';
    reviewNote: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    createdAt: string;
    uploadedBy: string | null;
  } | null;
};

export async function listDocumentsForClient(
  tenantId: string,
  clientId: string,
): Promise<DocumentListEntry[]> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('documents')
    .select(
      `
      id, doc_type, label, created_at, updated_at, current_version_id,
      request:document_requests ( id, status, label, due_at ),
      currentVersion:document_versions!documents_current_version_fk (
        id, storage_path, mime_type, size_bytes, sha256, review_status,
        review_note, reviewed_by, reviewed_at, created_at, uploaded_by
      )
    `,
    )
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false });
  if (error) throw new ApiError('INTERNAL', error.message, 500);

  type Row = {
    id: string;
    doc_type: DocType;
    label: string | null;
    created_at: string;
    updated_at: string;
    current_version_id: string | null;
    request: {
      id: string;
      status: 'pending' | 'fulfilled' | 'cancelled';
      label: string;
      due_at: string | null;
    } | null;
    currentVersion: {
      id: string;
      storage_path: string;
      mime_type: string;
      size_bytes: number;
      sha256: string;
      review_status: 'pending' | 'approved' | 'rejected';
      review_note: string | null;
      reviewed_by: string | null;
      reviewed_at: string | null;
      created_at: string;
      uploaded_by: string | null;
    } | null;
  };

  return ((data as unknown as Row[] | null) ?? []).map((row) => ({
    documentId: row.id,
    docType: row.doc_type,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    request: row.request
      ? {
          id: row.request.id,
          status: row.request.status,
          label: row.request.label,
          dueAt: row.request.due_at,
        }
      : null,
    currentVersion: row.currentVersion
      ? {
          id: row.currentVersion.id,
          storagePath: row.currentVersion.storage_path,
          mimeType: row.currentVersion.mime_type,
          sizeBytes: row.currentVersion.size_bytes,
          sha256: row.currentVersion.sha256,
          reviewStatus: row.currentVersion.review_status,
          reviewNote: row.currentVersion.review_note,
          reviewedBy: row.currentVersion.reviewed_by,
          reviewedAt: row.currentVersion.reviewed_at,
          createdAt: row.currentVersion.created_at,
          uploadedBy: row.currentVersion.uploaded_by,
        }
      : null,
  }));
}

export async function getDocumentSignedUrl(
  tenantId: string,
  versionId: string,
  ttlSeconds = 60 * 5,
): Promise<{ url: string; expiresAt: string }> {
  const normalizedTenantId = normalizeUuid(tenantId);
  const normalizedVersionId = normalizeUuid(versionId);
  if (!normalizedTenantId || !normalizedVersionId) {
    throw new ApiError('VALIDATION_FAILED', 'Invalid document identifier', 400);
  }
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) {
    throw new ApiError('VALIDATION_FAILED', 'Invalid signed URL lifetime', 400);
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: version, error: readErr } = await admin
    .from('document_versions')
    .select(
      'id, tenant_id, storage_path, document:documents!document_versions_document_id_fkey!inner(id, tenant_id, client_id, request_id, current_version_id, client:clients!inner(id, tenant_id))',
    )
    .eq('id', normalizedVersionId)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', 'Could not load document version', 500);
  if (!version) throw new ApiError('NOT_FOUND', 'document version not found', 404);

  type OwnedVersionRow = {
    id: string;
    tenant_id: string;
    storage_path: string;
    document: {
      id: string;
      tenant_id: string;
      client_id: string;
      request_id: string | null;
      current_version_id: string | null;
      client: { id: string; tenant_id: string } | null;
    } | null;
  };
  const owned = version as unknown as OwnedVersionRow;
  const document = owned.document;
  const client = document?.client;
  const normalizedClientId = client ? normalizeUuid(client.id) : null;
  if (
    owned.id !== normalizedVersionId ||
    owned.tenant_id !== normalizedTenantId ||
    !document ||
    document.tenant_id !== normalizedTenantId ||
    !client ||
    !normalizedClientId ||
    client.id !== normalizedClientId ||
    document.client_id !== normalizedClientId ||
    client.tenant_id !== normalizedTenantId ||
    typeof owned.storage_path !== 'string' ||
    !isGeneratedStoragePath(owned.storage_path, normalizedTenantId, normalizedClientId)
  ) {
    throw new ApiError('NOT_FOUND', 'document version not found', 404);
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(owned.storage_path, ttlSeconds);
  if (signErr || !signed?.signedUrl) {
    throw new ApiError('STORAGE_SIGN_FAILED', 'Could not create signed URL', 502);
  }

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  return { url: signed.signedUrl, expiresAt };
}

export type SetDocumentReviewCtx = {
  tenantId: string;
  actorId: string;
  role: 'pro';
  ip: string;
  userAgent: string | null;
};

type DocumentReviewRpcResult = {
  document_id: string;
  client_id: string;
  fulfilled_request_id: string | null;
  review_status: string;
};

export async function setDocumentReview(
  versionId: string,
  ctx: SetDocumentReviewCtx,
  input: DocumentReviewInput,
): Promise<{ clientId: string }> {
  if (ctx.role !== 'pro') {
    throw new ApiError('FORBIDDEN', 'only pro can review documents', 403);
  }
  const normalizedVersionId = normalizeUuid(versionId);
  const normalizedTenantId = normalizeUuid(ctx.tenantId);
  const normalizedActorId = normalizeUuid(ctx.actorId);
  if (!normalizedVersionId || !normalizedTenantId || !normalizedActorId) {
    throw new ApiError('VALIDATION_FAILED', 'Invalid document identifier', 400);
  }
  const review = documentReviewSchema.parse(input);

  const admin = createSupabaseServiceRoleClient();
  const reviewedAt = new Date().toISOString();
  const { data: result, error: reviewErr } = await admin
    .rpc('review_document_version', {
      p_tenant_id: normalizedTenantId,
      p_actor_id: normalizedActorId,
      p_version_id: normalizedVersionId,
      p_status: review.status,
      p_note: review.note ?? null,
      p_reviewed_at: reviewedAt,
    })
    .maybeSingle();
  if (reviewErr) {
    if (reviewErr.code === 'MD404') {
      throw new ApiError('NOT_FOUND', 'document version not found', 404);
    }
    if (reviewErr.code === '42501') {
      throw new ApiError('FORBIDDEN', 'Not authorized to review document', 403);
    }
    if (reviewErr.code === 'MD422') {
      throw new ApiError('VALIDATION_FAILED', 'Invalid document review', 400);
    }
    if (reviewErr.code === 'MD409') {
      throw new ApiError('VALIDATION_FAILED', 'Document version is no longer pending', 409);
    }
    throw new ApiError('INTERNAL', 'Could not save document review', 500);
  }
  if (!result) throw new ApiError('NOT_FOUND', 'document version not found', 404);
  const reviewed = result as DocumentReviewRpcResult;
  const reviewedClientId = normalizeUuid(reviewed.client_id);
  if (reviewed.review_status !== review.status || !reviewed.document_id || !reviewedClientId) {
    throw new ApiError('INTERNAL', 'Could not save document review', 500);
  }

  await recordAuthEvent({
    kind: 'tenant_self_updated',
    actorUserId: normalizedActorId,
    tenantId: normalizedTenantId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: {
      entity: 'document',
      op: 'review',
      version_id: normalizedVersionId,
      document_id: reviewed.document_id,
      review_status: review.status,
    },
  }).catch((error) => logSafeActionError('document.review.auth_event', error));

  return { clientId: reviewedClientId };
}

// ============================================================
// Step 13 — PRO-side request flow + KPI helper
// ============================================================

export type CreateDocumentRequestCtx = {
  tenantId: string;
  actorId: string;
  role: 'pro';
  ip: string;
  userAgent: string | null;
};

export async function createDocumentRequest(
  ctx: CreateDocumentRequestCtx,
  input: CreateDocumentRequestInput,
): Promise<{ id: string; clientId: string }> {
  if (ctx.role !== 'pro') {
    throw new ApiError('FORBIDDEN', 'only pro can request documents', 403);
  }
  const request = createDocumentRequestSchema.parse(input);
  const normalizedTenantId = normalizeUuid(ctx.tenantId);
  const normalizedActorId = normalizeUuid(ctx.actorId);
  const normalizedClientId = normalizeUuid(request.client_id);
  if (!normalizedTenantId || !normalizedActorId || !normalizedClientId) {
    throw new ApiError('VALIDATION_FAILED', 'Invalid document request identifier', 400);
  }

  const admin = createSupabaseServiceRoleClient();

  // Cross-tenant guard: client must belong to the caller's tenant.
  const { data: clientRow, error: clientErr } = await admin
    .from('clients')
    .select('id, tenant_id')
    .eq('id', normalizedClientId)
    .maybeSingle();
  if (clientErr) throw new ApiError('INTERNAL', clientErr.message, 500);
  if (
    !clientRow ||
    clientRow.tenant_id !== normalizedTenantId ||
    clientRow.id !== normalizedClientId
  ) {
    throw new ApiError('NOT_FOUND', 'client not found', 404);
  }

  const dueAt = request.due_at ? new Date(`${request.due_at}T00:00:00Z`).toISOString() : null;

  const { data: row, error: insertErr } = await admin
    .from('document_requests')
    .insert({
      tenant_id: normalizedTenantId,
      client_id: normalizedClientId,
      requested_by: normalizedActorId,
      doc_type: request.doc_type,
      label: request.label,
      notes: request.notes ?? null,
      due_at: dueAt,
    })
    .select('id')
    .single();
  if (insertErr || !row) {
    throw new ApiError('INTERNAL', insertErr?.message ?? 'request insert failed', 500);
  }
  const id = row.id as string;

  await logDocumentAudit(normalizedTenantId, normalizedActorId, {
    entity: 'document_request',
    op: 'create',
    request_id: id,
    client_id: normalizedClientId,
    doc_type: request.doc_type,
  });
  await recordAuthEvent({
    kind: 'tenant_self_updated',
    actorUserId: normalizedActorId,
    tenantId: normalizedTenantId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: {
      entity: 'document_request',
      op: 'create',
      request_id: id,
    },
  }).catch((error) => logSafeActionError('document.request.auth_event', error));

  await notifyDocumentRequested({
    tenantId: normalizedTenantId,
    clientId: normalizedClientId,
    requestId: id,
    documentLabel: request.label,
    dueAtIso: dueAt,
  }).catch((error) => logSafeActionError('document.request.notify', error));

  return { id, clientId: normalizedClientId };
}

async function notifyDocumentRequested(args: {
  tenantId: string;
  clientId: string;
  requestId: string;
  documentLabel: string;
  dueAtIso: string | null;
}): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { data: tenant } = await admin
    .from('tenants')
    .select('name')
    .eq('id', args.tenantId)
    .maybeSingle();
  const { data: link } = await admin
    .from('customer_profiles')
    .select('profile_id')
    .eq('linked_client_id', args.clientId)
    .maybeSingle();
  if (!link) return;
  const { data: authUser } = await admin.auth.admin.getUserById(link.profile_id);
  const email = authUser.user?.email;
  if (!email) return;
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, phone')
    .eq('id', link.profile_id)
    .maybeSingle();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const dueDate = args.dueAtIso ? args.dueAtIso.slice(0, 10) : null;
  const customerName = profile?.full_name ?? 'there';
  const customerPhone = profile?.phone ?? null;

  await enqueueEmail({
    tenantId: args.tenantId,
    templateId: 'document-requested',
    toAddress: email,
    input: {
      customerName,
      tenantName: tenant?.name ?? '',
      documentLabel: args.documentLabel,
      uploadUrl: `${appUrl}/portal/documents?request=${args.requestId}`,
      dueDate,
    },
    linked: { entityType: 'document_request', entityId: args.requestId },
  });

  if (customerPhone) {
    await enqueueWhatsApp({
      tenantId: args.tenantId,
      templateId: 'document-requested',
      toPhone: customerPhone,
      input: {
        customerName,
        tenantName: tenant?.name ?? '',
        documentLabel: args.documentLabel,
        uploadPath: `/portal/documents?request=${args.requestId}`,
        dueDate,
      },
      linked: { entityType: 'document_request_wa', entityId: args.requestId },
    }).catch(() => {});

    await enqueueSms({
      tenantId: args.tenantId,
      templateId: 'document-requested',
      toPhone: customerPhone,
      input: {
        customerName,
        tenantName: tenant?.name ?? '',
        documentLabel: args.documentLabel,
        uploadUrl: `${appUrl}/portal/documents?request=${args.requestId}`,
        dueDate,
      },
      linked: { entityType: 'document_request_sms', entityId: args.requestId },
    }).catch(() => {});
  } else {
    try {
      await admin.from('tenant_audit_log').insert({
        tenant_id: args.tenantId,
        actor_id: null,
        action: 'whatsapp_skipped_no_phone',
        source: 'document_request',
        details: { request_id: args.requestId },
      });
      await admin.from('tenant_audit_log').insert({
        tenant_id: args.tenantId,
        actor_id: null,
        action: 'sms_skipped_no_phone',
        source: 'document_request',
        details: { request_id: args.requestId },
      });
    } catch {
      /* non-fatal */
    }
  }
}

export type OpenRequestEntry = {
  id: string;
  docType: DocType;
  label: string;
  notes: string | null;
  dueAt: string | null;
  createdAt: string;
  requestedBy: string | null;
};

// Open (= status 'pending') document requests for a client. Surfaced
// alongside `listDocumentsForClient` to render an "Awaiting upload"
// section in the PRO Documents tab; fulfilled requests are reachable via
// the document head (`documents.request_id`).
export async function listOpenRequestsForClient(
  tenantId: string,
  clientId: string,
): Promise<OpenRequestEntry[]> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('document_requests')
    .select('id, doc_type, label, notes, due_at, created_at, requested_by')
    .eq('tenant_id', tenantId)
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return ((data as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
    id: row.id as string,
    docType: row.doc_type as DocType,
    label: row.label as string,
    notes: (row.notes as string | null) ?? null,
    dueAt: (row.due_at as string | null) ?? null,
    createdAt: row.created_at as string,
    requestedBy: (row.requested_by as string | null) ?? null,
  }));
}

export async function countDocsAwaitingReview(tenantId: string): Promise<number> {
  const admin = createSupabaseServiceRoleClient();
  const { count, error } = await admin
    .from('document_versions')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('review_status', 'pending');
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return count ?? 0;
}
