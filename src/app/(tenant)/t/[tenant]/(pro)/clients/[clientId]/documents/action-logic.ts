import { z } from 'zod';

import type { CreateDocumentRequestCtx, SetDocumentReviewCtx } from '@/lib/data/documents';
import { ApiError } from '@/lib/errors';
import {
  createDocumentRequestSchema,
  documentReviewSchema,
  type CreateDocumentRequestInput,
  type DocumentReviewInput,
} from '@/lib/validation/document';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; messageKey: string };

type ProSession = { id: string; tenantId: string | null };
type TenantIdentity = { id: string };

export type LegacyDocumentActionDependencies = {
  requirePro(): Promise<ProSession>;
  resolveTenant(slug: string): Promise<TenantIdentity | null>;
  requireActive(tenantId: string): Promise<unknown>;
  callerMetadata(): Promise<{ ip: string; userAgent: string | null }>;
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
  revalidate(path: string): void;
  rethrowNavigation(error: unknown): void;
  logUnexpected(label: string, error: unknown): void;
};

const uuidSchema = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());

const FAILURE_COPY = {
  UNAUTHORIZED: {
    error: 'Authentication required',
    messageKey: 'documents.errors.unauthorized',
  },
  AAL2_REQUIRED: {
    error: 'Additional verification required',
    messageKey: 'documents.errors.unauthorized',
  },
  VALIDATION_FAILED: {
    error: 'Invalid document action',
    messageKey: 'documents.errors.validation',
  },
  FORBIDDEN: { error: 'Action not allowed', messageKey: 'documents.errors.forbidden' },
  NOT_FOUND: { error: 'Document not found', messageKey: 'documents.errors.notFound' },
  TENANT_NOT_FOUND: { error: 'Firm not found', messageKey: 'documents.errors.notFound' },
  TENANT_INACTIVE: {
    error: 'Firm is inactive',
    messageKey: 'documents.errors.tenantInactive',
  },
  STORAGE_SIGN_FAILED: {
    error: 'Could not open document',
    messageKey: 'documents.errors.openFailed',
  },
} as const;

function actionFailure(code: keyof typeof FAILURE_COPY): ActionResult<never> {
  return { ok: false, code, ...FAILURE_COPY[code] };
}

function sanitizeError(
  error: unknown,
  label: string,
  dependencies: LegacyDocumentActionDependencies,
): ActionResult<never> {
  dependencies.rethrowNavigation(error);
  if (error instanceof ApiError && Object.hasOwn(FAILURE_COPY, error.code)) {
    return actionFailure(error.code as keyof typeof FAILURE_COPY);
  }
  dependencies.logUnexpected(label, error);
  return {
    ok: false,
    error: 'Document action failed',
    code: 'INTERNAL',
    messageKey: 'documents.errors.unexpected',
  };
}

async function resolveAndAuthorize(slug: string, dependencies: LegacyDocumentActionDependencies) {
  const session = await dependencies.requirePro();
  const tenant = await dependencies.resolveTenant(slug);
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (!session.tenantId || session.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Access denied', 403);
  }
  await dependencies.requireActive(tenant.id);
  const metadata = await dependencies.callerMetadata();
  return {
    tenant,
    actor: {
      tenantId: tenant.id,
      actorId: session.id,
      role: 'pro' as const,
      ip: metadata.ip,
      userAgent: metadata.userAgent,
    },
  };
}

function revalidateDocumentRoutes(
  slug: string,
  clientId: string,
  dependencies: LegacyDocumentActionDependencies,
) {
  dependencies.revalidate(`/t/${slug}/documents`);
  dependencies.revalidate(`/t/${slug}/clients/${clientId}`);
}

export async function runRequestDocumentAction(
  slug: string,
  raw: unknown,
  dependencies: LegacyDocumentActionDependencies,
): Promise<ActionResult<{ requestId: string }>> {
  try {
    const authorization = await resolveAndAuthorize(slug, dependencies);
    const parsed = createDocumentRequestSchema.safeParse(raw);
    if (!parsed.success) return actionFailure('VALIDATION_FAILED');

    const request = await dependencies.createRequest(authorization.actor, parsed.data);
    revalidateDocumentRoutes(slug, parsed.data.client_id, dependencies);
    return { ok: true, data: { requestId: request.id } };
  } catch (error) {
    return sanitizeError(error, 'requestDocumentAction unexpected error', dependencies);
  }
}

export async function runReviewDocumentVersionAction(
  slug: string,
  clientId: string,
  versionId: string,
  raw: unknown,
  dependencies: LegacyDocumentActionDependencies,
): Promise<ActionResult<void>> {
  try {
    const authorization = await resolveAndAuthorize(slug, dependencies);
    const parsed = documentReviewSchema.safeParse(raw);
    const parsedClientId = uuidSchema.safeParse(clientId);
    if (!parsed.success || !parsedClientId.success) return actionFailure('VALIDATION_FAILED');

    await dependencies.reviewVersion(versionId, authorization.actor, parsed.data);
    revalidateDocumentRoutes(slug, parsedClientId.data, dependencies);
    return { ok: true, data: undefined };
  } catch (error) {
    return sanitizeError(error, 'reviewDocumentVersionAction unexpected error', dependencies);
  }
}

export async function runGetDocumentSignedUrlAction(
  slug: string,
  versionId: string,
  dependencies: LegacyDocumentActionDependencies,
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  try {
    const authorization = await resolveAndAuthorize(slug, dependencies);
    const result = await dependencies.openVersion(authorization.tenant.id, versionId);
    return { ok: true, data: { url: result.url, expiresAt: result.expiresAt } };
  } catch (error) {
    return sanitizeError(error, 'getDocumentSignedUrlAction unexpected error', dependencies);
  }
}
