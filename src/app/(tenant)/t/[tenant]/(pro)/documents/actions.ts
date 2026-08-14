'use server';

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

type ProSession = { id: string; tenantId: string | null };
type TenantIdentity = { id: string };
type CallerMetadata = { ip: string; userAgent: string | null };

export type DocumentCenterActionDependencies = {
  requirePro(): Promise<ProSession>;
  resolveTenant(slug: string): Promise<TenantIdentity | null>;
  requireActive(tenantId: string): Promise<unknown>;
  callerMetadata(): Promise<CallerMetadata>;
  createRequest(
    ctx: CreateDocumentRequestCtx,
    input: CreateDocumentRequestInput,
  ): Promise<{ id: string }>;
  reviewVersion(
    versionId: string,
    ctx: SetDocumentReviewCtx,
    input: DocumentReviewInput,
  ): Promise<void>;
  openVersion(tenantId: string, versionId: string): Promise<{ url: string; expiresAt: string }>;
  loadHistory(tenantId: string, documentId: string): Promise<DocumentVersionHistoryEntry[]>;
  setExpiry(ctx: SetDocumentExpiryContext, input: DocumentExpiryInput): Promise<void>;
  revalidate(path: string): void;
  rethrowNavigation(error: unknown): void;
  logUnexpected(label: string, error: unknown): void;
};

type AuthorizedContext = {
  tenant: TenantIdentity;
  actor: { tenantId: string; actorId: string; role: 'pro'; ip: string; userAgent: string | null };
};

const normalizedUuidSchema = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const requestActionSchema = createDocumentRequestSchema.extend({ client_id: normalizedUuidSchema });
const actionEntityIdsSchema = z.object({
  client_id: normalizedUuidSchema,
  entity_id: normalizedUuidSchema,
});
const expiryActionSchema = documentExpirySchema.extend({ document_id: normalizedUuidSchema });

async function dependencies(): Promise<DocumentCenterActionDependencies> {
  const [cache, request, navigation, role, activeTenant, documents, documentCenter, tenantData] =
    await Promise.all([
      import('next/cache'),
      import('next/headers'),
      import('next/navigation'),
      import('@/lib/auth/require-role'),
      import('@/lib/auth/require-active-tenant'),
      import('@/lib/data/documents'),
      import('@/lib/data/pro-document-center'),
      import('@/lib/data/tenant'),
    ]);
  return {
    requirePro: async () => {
      const session = await role.requireRole('pro');
      return { id: session.id, tenantId: session.tenantId };
    },
    resolveTenant: tenantData.resolveTenantBySlug,
    requireActive: activeTenant.requireActiveTenant,
    callerMetadata: async () => {
      const requestHeaders = await request.headers();
      return {
        ip: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
        userAgent: requestHeaders.get('user-agent'),
      };
    },
    createRequest: documents.createDocumentRequest,
    reviewVersion: documents.setDocumentReview,
    openVersion: documents.getDocumentSignedUrl,
    loadHistory: documentCenter.listDocumentVersionHistory,
    setExpiry: documentCenter.setDocumentExpiry,
    revalidate: cache.revalidatePath,
    rethrowNavigation: navigation.unstable_rethrow,
    logUnexpected: (label, error) => console.error(label, error),
  };
}

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
  return {
    tenant,
    actor: {
      tenantId: tenant.id,
      actorId: session.id,
      role: 'pro',
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
  clientId: string,
  actionDependencies: DocumentCenterActionDependencies,
) {
  actionDependencies.revalidate(`/t/${slug}/documents`);
  actionDependencies.revalidate(`/t/${slug}/clients/${clientId}`);
}

export async function runRequestDocumentCenterAction(
  slug: string,
  _previousState: DocumentCenterActionResult<{ requestId: string }> | null,
  formData: FormData,
  actionDependencies: DocumentCenterActionDependencies,
): Promise<DocumentCenterActionResult<{ requestId: string }>> {
  try {
    const session = await actionDependencies.requirePro();
    const authorization = await resolveAndAuthorize(slug, session, actionDependencies);
    const values = readFormStrings(formData, [
      'client_id',
      'doc_type',
      'label',
      'due_at',
      'notes',
    ] as const);
    if (!values) return validationFailure();
    const parsed = requestActionSchema.safeParse(values);
    if (!parsed.success) return validationFailure();

    const request = await actionDependencies.createRequest(authorization.actor, parsed.data);
    revalidateDocumentRoutes(slug, parsed.data.client_id, actionDependencies);
    return { ok: true, code: 'SUCCESS', data: { requestId: request.id } };
  } catch (error) {
    return errorResult(error, 'requestDocumentCenterAction failed', actionDependencies);
  }
}

export async function runReviewDocumentCenterAction(
  slug: string,
  _previousState: DocumentCenterActionResult | null,
  formData: FormData,
  actionDependencies: DocumentCenterActionDependencies,
): Promise<DocumentCenterActionResult> {
  try {
    const session = await actionDependencies.requirePro();
    const authorization = await resolveAndAuthorize(slug, session, actionDependencies);
    const values = readFormStrings(formData, [
      'version_id',
      'client_id',
      'status',
      'note',
    ] as const);
    if (!values) return validationFailure();
    const ids = actionEntityIdsSchema.safeParse({
      client_id: values.client_id,
      entity_id: values.version_id,
    });
    const review = documentReviewSchema.safeParse({ status: values.status, note: values.note });
    if (!ids.success || !review.success) return validationFailure();

    await actionDependencies.reviewVersion(ids.data.entity_id, authorization.actor, review.data);
    revalidateDocumentRoutes(slug, ids.data.client_id, actionDependencies);
    return { ok: true, code: 'SUCCESS', data: undefined };
  } catch (error) {
    return errorResult(error, 'reviewDocumentCenterAction failed', actionDependencies);
  }
}

export async function runOpenDocumentVersionAction(
  slug: string,
  versionId: string,
  actionDependencies: DocumentCenterActionDependencies,
): Promise<DocumentCenterActionResult<{ url: string; expiresAt: string }>> {
  try {
    const session = await actionDependencies.requirePro();
    const authorization = await resolveAndAuthorize(slug, session, actionDependencies);
    const parsedVersionId = normalizedUuidSchema.safeParse(versionId);
    if (!parsedVersionId.success) return validationFailure();
    const signed = await actionDependencies.openVersion(
      authorization.tenant.id,
      parsedVersionId.data,
    );
    return {
      ok: true,
      code: 'SUCCESS',
      data: { url: signed.url, expiresAt: signed.expiresAt },
    };
  } catch (error) {
    return errorResult(error, 'openDocumentVersionAction failed', actionDependencies);
  }
}

export async function runLoadVersionHistoryAction(
  slug: string,
  documentId: string,
  actionDependencies: DocumentCenterActionDependencies,
): Promise<DocumentCenterActionResult<DocumentVersionHistoryEntry[]>> {
  try {
    const session = await actionDependencies.requirePro();
    const authorization = await resolveAndAuthorize(slug, session, actionDependencies);
    const parsedDocumentId = normalizedUuidSchema.safeParse(documentId);
    if (!parsedDocumentId.success) return validationFailure();
    const history = await actionDependencies.loadHistory(
      authorization.tenant.id,
      parsedDocumentId.data,
    );
    const sanitized = history.map((version) => ({
      versionId: version.versionId,
      versionNumber: version.versionNumber,
      current: version.current,
      uploadedAt: version.uploadedAt,
      uploadedBy: version.uploadedBy,
      uploaderName: version.uploaderName,
      reviewStatus: version.reviewStatus,
      reviewedBy: version.reviewedBy,
      reviewerName: version.reviewerName,
      reviewedAt: version.reviewedAt,
      reviewNote: version.reviewNote,
      sizeBytes: version.sizeBytes,
      mimeType: version.mimeType,
    }));
    return { ok: true, code: 'SUCCESS', data: sanitized };
  } catch (error) {
    return errorResult(error, 'loadVersionHistoryAction failed', actionDependencies);
  }
}

export async function runSetDocumentExpiryAction(
  slug: string,
  _previousState: DocumentCenterActionResult | null,
  formData: FormData,
  actionDependencies: DocumentCenterActionDependencies,
): Promise<DocumentCenterActionResult> {
  try {
    const session = await actionDependencies.requirePro();
    const authorization = await resolveAndAuthorize(slug, session, actionDependencies);
    const values = readFormStrings(formData, ['document_id', 'client_id', 'expires_on'] as const);
    if (!values) return validationFailure();
    const clientId = normalizedUuidSchema.safeParse(values.client_id);
    const expiry = expiryActionSchema.safeParse({
      document_id: values.document_id,
      expires_on: values.expires_on,
    });
    if (!clientId.success || !expiry.success) return validationFailure();

    await actionDependencies.setExpiry(authorization.actor, expiry.data);
    revalidateDocumentRoutes(slug, clientId.data, actionDependencies);
    return { ok: true, code: 'SUCCESS', data: undefined };
  } catch (error) {
    return errorResult(error, 'setDocumentExpiryAction failed', actionDependencies);
  }
}

export async function requestDocumentCenterAction(
  slug: string,
  previousState: DocumentCenterActionResult<{ requestId: string }> | null,
  formData: FormData,
): Promise<DocumentCenterActionResult<{ requestId: string }>> {
  return runRequestDocumentCenterAction(slug, previousState, formData, await dependencies());
}

export async function reviewDocumentCenterAction(
  slug: string,
  previousState: DocumentCenterActionResult | null,
  formData: FormData,
): Promise<DocumentCenterActionResult> {
  return runReviewDocumentCenterAction(slug, previousState, formData, await dependencies());
}

export async function openDocumentVersionAction(
  slug: string,
  versionId: string,
): Promise<DocumentCenterActionResult<{ url: string; expiresAt: string }>> {
  return runOpenDocumentVersionAction(slug, versionId, await dependencies());
}

export async function loadVersionHistoryAction(
  slug: string,
  documentId: string,
): Promise<DocumentCenterActionResult<DocumentVersionHistoryEntry[]>> {
  return runLoadVersionHistoryAction(slug, documentId, await dependencies());
}

export async function setDocumentExpiryAction(
  slug: string,
  previousState: DocumentCenterActionResult | null,
  formData: FormData,
): Promise<DocumentCenterActionResult> {
  return runSetDocumentExpiryAction(slug, previousState, formData, await dependencies());
}
