'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { ApiError } from '@/lib/errors';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import { getCompanyDocumentSignedUrl, uploadDocument } from '@/lib/data/documents';
import { customerUploadActionSchema } from '@/lib/validation/document';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

type CustomerCallerCtx = {
  caller: { id: string; tenantId: string };
  tenant: { id: string; slug: string };
  linkedCompanyId: string;
  ip: string;
  userAgent: string | null;
};

async function resolveCustomerCallerCtx(slug: string): Promise<CustomerCallerCtx> {
  const access = await authorizeCustomerLinkedCompanyRead(slug);
  if (access.kind !== 'authorized') {
    throw new ApiError('FORBIDDEN', 'Company document access denied', 403);
  }

  const hdr = await headers();
  const ip = hdr.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const userAgent = hdr.get('user-agent') ?? null;

  return {
    caller: { id: access.session.id, tenantId: access.tenant.id },
    tenant: { id: access.tenant.id, slug: access.tenant.slug },
    linkedCompanyId: access.company.id,
    ip,
    userAgent,
  };
}

function safeCustomerDocumentError(error: ApiError, fallback: string): ActionResult<never> {
  const safeMessages: Record<string, string> = {
    VALIDATION_FAILED: 'The document request is invalid.',
    PAYLOAD_EMPTY: 'Choose a file to upload.',
    UNSUPPORTED_MEDIA_TYPE: 'This file type is not allowed.',
    PAYLOAD_TOO_LARGE: 'The file is too large.',
    FILE_REJECTED_BY_SCAN: 'The file did not pass the security scan.',
    SCANNER_UNAVAILABLE: 'The security scan is temporarily unavailable. Try again.',
    FORBIDDEN: 'The document is not available.',
    NOT_FOUND: 'The document is not available.',
    NO_LINKED_COMPANY: 'The Company account is not linked.',
  };
  return { ok: false, error: safeMessages[error.code] ?? fallback, code: error.code };
}

async function assertRequestBelongsToCompany(args: {
  tenantId: string;
  companyId: string;
  requestId: string;
}): Promise<void> {
  // RLS on document_requests scopes customer reads to their linked company.
  // A null result = either the request does not exist or it belongs to a
  // different company/tenant. Either way, deny with FORBIDDEN.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('document_requests')
    .select('id, status')
    .eq('id', args.requestId)
    .eq('tenant_id', args.tenantId)
    .eq('company_id', args.companyId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  if (!data) {
    throw new ApiError('FORBIDDEN', 'Request not found for this company', 403);
  }
  if (data.status !== 'pending') {
    throw new ApiError('FORBIDDEN', 'Request is not awaiting upload', 403);
  }
}

export async function uploadDocumentAction(
  slug: string,
  formData: FormData,
): Promise<ActionResult<{ documentId: string; versionId: string }>> {
  try {
    const ctx = await resolveCustomerCallerCtx(slug);
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { ok: false, error: 'File missing from upload', code: 'PAYLOAD_EMPTY' };
    }

    const parsed = customerUploadActionSchema.safeParse({
      doc_type: formData.get('doc_type'),
      request_id: formData.get('request_id') ?? undefined,
      label: formData.get('label') ?? undefined,
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message, code: 'VALIDATION_FAILED' };
    }

    if (parsed.data.request_id) {
      await assertRequestBelongsToCompany({
        tenantId: ctx.tenant.id,
        companyId: ctx.linkedCompanyId,
        requestId: parsed.data.request_id,
      });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    const result = await uploadDocument({
      tenantId: ctx.tenant.id,
      companyId: ctx.linkedCompanyId,
      docType: parsed.data.doc_type,
      requestId: parsed.data.request_id,
      label: parsed.data.label,
      file: {
        data: bytes,
        originalName: file.name || 'upload',
        mimeType: file.type || 'application/octet-stream',
      },
      actor: {
        id: ctx.caller.id,
        role: 'customer',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });

    revalidatePath(`/t/${slug}/portal/documents`);
    revalidatePath(`/t/${slug}/portal`);

    return {
      ok: true,
      data: { documentId: result.documentId, versionId: result.versionId },
    };
  } catch (e) {
    if (e instanceof ApiError) return safeCustomerDocumentError(e, 'Could not upload document');
    console.error('uploadDocumentAction unexpected error', e);
    return { ok: false, error: 'Could not upload document', code: 'INTERNAL' };
  }
}

export async function getCustomerDocumentSignedUrlAction(
  slug: string,
  versionId: string,
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  try {
    const ctx = await resolveCustomerCallerCtx(slug);

    // RLS check via user-scoped client: customer can only read versions of
    // documents whose company_id matches their linked_company_id. A null result
    // means either the version does not exist or RLS blocked it — treat both
    // as FORBIDDEN to avoid leaking existence.
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('document_versions')
      .select(
        'id, tenant_id, document:documents!document_versions_document_id_fkey!inner(id, tenant_id, company_id)',
      )
      .eq('id', versionId)
      .eq('tenant_id', ctx.tenant.id)
      .maybeSingle();
    if (error) throw new ApiError('INTERNAL', error.message, 500);
    if (!data) throw new ApiError('FORBIDDEN', 'Version not accessible', 403);

    const owned = data as unknown as {
      tenant_id: string;
      document: { id: string; company_id: string; tenant_id: string };
    };
    const doc = owned.document;
    if (
      owned.tenant_id !== ctx.tenant.id ||
      doc.tenant_id !== ctx.tenant.id ||
      doc.company_id !== ctx.linkedCompanyId
    ) {
      throw new ApiError('FORBIDDEN', 'Version not accessible', 403);
    }

    const signed = await getCompanyDocumentSignedUrl(ctx.tenant.id, ctx.linkedCompanyId, versionId);
    return { ok: true, data: signed };
  } catch (e) {
    if (e instanceof ApiError) return safeCustomerDocumentError(e, 'Could not open document');
    console.error('getCustomerDocumentSignedUrlAction unexpected error', e);
    return { ok: false, error: 'Could not sign URL', code: 'INTERNAL' };
  }
}
