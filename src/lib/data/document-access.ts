import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '../errors';
import { buildDocumentUploadPath } from '../storage/document-upload-validation';

/** All identifiers must come from authenticated server authority, not form scope. */
export type DocumentAccessInput = {
  actorId: string;
  tenantId: string;
  companyId: string;
  documentId: string;
  versionId: string;
  lifetimeSeconds?: number;
};
export type DocumentAccessDependencies = {
  now: () => number;
  apiBaseUrl: string;
  /** Trusted local-runtime escape hatch. HTTP remains limited to exact loopback hosts. */
  allowHttpLoopback?: boolean;
  timeoutMs?: number;
  rpc: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
  sign: (bucket: string, path: string, ttl: number, signal: AbortSignal) => Promise<unknown>;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const CONTEXT_KEYS = [
  'status',
  'tenantId',
  'companyId',
  'requestId',
  'documentId',
  'versionId',
  'operationId',
  'sha256',
  'storageBucket',
  'storagePath',
  'mimeType',
  'sizeBytes',
  'expiresAt',
  'objectId',
  'extension',
];
const internalErrors = new WeakSet<ApiError>();
function failure(status = 503): ApiError {
  const error = Object.freeze(
    new ApiError(
      status === 403
        ? 'FORBIDDEN'
        : status === 400
          ? 'VALIDATION_FAILED'
          : status === 409
            ? 'CONFLICT'
            : status === 410
              ? 'DOCUMENT_ACCESS_EXPIRED'
              : 'DOCUMENT_ACCESS_FAILED',
      'Document access could not be completed',
      status,
    ),
  );
  internalErrors.add(error);
  return error;
}
function protocol(): never {
  throw failure(502);
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) protocol();
  return v as Record<string, unknown>;
}
function exact(r: Record<string, unknown>, keys: string[]) {
  if (Object.keys(r).length !== keys.length || keys.some((k) => !Object.hasOwn(r, k))) protocol();
}
function uuid(v: unknown): string {
  if (typeof v !== 'string' || !UUID.test(v)) protocol();
  return v.toLowerCase();
}
function timestamp(v: unknown): number {
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(v) ||
    !Number.isFinite(Date.parse(v))
  )
    protocol();
  return Date.parse(v);
}
function clock(deps: DocumentAccessDependencies) {
  const value = deps.now();
  if (!Number.isFinite(value)) protocol();
  return value;
}
async function bounded<T>(
  deps: DocumentAccessDependencies,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeout = deps.timeoutMs ?? 15000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000) throw failure(400);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => fn(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(failure());
        }, timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
function jwtPart(part: string): Record<string, unknown> {
  if (!/^[A-Za-z0-9_-]+$/u.test(part) || part.length > 8192) protocol();
  const bytes = Buffer.from(part, 'base64url');
  if (bytes.toString('base64url') !== part) protocol();
  try {
    return record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    protocol();
  }
}
function provider(
  value: unknown,
  path: string,
  deadline: number,
  deps: DocumentAccessDependencies,
  policy: Readonly<{ apiBaseUrl: string; allowHttpLoopback: boolean }>,
) {
  const response = record(value);
  exact(response, ['data', 'error']);
  if (response.error !== null) throw failure();
  const data = record(response.data);
  exact(data, ['signedUrl']);
  if (typeof data.signedUrl !== 'string' || data.signedUrl.length > 20000) protocol();
  const bearer = data.signedUrl; // Snapshot before the final authorization await.
  let base: URL;
  let url: URL;
  try {
    base = new URL(policy.apiBaseUrl);
    url = new URL(bearer);
  } catch {
    protocol();
  }
  const loopbackHttp =
    policy.allowHttpLoopback &&
    base.protocol === 'http:' &&
    new Set(['localhost', '127.0.0.1', '::1', '[::1]']).has(base.hostname.toLowerCase());
  if (
    (base.protocol !== 'https:' && !loopbackHttp) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    url.origin !== base.origin ||
    url.protocol !== base.protocol ||
    url.username ||
    url.password ||
    url.hash
  )
    protocol();
  const expected = `${base.pathname.replace(/\/$/u, '')}/storage/v1/object/sign/tenant-documents/${path}`;
  const token = url.searchParams.get('token');
  if (url.pathname !== expected || !token || url.search !== `?token=${token}`) protocol();
  const parts = token.split('.');
  if (parts.length !== 3) protocol();
  const header = jwtPart(parts[0]);
  const claims = jwtPart(parts[1]);
  if (
    header.alg !== 'HS256' ||
    (header.typ !== undefined && header.typ !== 'JWT') ||
    !/^[A-Za-z0-9_-]{43}$/u.test(parts[2]) ||
    Buffer.from(parts[2], 'base64url').toString('base64url') !== parts[2]
  )
    protocol();
  // Claims validate trusted SDK protocol/expiration only; this is not signature verification.
  if (
    claims.url !== `tenant-documents/${path}` ||
    typeof claims.exp !== 'number' ||
    !Number.isSafeInteger(claims.exp) ||
    claims.exp * 1000 <= clock(deps) ||
    claims.exp * 1000 > deadline
  )
    protocol();
  return Object.freeze({ url: bearer, expiresAt: new Date(claims.exp * 1000).toISOString() });
}

/** Grants audit access issuance, never claim that the bearer was downloaded. */
export async function signDocumentAccess(
  input: DocumentAccessInput,
  deps: DocumentAccessDependencies = createDocumentAccessDependencies(),
): Promise<{ url: string; expiresAt: string }> {
  let args: Record<string, unknown>;
  let ttl: number;
  try {
    ttl = input.lifetimeSeconds ?? 300; // Legacy signed access is five minutes.
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 300) throw failure(400);
    args = Object.freeze({
      p_actor_id: uuid(input.actorId),
      p_tenant_id: uuid(input.tenantId),
      p_company_id: uuid(input.companyId),
      p_document_id: uuid(input.documentId),
      p_version_id: uuid(input.versionId),
      p_lifetime_seconds: ttl,
    });
  } catch {
    throw failure(400);
  }
  try {
    const deadline = clock(deps) + ttl * 1000;
    const providerPolicy = Object.freeze({
      apiBaseUrl: deps.apiBaseUrl,
      allowHttpLoopback: deps.allowHttpLoopback === true,
    });
    const r = record(
      await bounded(deps, (signal) => deps.rpc('resolve_document_access', args, signal)),
    );
    if (r.status === 'denied') {
      exact(r, ['status']);
      throw failure(403);
    }
    exact(r, CONTEXT_KEYS);
    if (
      r.status !== 'allowed' ||
      uuid(r.tenantId) !== args.p_tenant_id ||
      uuid(r.companyId) !== args.p_company_id ||
      uuid(r.documentId) !== args.p_document_id ||
      uuid(r.versionId) !== args.p_version_id
    )
      protocol();
    if (r.requestId !== null) uuid(r.requestId);
    const identity = Object.freeze({
      tenantId: uuid(r.tenantId),
      companyId: uuid(r.companyId),
      operationId: uuid(r.operationId),
      objectId: uuid(r.objectId),
      extension: r.extension as string,
    });
    if (
      typeof r.extension !== 'string' ||
      !Object.hasOwn(MIME, r.extension) ||
      r.mimeType !== MIME[r.extension] ||
      r.storageBucket !== 'tenant-documents' ||
      typeof r.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(r.sha256) ||
      typeof r.sizeBytes !== 'number' ||
      !Number.isInteger(r.sizeBytes) ||
      r.sizeBytes < 1 ||
      r.sizeBytes > 25 * 1024 * 1024
    )
      protocol();
    const path = buildDocumentUploadPath(identity);
    const hash = r.sha256;
    const contextDeadline = timestamp(r.expiresAt);
    const receivedAt = clock(deps);
    if (
      r.storagePath !== path ||
      contextDeadline <= receivedAt ||
      contextDeadline > receivedAt + ttl * 1000
    )
      protocol();
    const providerDeadline = Math.min(deadline, contextDeadline);
    const providerTtl = Math.floor((providerDeadline - receivedAt) / 1000);
    if (providerTtl < 1) protocol();
    const privateBearer = provider(
      await bounded(deps, (signal) => deps.sign('tenant-documents', path, providerTtl, signal)),
      path,
      providerDeadline,
      deps,
      providerPolicy,
    );
    const grantArgs = Object.freeze({
      ...args,
      p_expected_operation_id: identity.operationId,
      p_expected_sha256: hash,
      p_provider_expires_at: privateBearer.expiresAt,
    });
    const grant = record(
      await bounded(deps, (signal) =>
        deps.rpc('finalize_document_access_grant', grantArgs, signal),
      ),
    );
    if (grant.status === 'denied') {
      exact(grant, ['status']);
      throw failure(403);
    }
    exact(grant, ['status', 'auditId', 'expiresAt']);
    uuid(grant.auditId);
    if (
      grant.status !== 'granted' ||
      timestamp(grant.expiresAt) !== timestamp(privateBearer.expiresAt) ||
      timestamp(privateBearer.expiresAt) <= clock(deps)
    )
      protocol();
    return privateBearer;
  } catch (error) {
    if (error instanceof ApiError && internalErrors.has(error)) throw error;
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    throw failure(
      code === 'DU403'
        ? 403
        : code === 'DU409'
          ? 409
          : code === 'DU410'
            ? 410
            : code === 'DU422'
              ? 422
              : 503,
    );
  }
}

/** Trusted service-only seams; neither the provider origin nor client is public input. */
export function createDocumentAccessDependencies(options?: {
  client?: (signal: AbortSignal) => Promise<SupabaseClient>;
  apiBaseUrl?: string;
  allowHttpLoopback?: boolean;
}): DocumentAccessDependencies {
  const injectedClient = options?.client;
  async function client(signal: AbortSignal) {
    if (injectedClient) return injectedClient(signal);
    const { createSupabaseServiceRoleClient } = await import('../supabase/service-role');
    return createSupabaseServiceRoleClient({ signal });
  }
  return {
    now: Date.now,
    apiBaseUrl: options?.apiBaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    allowHttpLoopback: options?.allowHttpLoopback === true,
    rpc: async (name, args, signal) => {
      const result = await (await client(signal)).rpc(name, args);
      if (result.error) throw { code: result.error.code };
      return result.data;
    },
    sign: async (bucket, path, ttl, signal) => {
      const result = await (await client(signal)).storage.from(bucket).createSignedUrl(path, ttl);
      if (result.error) throw failure();
      return result;
    },
  };
}
