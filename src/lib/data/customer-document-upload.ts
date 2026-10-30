import 'server-only';

import { ApiError } from '@/lib/errors';
import type { UploadDocumentResult } from '@/lib/data/documents';
import type { CustomerUploadActionInput } from '@/lib/validation/document';

export type CustomerUploadAuthority = {
  actorId: string;
  tenantId: string;
  companyId: string;
};

export type CustomerUploadRequestMetadata = {
  ip?: string;
  userAgent?: string | null;
};

type CustomerUploadDependencies = {
  readRequest?: (
    tenantId: string,
    companyId: string,
    requestId: string,
  ) => Promise<'pending' | 'fulfilled' | 'cancelled' | null>;
  upload?: typeof import('@/lib/data/documents').uploadDocument;
};

async function readRequest(
  tenantId: string,
  companyId: string,
  requestId: string,
): Promise<'pending' | 'fulfilled' | 'cancelled' | null> {
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('document_requests')
    .select('status')
    .eq('id', requestId)
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Document request lookup failed', 500);
  return data?.status ?? null;
}

export async function resolveCustomerDocumentUploadAuthority(
  tenantSlug: string,
): Promise<CustomerUploadAuthority> {
  const { requireAuthorizedCustomerLinkedCompanyRead } =
    await import('@/lib/data/customer-company-access');
  const access = await requireAuthorizedCustomerLinkedCompanyRead(tenantSlug);
  return {
    actorId: access.session.id,
    tenantId: access.tenant.id,
    companyId: access.company.id,
  };
}

export async function submitCustomerDocumentUpload(
  authority: CustomerUploadAuthority,
  fields: CustomerUploadActionInput,
  file: File,
  metadata: CustomerUploadRequestMetadata = {},
  dependencies: CustomerUploadDependencies = {},
): Promise<UploadDocumentResult> {
  if (fields.request_id) {
    const status = await (dependencies.readRequest ?? readRequest)(
      authority.tenantId,
      authority.companyId,
      fields.request_id,
    );
    if (status !== 'pending' && status !== 'fulfilled') {
      throw new ApiError('FORBIDDEN', 'Document request is unavailable', 403);
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const upload = dependencies.upload ?? (await import('@/lib/data/documents')).uploadDocument;
  return upload({
    tenantId: authority.tenantId,
    companyId: authority.companyId,
    docType: fields.doc_type,
    operationId: fields.operation_id,
    requestId: fields.request_id,
    label: fields.label,
    file: {
      data: bytes,
      originalName: file.name || 'upload',
      mimeType: file.type || 'application/octet-stream',
    },
    actor: {
      id: authority.actorId,
      role: 'customer',
      ip: metadata.ip ?? 'unknown',
      userAgent: metadata.userAgent ?? null,
    },
  });
}
