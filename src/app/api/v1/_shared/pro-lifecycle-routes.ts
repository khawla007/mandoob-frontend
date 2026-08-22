import { z } from 'zod';

import type { SessionProfile } from '@/lib/auth/require-user';
import { ApiError, errorResponse } from '@/lib/errors';

export type LimitDecision = 'allowed' | 'limited' | 'unavailable';
export type LifecycleTarget = {
  proProfileId: string;
  credentialIds: string[];
  termIds?: string[];
  companyId?: string | null;
  tenantSlug?: string | null;
};

type LiveLifecycleProfile = {
  role: unknown;
  status: unknown;
  tenant_id: unknown;
};
type LiveLifecycleViewerDeps = {
  requireSession?: () => Promise<SessionProfile>;
  lookupProfile?: (actorId: string) => Promise<LiveLifecycleProfile | null>;
};

export async function requireLiveLifecycleViewer(
  deps: LiveLifecycleViewerDeps = {},
): Promise<SessionProfile> {
  const session = await (
    deps.requireSession ?? (async () => (await import('@/lib/auth/require-user')).requireUser())
  )();
  if (!z.string().uuid().safeParse(session.id).success) throw new Error('ACCESS_DENIED');
  const lookup =
    deps.lookupProfile ??
    (async (actorId: string) => {
      const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
      const { data, error } = await createSupabaseServiceRoleClient()
        .from('profiles')
        .select('role, status, tenant_id')
        .eq('id', actorId)
        .maybeSingle();
      if (error) throw new Error('ACCESS_DENIED');
      return data;
    });
  const profile = await lookup(session.id);
  if (
    !profile ||
    profile.status !== 'active' ||
    !['pro', 'admin', 'super_admin'].includes(String(profile.role))
  )
    throw new Error('ACCESS_DENIED');
  if (profile.role === 'admin' || profile.role === 'super_admin') {
    if (profile.tenant_id !== null) throw new Error('ACCESS_DENIED');
    return { ...session, role: profile.role, tenantId: null };
  }
  if (profile.tenant_id !== null && !z.string().uuid().safeParse(profile.tenant_id).success)
    throw new Error('ACCESS_DENIED');
  return {
    ...session,
    role: 'pro',
    tenantId: typeof profile.tenant_id === 'string' ? profile.tenant_id : null,
  };
}

export async function requireLiveProAccount(
  deps: LiveLifecycleViewerDeps = {},
): Promise<SessionProfile> {
  const session = await requireLiveLifecycleViewer(deps);
  if (session.role !== 'pro') throw new Error('ACCESS_DENIED');
  return session;
}

export function requireAal2Response(session: SessionProfile): Response | null {
  return session.aal === 'aal2'
    ? null
    : errorResponse('AAL2_REQUIRED', 'MFA challenge required', 403);
}

export function limitResponse(decision: LimitDecision): Response | null {
  if (decision === 'limited') {
    return errorResponse('RATE_LIMITED', 'Too many requests. Slow down.', 429);
  }
  if (decision === 'unavailable') {
    return errorResponse('SERVICE_UNAVAILABLE', 'Service temporarily unavailable', 503);
  }
  return null;
}

const SAFE_CODES = new Set([
  'NOT_FOUND',
  'STALE_CREDENTIAL_VERSION',
  'STALE_TERM_VERSION',
  'OPERATION_REUSED',
  'INVALID_CREDENTIAL_TRANSITION',
  'INVALID_TERM_TRANSITION',
  'CREDENTIAL_INCOMPLETE',
  'CREDENTIAL_IN_PROGRESS',
  'TERM_DATE_OVERLAP',
  'PRO_CREDENTIAL_EXPIRED',
  'DECISION_REASON_INVALID',
  'EVIDENCE_REMOVAL_IN_PROGRESS',
  'EVIDENCE_REMOVAL_LEASE_ACTIVE',
  'EVIDENCE_REMOVAL_CLAIM_LOST',
  'RECOVERY_RETRYABLE',
]);

export function lifecycleErrorResponse(error: unknown, label: string): Response {
  if (error instanceof ApiError && SAFE_CODES.has(error.code)) {
    return errorResponse(error.code, 'Unable to complete lifecycle operation', error.status);
  }
  console.error(`${label} unexpected`, { kind: 'operation_failed' });
  return errorResponse('INTERNAL', 'Unable to complete lifecycle operation', 500);
}

export function notFoundResponse(): Response {
  return errorResponse('NOT_FOUND', 'Resource not found', 404);
}

export async function resolveLifecycleTarget(
  actorId: string,
  proProfileId: string,
  includeTerms = false,
): Promise<LifecycleTarget | null> {
  try {
    const [{ readProCredentialSnapshot }, termsModule, { createSupabaseServiceRoleClient }] =
      await Promise.all([
        import('@/lib/data/pro-credentials'),
        includeTerms ? import('@/lib/data/pro-commercial-terms') : Promise.resolve(null),
        import('@/lib/supabase/service-role'),
      ]);
    const [credentials, terms] = await Promise.all([
      readProCredentialSnapshot(actorId, proProfileId),
      includeTerms && termsModule
        ? termsModule.readProCommercialTerms(actorId, proProfileId)
        : Promise.resolve([]),
    ]);
    const admin = createSupabaseServiceRoleClient();
    const { data: assignment, error: assignmentError } = await admin
      .from('pro_company_assignments')
      .select('company_id, tenant_id')
      .eq('pro_profile_id', proProfileId)
      .eq('status', 'active')
      .maybeSingle();
    if (assignmentError) return null;
    let tenantSlug: string | null = null;
    if (assignment?.tenant_id) {
      const { data: tenant, error: tenantError } = await admin
        .from('tenants')
        .select('slug')
        .eq('id', assignment.tenant_id)
        .maybeSingle();
      if (tenantError) return null;
      tenantSlug = typeof tenant?.slug === 'string' ? tenant.slug : null;
    }
    return {
      proProfileId,
      credentialIds: credentials.credentials.map((item) => item.credentialId),
      termIds: terms.map((item) => item.termId),
      companyId: typeof assignment?.company_id === 'string' ? assignment.company_id : null,
      tenantSlug,
    };
  } catch {
    return null;
  }
}

export async function revalidateLifecyclePaths(
  target: LifecycleTarget,
  userId?: string,
  providedRevalidate?: (path: string, type?: 'layout' | 'page') => void,
): Promise<void> {
  const revalidatePath = providedRevalidate ?? (await import('next/cache')).revalidatePath;
  for (const path of buildLifecycleRevalidationPaths(target, userId)) {
    if (target.tenantSlug && path === `/t/${target.tenantSlug}`) revalidatePath(path, 'layout');
    else revalidatePath(path);
  }
}

export function buildLifecycleRevalidationPaths(
  target: LifecycleTarget,
  userId?: string,
): string[] {
  return [
    '/admin/users',
    ...(userId ? [`/admin/users/${userId}`, `/admin/users/${userId}/edit`] : []),
    '/admin/companies',
    ...(target.companyId ? [`/admin/companies/${target.companyId}`] : []),
    '/account/role',
    ...(target.tenantSlug ? [`/t/${target.tenantSlug}`] : []),
  ];
}
