import 'server-only';

import { ApiError } from '@/lib/errors';
import type { UploadDocumentResult } from '@/lib/data/documents';
import type { CustomerUploadActionInput } from '@/lib/validation/document';

export type EmployeeUploadAuthority = {
  actorId: string;
  tenantId: string;
  companyId: string;
  employeeId: string;
};

export type EmployeeUploadActionInput = CustomerUploadActionInput & { request_id: string };

type RequestState = {
  status: 'pending' | 'fulfilled' | 'cancelled';
  employeeId: string;
  docType: string;
};

type Dependencies = {
  readRequest?: (
    tenantId: string,
    companyId: string,
    employeeId: string,
    requestId: string,
  ) => Promise<RequestState | null>;
  upload?: typeof import('@/lib/data/documents').uploadDocument;
};

async function readRequest(
  tenantId: string,
  companyId: string,
  employeeId: string,
  requestId: string,
): Promise<RequestState | null> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const { data, error } = await createSupabaseServiceRoleClient()
    .from('document_requests')
    .select('status, employee_id, doc_type')
    .eq('id', requestId)
    .eq('tenant_id', tenantId)
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', 'Document request lookup failed', 500);
  return data
    ? { status: data.status, employeeId: data.employee_id, docType: data.doc_type }
    : null;
}

export async function resolveEmployeeDocumentUploadAuthority(
  tenantSlug: string,
): Promise<EmployeeUploadAuthority> {
  const { authorizeEmployeePortalRead } = await import('@/lib/data/employee-portal-workspace');
  const access = await authorizeEmployeePortalRead(tenantSlug);
  if (access.company?.kind !== 'active') {
    throw new ApiError('FORBIDDEN', 'Document request is unavailable', 403);
  }
  return {
    actorId: access.session.id,
    tenantId: access.tenant.id,
    companyId: access.employee.companyId,
    employeeId: access.employee.id,
  };
}

export async function submitEmployeeDocumentUpload(
  authority: EmployeeUploadAuthority,
  fields: EmployeeUploadActionInput,
  file: File,
  metadata: { ip?: string; userAgent?: string | null } = {},
  dependencies: Dependencies = {},
): Promise<UploadDocumentResult> {
  const request = await (dependencies.readRequest ?? readRequest)(
    authority.tenantId,
    authority.companyId,
    authority.employeeId,
    fields.request_id,
  );
  if (
    !request ||
    (request.status !== 'pending' && request.status !== 'fulfilled') ||
    request.employeeId !== authority.employeeId ||
    request.docType !== fields.doc_type
  ) {
    throw new ApiError('FORBIDDEN', 'Document request is unavailable', 403);
  }

  const upload = dependencies.upload ?? (await import('@/lib/data/documents')).uploadDocument;
  return upload({
    tenantId: authority.tenantId,
    companyId: authority.companyId,
    employeeId: authority.employeeId,
    docType: fields.doc_type,
    operationId: fields.operation_id,
    requestId: fields.request_id,
    label: fields.label,
    file: {
      data: new Uint8Array(await file.arrayBuffer()),
      originalName: file.name || 'upload',
      mimeType: file.type || 'application/octet-stream',
    },
    actor: {
      id: authority.actorId,
      role: 'employee',
      ip: metadata.ip ?? 'unknown',
      userAgent: metadata.userAgent ?? null,
    },
  });
}
