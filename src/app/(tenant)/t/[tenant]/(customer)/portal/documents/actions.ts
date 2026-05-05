'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { ApiError } from '@/lib/errors';
import { requireRole } from '@/lib/auth/require-role';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { readSelfCustomer } from '@/lib/data/account-self';
import { getDocumentSignedUrl, uploadDocument } from '@/lib/data/documents';
import { customerUploadActionSchema } from '@/lib/validation/document';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

type CustomerCallerCtx = {
  caller: { id: string; tenantId: string };
  tenant: { id: string; slug: string };
  linkedClientId: string;
  ip: string;
  userAgent: string | null;
};

async function resolveCustomerCallerCtx(slug: string): Promise<CustomerCallerCtx> {
  const session = await requireRole('customer');
  if (!session.tenantId) {
    throw new ApiError('FORBIDDEN', 'Session missing tenant binding', 403);
  }
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (session.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
  }
  await requireActiveTenant(tenant.id);

  const customer = await readSelfCustomer();
  if (!customer.linkedClientId) {
    throw new ApiError(
      'NO_LINKED_CLIENT',
      'Account is not linked to a client. Ask your PRO firm to link you.',
      403,
    );
  }

  const hdr = await headers();
  const ip = hdr.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const userAgent = hdr.get('user-agent') ?? null;

  return {
    caller: { id: session.id, tenantId: session.tenantId },
    tenant: { id: tenant.id, slug: tenant.slug },
    linkedClientId: customer.linkedClientId,
    ip,
    userAgent,
  };
}

async function assertRequestBelongsToClient(args: {
  tenantId: string;
  clientId: string;
  requestId: string;
}): Promise<void> {
  // RLS on document_requests scopes customer reads to their own client.
  // A null result = either the request does not exist or it belongs to a
  // different client/tenant. Either way, deny with FORBIDDEN.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('document_requests')
    .select('id, status')
    .eq('id', args.requestId)
    .eq('tenant_id', args.tenantId)
    .eq('client_id', args.clientId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  if (!data) {
    throw new ApiError('FORBIDDEN', 'Request not found for this client', 403);
  }
  if (data.status === 'cancelled') {
    throw new ApiError('FORBIDDEN', 'Request has been cancelled', 403);
  }
}

export async function uploadDocumentAction(
  slug: string,
  formData: FormData,
): Promise<ActionResult<{ documentId: string; versionId: string }>> {
  try {
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

    const ctx = await resolveCustomerCallerCtx(slug);

    if (parsed.data.request_id) {
      await assertRequestBelongsToClient({
        tenantId: ctx.tenant.id,
        clientId: ctx.linkedClientId,
        requestId: parsed.data.request_id,
      });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    const result = await uploadDocument({
      tenantId: ctx.tenant.id,
      clientId: ctx.linkedClientId,
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
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
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
    // documents whose client_id matches their linked_client_id. A null result
    // means either the version does not exist or RLS blocked it — treat both
    // as FORBIDDEN to avoid leaking existence.
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('document_versions')
      .select('id, document_id, documents!inner(client_id, tenant_id)')
      .eq('id', versionId)
      .maybeSingle();
    if (error) throw new ApiError('INTERNAL', error.message, 500);
    if (!data) throw new ApiError('FORBIDDEN', 'Version not accessible', 403);

    const doc = (data as unknown as { documents: { client_id: string; tenant_id: string } })
      .documents;
    if (doc.tenant_id !== ctx.tenant.id || doc.client_id !== ctx.linkedClientId) {
      throw new ApiError('FORBIDDEN', 'Version not accessible', 403);
    }

    const signed = await getDocumentSignedUrl(ctx.tenant.id, versionId);
    return { ok: true, data: signed };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message, code: e.code };
    console.error('getCustomerDocumentSignedUrlAction unexpected error', e);
    return { ok: false, error: 'Could not sign URL', code: 'INTERNAL' };
  }
}
