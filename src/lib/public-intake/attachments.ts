import 'server-only';

import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { scanFilePrivate, type FileScanResult } from '@/lib/security/scan-file';
import {
  validateDocumentUpload,
  type DocumentUploadInput,
  type ValidatedDocumentUpload,
} from '@/lib/storage/document-upload-validation';
import { hashResumeSecret, resumeApplicationDraft, type DraftView } from './applications';
import { hashRequest } from './security';

// P3.05 anonymous attachments reuse P3.07 validation + private ClamAV scanning but keep
// their own resume-credential authorization and a private, non-tenant object namespace.
const ATTACHMENT_BUCKET = 'tenant-documents';
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type UploadAttachmentInput = {
  draftId: string;
  resumeSecret: string;
  operationId: string;
  fieldId: string;
  file: { data: Uint8Array; filename: string; mimeType: string };
};

export type AttachmentReceipt = {
  attachmentId: string;
  fieldId: string;
  scanState: 'clean';
};

type ReserveInput = {
  draftId: string;
  resumeSecret: string;
  operationId: string;
  fieldId: string;
  contentSha256: string;
};

type FinalizeInput = {
  attachmentId: string;
  draftId: string;
  resumeSecret: string;
  storagePath: string;
};

export type UploadAttachmentDeps = {
  resume?: (draftId: string, resumeSecret: string) => Promise<DraftView | null>;
  validate?: (input: DocumentUploadInput) => Promise<ValidatedDocumentUpload>;
  scan?: (data: Uint8Array, filename: string) => Promise<FileScanResult>;
  reserve?: (input: ReserveInput) => Promise<{ attachmentId: string }>;
  store?: (path: string, data: Uint8Array, contentType: string) => Promise<void>;
  finalize?: (input: FinalizeInput) => Promise<void>;
};

export async function uploadDraftAttachment(
  input: UploadAttachmentInput,
  deps: UploadAttachmentDeps = {},
): Promise<AttachmentReceipt> {
  const draft = await (deps.resume ?? resumeApplicationDraft)(input.draftId, input.resumeSecret);
  if (!draft) throw new Error('DRAFT_UNAVAILABLE');

  const validated = await (deps.validate ?? validateDocumentUpload)({
    data: input.file.data,
    filename: input.file.filename,
    mimeType: input.file.mimeType,
    maxBytes: MAX_ATTACHMENT_BYTES,
  });

  const scan = await (deps.scan ?? defaultScan)(validated.data, validated.filename);
  if (!scan.clean) {
    throw new Error(
      scan.reason === 'scanner_unavailable' ? 'SCANNER_UNAVAILABLE' : 'MALWARE_DETECTED',
    );
  }

  const reserved = await (deps.reserve ?? defaultReserve)({
    draftId: input.draftId,
    resumeSecret: input.resumeSecret,
    operationId: input.operationId,
    fieldId: input.fieldId,
    contentSha256: validated.sha256,
  });

  const storagePath = `public-intake/${input.draftId}/${reserved.attachmentId}.${validated.extension}`;
  await (deps.store ?? defaultStore)(storagePath, validated.data, validated.mimeType);
  await (deps.finalize ?? defaultFinalize)({
    attachmentId: reserved.attachmentId,
    draftId: input.draftId,
    resumeSecret: input.resumeSecret,
    storagePath,
  });

  return { attachmentId: reserved.attachmentId, fieldId: input.fieldId, scanState: 'clean' };
}

export type DeleteAttachmentInput = {
  attachmentId: string;
  draftId: string;
  resumeSecret: string;
};

export type DeleteAttachmentDeps = {
  remove?: (input: DeleteAttachmentInput) => Promise<{ storagePath: string | null }>;
  removeObject?: (path: string) => Promise<void>;
};

export async function deleteDraftAttachment(
  input: DeleteAttachmentInput,
  deps: DeleteAttachmentDeps = {},
): Promise<{ deleted: true }> {
  const { storagePath } = await (deps.remove ?? defaultRemove)(input);
  if (storagePath) await (deps.removeObject ?? defaultRemoveObject)(storagePath);
  return { deleted: true };
}

async function defaultScan(data: Uint8Array, filename: string): Promise<FileScanResult> {
  return scanFilePrivate(data, { filename });
}

async function defaultReserve(input: ReserveInput): Promise<{ attachmentId: string }> {
  const admin = createSupabaseServiceRoleClient();
  const requestHash = hashRequest({
    fieldId: input.fieldId,
    contentSha256: input.contentSha256,
    scope: 'attachment_reserve',
  });
  const { data, error } = await admin.rpc(
    'reserve_public_application_attachment' as never,
    {
      p_draft_id: input.draftId,
      p_resume_secret_hash: hashResumeSecret(input.resumeSecret),
      p_operation_id: input.operationId,
      p_request_hash: requestHash,
      p_field_id: input.fieldId,
      p_content_sha256: input.contentSha256,
    } as never,
  );
  if (error || !data) throw new Error(mapAttachmentError(error));
  return data as unknown as { attachmentId: string };
}

async function defaultStore(path: string, data: Uint8Array, contentType: string): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, Buffer.from(data), { contentType, upsert: false });
  if (error) throw new Error('ATTACHMENT_STORE_FAILED');
}

async function defaultFinalize(input: FinalizeInput): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.rpc(
    'finalize_public_application_attachment' as never,
    {
      p_attachment_id: input.attachmentId,
      p_draft_id: input.draftId,
      p_resume_secret_hash: hashResumeSecret(input.resumeSecret),
      p_storage_path: input.storagePath,
    } as never,
  );
  if (error) throw new Error(mapAttachmentError(error));
}

async function defaultRemove(
  input: DeleteAttachmentInput,
): Promise<{ storagePath: string | null }> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.rpc(
    'delete_public_application_attachment' as never,
    {
      p_attachment_id: input.attachmentId,
      p_draft_id: input.draftId,
      p_resume_secret_hash: hashResumeSecret(input.resumeSecret),
    } as never,
  );
  if (error || !data) throw new Error(mapAttachmentError(error));
  const result = data as unknown as { storagePath: string | null };
  return { storagePath: result.storagePath ?? null };
}

async function defaultRemoveObject(path: string): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  await admin.storage.from(ATTACHMENT_BUCKET).remove([path]);
}

function mapAttachmentError(error: { code?: string; message?: string } | null): string {
  if (error?.code === '23505' || error?.message?.includes('ATTACHMENT_DUPLICATE')) {
    return 'ATTACHMENT_DUPLICATE';
  }
  if (error?.message?.includes('DRAFT_UNAVAILABLE')) return 'DRAFT_UNAVAILABLE';
  return 'ATTACHMENT_UNAVAILABLE';
}
