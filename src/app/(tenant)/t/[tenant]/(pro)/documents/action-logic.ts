import 'server-only';

import { z } from 'zod';

import type { CreateDocumentRequestCtx, SetDocumentReviewCtx } from '@/lib/data/documents';
import type {
  DocumentVersionHistoryEntry,
  SetDocumentExpiryContext,
} from '@/lib/data/pro-document-center';
import { ApiError } from '@/lib/errors';
import {
  createDocumentRequestSchema,
  documentReviewSchema,
  type CreateDocumentRequestInput,
  type DocumentReviewInput,
} from '@/lib/validation/document';
import {
  documentExpirySchema,
  type DocumentExpiryInput,
} from '@/lib/validation/pro-document-center';

type MessageKey =
  | 'documents.errors.validation'
  | 'documents.errors.unauthorized'
  | 'documents.errors.forbidden'
  | 'documents.errors.notFound'
  | 'documents.errors.tenantInactive'
  | 'documents.errors.expiryExternallyManaged'
  | 'documents.errors.openFailed'
  | 'documents.errors.unexpected';

export type DocumentCenterActionResult<T = undefined> =
  | { ok: true; code: 'SUCCESS'; data: T }
  | { ok: false; code: string; messageKey: MessageKey };

export type PublicDocumentVersionHistoryEntry = Omit<
  DocumentVersionHistoryEntry,
  'uploadedBy' | 'reviewedBy'
>;

type ProSession = { id: string; role: 'pro'; tenantId: string | null };
type TenantIdentity = { id: string };
type CompanyIdentity = { id: string; tenantId: string };
type CallerMetadata = { ip: string; userAgent: string | null };

export type DocumentCenterActionDependencies = {
  requirePro(slug: string): Promise<ProSession>;
  resolveTenant(slug: string): Promise<TenantIdentity | null>;
  requireActive(tenantId: string): Promise<unknown>;
  resolveAssignedCompany(profileId: string, slug: string): Promise<CompanyIdentity | null>;
  callerMetadata(): Promise<CallerMetadata>;
  createRequest(
    ctx: CreateDocumentRequestCtx,
    input: CreateDocumentRequestInput,
  ): Promise<{ id: string; companyId: string }>;
  reviewVersion(
    companyId: string,
    versionId: string,
    ctx: SetDocumentReviewCtx,
    input: DocumentReviewInput,
  ): Promise<{ companyId: string }>;
  openVersion(
    tenantId: string,
    companyId: string,
    versionId: string,
  ): Promise<{ url: string; expiresAt: string }>;
  loadHistory(
    tenantId: string,
    companyId: string,
    documentId: string,
  ): Promise<DocumentVersionHistoryEntry[]>;
  setExpiry(
    companyId: string,
    ctx: SetDocumentExpiryContext,
    input: DocumentExpiryInput,
  ): Promise<{ companyId: string }>;
  revalidate(path: string): void;
  rethrowNavigation(error: unknown): void;
  logUnexpected(label: string, error: unknown): void;
};

type AuthorizedContext = {
  tenant: TenantIdentity;
  company: CompanyIdentity;
  actor: { tenantId: string; actorId: string; role: 'pro'; ip: string; userAgent: string | null };
};

const normalizedUuidSchema = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const requestActionSchema = createDocumentRequestSchema.omit({ company_id: true });
const expiryActionSchema = documentExpirySchema.extend({ document_id: normalizedUuidSchema });
async function resolveAndAuthorize(
  slug: string,
  session: ProSession,
  actionDependencies: DocumentCenterActionDependencies,
): Promise<AuthorizedContext> {
  const tenant = await actionDependencies.resolveTenant(slug);
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (!session.tenantId || session.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Access denied', 403);
  }
  await actionDependencies.requireActive(tenant.id);
  const metadata = await actionDependencies.callerMetadata();
  const company = await actionDependencies.resolveAssignedCompany(session.id, slug);
  if (!company || company.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'No active company assignment', 403);
  }
  return {
    tenant,
    company,
    actor: {
      tenantId: tenant.id,
      actorId: session.id,
      role: session.role,
      ip: metadata.ip,
      userAgent: metadata.userAgent,
    },
  };
}

function validationFailure(): DocumentCenterActionResult<never> {
  return {
    ok: false,
    code: 'VALIDATION_FAILED',
    messageKey: 'documents.errors.validation',
  };
}

function errorResult(
  error: unknown,
  label: string,
  actionDependencies: DocumentCenterActionDependencies,
): DocumentCenterActionResult<never> {
  actionDependencies.rethrowNavigation(error);
  if (error instanceof ApiError) {
    const mapped = {
      UNAUTHORIZED: 'documents.errors.unauthorized',
      FORBIDDEN: 'documents.errors.forbidden',
      NOT_FOUND: 'documents.errors.notFound',
      TENANT_NOT_FOUND: 'documents.errors.notFound',
      TENANT_INACTIVE: 'documents.errors.tenantInactive',
      EXPIRY_EXTERNALLY_MANAGED: 'documents.errors.expiryExternallyManaged',
      STORAGE_SIGN_FAILED: 'documents.errors.openFailed',
      VALIDATION_FAILED: 'documents.errors.validation',
    } as const;
    const messageKey = mapped[error.code as keyof typeof mapped];
    if (messageKey) return { ok: false, code: error.code, messageKey };
  }
  actionDependencies.logUnexpected(label, error);
  return { ok: false, code: 'INTERNAL', messageKey: 'documents.errors.unexpected' };
}

function readFormStrings<K extends string>(
  formData: FormData,
  keys: readonly K[],
): Record<K, string | undefined> | null {
  const values = {} as Record<K, string | undefined>;
  for (const key of keys) {
    if (!formData.has(key)) {
      values[key] = undefined;
      continue;
    }
    const value = formData.get(key);
    if (typeof value !== 'string') return null;
    values[key] = value;
  }
  return values;
}

function revalidateDocumentRoutes(
  slug: string,
  actionDependencies: DocumentCenterActionDependencies,
) {
  actionDependencies.revalidate(`/t/${slug}/documents`);
  actionDependencies.revalidate(`/t/${slug}/company`);
  actionDependencies.revalidate(`/t/${slug}/dashboard`);
}

export async function runRequestDocumentCenterAction(
  slug: string,
  _previousState: DocumentCenterActionResult<{ requestId: string }> | null,
  formData: FormData,
  actionDependencies: DocumentCenterActionDependencies,
): Promise<DocumentCenterActionResult<{ requestId: string }>> {
  try {
    const session = await actionDependencies.requirePro(slug);
    const authorization = await resolveAndAuthorize(slug, session, actionDependencies);
    const values = readFormStrings(formData, ['doc_type', 'label', 'due_at', 'notes'] as const);
    if (!values) return validationFailure();
    const parsed = requestActionSchema.safeParse(values);
    if (!parsed.success) return validationFailure();

    const request = await actionDependencies.createRequest(authorization.actor, {
      ...parsed.data,
      company_id: authorization.company.id,
    });
    revalidateDocumentRoutes(slug, actionDependencies);
    return { ok: true, code: 'SUCCESS', data: { requestId: request.id } };
  } catch (error) {
    return errorResult(error, 'document_center.request', actionDependencies);
  }
}

export async function runReviewDocumentCenterAction(
  slug: string,
  _previousState: DocumentCenterActionResult | null,
  formData: FormData,
  actionDependencies: DocumentCenterActionDependencies,
): Promise<DocumentCenterActionResult> {
  try {
    const session = await actionDependencies.requirePro(slug);
    const authorization = await resolveAndAuthorize(slug, session, actionDependencies);
    const values = readFormStrings(formData, ['version_id', 'status', 'note'] as const);
    if (!values) return validationFailure();
    const versionId = normalizedUuidSchema.safeParse(values.version_id);
    const review = documentReviewSchema.safeParse({ status: values.status, note: values.note });
    if (!versionId.success || !review.success) return validationFailure();

    const reviewed = await actionDependencies.reviewVersion(
      authorization.company.id,
      versionId.data,
      authorization.actor,
      review.data,
    );
    if (reviewed.companyId !== authorization.company.id) {
      throw new ApiError('NOT_FOUND', 'Document version not found', 404);
    }
    revalidateDocumentRoutes(slug, actionDependencies);
    return { ok: true, code: 'SUCCESS', data: undefined };
  } catch (error) {
    return errorResult(error, 'document_center.review', actionDependencies);
  }
}

export async function runOpenDocumentVersionAction(
  slug: string,
  versionId: string,
  actionDependencies: DocumentCenterActionDependencies,
): Promise<DocumentCenterActionResult<{ url: string; expiresAt: string }>> {
  try {
    const session = await actionDependencies.requirePro(slug);
    const authorization = await resolveAndAuthorize(slug, session, actionDependencies);
    const parsedVersionId = normalizedUuidSchema.safeParse(versionId);
    if (!parsedVersionId.success) return validationFailure();
    const signed = await actionDependencies.openVersion(
      authorization.tenant.id,
      authorization.company.id,
      parsedVersionId.data,
    );
    return {
      ok: true,
      code: 'SUCCESS',
      data: { url: signed.url, expiresAt: signed.expiresAt },
    };
  } catch (error) {
    return errorResult(error, 'document_center.open', actionDependencies);
  }
}

export async function runLoadVersionHistoryAction(
  slug: string,
  documentId: string,
  actionDependencies: DocumentCenterActionDependencies,
): Promise<DocumentCenterActionResult<PublicDocumentVersionHistoryEntry[]>> {
  try {
    const session = await actionDependencies.requirePro(slug);
    const authorization = await resolveAndAuthorize(slug, session, actionDependencies);
    const parsedDocumentId = normalizedUuidSchema.safeParse(documentId);
    if (!parsedDocumentId.success) return validationFailure();
    const history = await actionDependencies.loadHistory(
      authorization.tenant.id,
      authorization.company.id,
      parsedDocumentId.data,
    );
    const sanitized = history.map((version) => ({
      versionId: version.versionId,
      versionNumber: version.versionNumber,
      current: version.current,
      uploadedAt: version.uploadedAt,
      uploaderName: version.uploaderName,
      reviewStatus: version.reviewStatus,
      reviewerName: version.reviewerName,
      reviewedAt: version.reviewedAt,
      reviewNote: version.reviewNote,
      sizeBytes: version.sizeBytes,
      mimeType: version.mimeType,
    }));
    return { ok: true, code: 'SUCCESS', data: sanitized };
  } catch (error) {
    return errorResult(error, 'document_center.history', actionDependencies);
  }
}

export async function runSetDocumentExpiryAction(
  slug: string,
  _previousState: DocumentCenterActionResult | null,
  formData: FormData,
  actionDependencies: DocumentCenterActionDependencies,
): Promise<DocumentCenterActionResult> {
  try {
    const session = await actionDependencies.requirePro(slug);
    const authorization = await resolveAndAuthorize(slug, session, actionDependencies);
    const values = readFormStrings(formData, ['document_id', 'expires_on'] as const);
    if (!values) return validationFailure();
    const expiry = expiryActionSchema.safeParse({
      document_id: values.document_id,
      expires_on: values.expires_on,
    });
    if (!expiry.success) return validationFailure();

    const updated = await actionDependencies.setExpiry(
      authorization.company.id,
      authorization.actor,
      expiry.data,
    );
    if (updated.companyId !== authorization.company.id) {
      throw new ApiError('NOT_FOUND', 'Document not found', 404);
    }
    revalidateDocumentRoutes(slug, actionDependencies);
    return { ok: true, code: 'SUCCESS', data: undefined };
  } catch (error) {
    return errorResult(error, 'document_center.expiry', actionDependencies);
  }
}
