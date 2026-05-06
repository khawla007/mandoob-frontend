import 'server-only';
import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { scanFile } from '@/lib/security/scan-file';
import { enqueueEmail } from '@/lib/mail/send';
import { enqueueWhatsApp } from '@/lib/whatsapp/send';
import { enqueueSms } from '@/lib/sms/send';
import {
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

const ALLOWED_MIMES = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

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
  if (error) console.error('tenant_audit_log insert failed', error);
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

  const scan = await scanFile(data);
  if (!scan.clean) {
    throw new ApiError('FILE_REJECTED_BY_SCAN', 'file failed virus scan', 422, {
      reason: scan.reason ?? null,
    });
  }

  const sha256 = createHash('sha256').update(data).digest('hex');
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
  }).catch((err) => console.error('recordAuthEvent failed', err));

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
  const admin = createSupabaseServiceRoleClient();
  const { data: version, error: readErr } = await admin
    .from('document_versions')
    .select('id, tenant_id, storage_path')
    .eq('id', versionId)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!version) throw new ApiError('NOT_FOUND', 'document version not found', 404);
  if (version.tenant_id !== tenantId) {
    throw new ApiError('FORBIDDEN', 'version belongs to a different tenant', 403);
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(version.storage_path as string, ttlSeconds);
  if (signErr || !signed?.signedUrl) {
    throw new ApiError('STORAGE_SIGN_FAILED', signErr?.message ?? 'signed URL failed', 502);
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

export async function setDocumentReview(
  versionId: string,
  ctx: SetDocumentReviewCtx,
  input: DocumentReviewInput,
): Promise<void> {
  if (ctx.role !== 'pro') {
    throw new ApiError('FORBIDDEN', 'only pro can review documents', 403);
  }
  documentReviewSchema.parse(input);

  const admin = createSupabaseServiceRoleClient();
  const { data: version, error: readErr } = await admin
    .from('document_versions')
    .select('id, tenant_id, document_id')
    .eq('id', versionId)
    .maybeSingle();
  if (readErr) throw new ApiError('INTERNAL', readErr.message, 500);
  if (!version) throw new ApiError('NOT_FOUND', 'document version not found', 404);
  if (version.tenant_id !== ctx.tenantId) {
    throw new ApiError('FORBIDDEN', 'version belongs to a different tenant', 403);
  }

  const reviewedAt = new Date().toISOString();
  const { error: updErr } = await admin
    .from('document_versions')
    .update({
      review_status: input.status,
      review_note: input.note ?? null,
      reviewed_by: ctx.actorId,
      reviewed_at: reviewedAt,
    })
    .eq('id', versionId);
  if (updErr) throw new ApiError('INTERNAL', updErr.message, 500);

  let fulfilledRequestId: string | null = null;
  if (input.status === 'approved') {
    const { data: docHead, error: docReadErr } = await admin
      .from('documents')
      .select('id, request_id')
      .eq('id', version.document_id as string)
      .maybeSingle();
    if (docReadErr) throw new ApiError('INTERNAL', docReadErr.message, 500);

    const { error: linkErr } = await admin
      .from('documents')
      .update({ current_version_id: versionId, updated_at: reviewedAt })
      .eq('id', version.document_id as string);
    if (linkErr) throw new ApiError('INTERNAL', linkErr.message, 500);

    const requestId = (docHead?.request_id as string | null | undefined) ?? null;
    if (requestId) {
      const { error: reqErr } = await admin
        .from('document_requests')
        .update({ status: 'fulfilled', updated_at: reviewedAt })
        .eq('id', requestId)
        .neq('status', 'fulfilled');
      if (reqErr) throw new ApiError('INTERNAL', reqErr.message, 500);
      fulfilledRequestId = requestId;
    }
  }

  await logDocumentAudit(ctx.tenantId, ctx.actorId, {
    entity: 'document',
    op: 'review',
    version_id: versionId,
    document_id: version.document_id,
    review_status: input.status,
    fulfilled_request_id: fulfilledRequestId,
  });
  await recordAuthEvent({
    kind: 'tenant_self_updated',
    actorUserId: ctx.actorId,
    tenantId: ctx.tenantId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: {
      entity: 'document',
      op: 'review',
      version_id: versionId,
      review_status: input.status,
    },
  }).catch((err) => console.error('recordAuthEvent failed', err));
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
): Promise<{ id: string }> {
  if (ctx.role !== 'pro') {
    throw new ApiError('FORBIDDEN', 'only pro can request documents', 403);
  }
  createDocumentRequestSchema.parse(input);

  const admin = createSupabaseServiceRoleClient();

  // Cross-tenant guard: client must belong to the caller's tenant.
  const { data: clientRow, error: clientErr } = await admin
    .from('clients')
    .select('id, tenant_id')
    .eq('id', input.client_id)
    .maybeSingle();
  if (clientErr) throw new ApiError('INTERNAL', clientErr.message, 500);
  if (!clientRow) throw new ApiError('NOT_FOUND', 'client not found', 404);
  if (clientRow.tenant_id !== ctx.tenantId) {
    throw new ApiError('FORBIDDEN', 'client belongs to a different tenant', 403);
  }

  const dueAt = input.due_at ? new Date(`${input.due_at}T00:00:00Z`).toISOString() : null;

  const { data: row, error: insertErr } = await admin
    .from('document_requests')
    .insert({
      tenant_id: ctx.tenantId,
      client_id: input.client_id,
      requested_by: ctx.actorId,
      doc_type: input.doc_type,
      label: input.label,
      notes: input.notes ?? null,
      due_at: dueAt,
    })
    .select('id')
    .single();
  if (insertErr || !row) {
    throw new ApiError('INTERNAL', insertErr?.message ?? 'request insert failed', 500);
  }
  const id = row.id as string;

  await logDocumentAudit(ctx.tenantId, ctx.actorId, {
    entity: 'document_request',
    op: 'create',
    request_id: id,
    client_id: input.client_id,
    doc_type: input.doc_type,
  });
  await recordAuthEvent({
    kind: 'tenant_self_updated',
    actorUserId: ctx.actorId,
    tenantId: ctx.tenantId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: {
      entity: 'document_request',
      op: 'create',
      request_id: id,
    },
  }).catch((err) => console.error('recordAuthEvent failed', err));

  await notifyDocumentRequested({
    tenantId: ctx.tenantId,
    clientId: input.client_id,
    requestId: id,
    documentLabel: input.label,
    dueAtIso: dueAt,
  }).catch((err) => console.error('notifyDocumentRequested failed', err));

  return { id };
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
