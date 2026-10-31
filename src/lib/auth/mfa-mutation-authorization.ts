import { ApiError } from '@/lib/errors';

type Dependencies = {
  loadAssurance(): Promise<{ currentLevel: string | null; nextLevel: string | null }>;
  listVerifiedFactorIds(): Promise<string[]>;
};

type MfaFactor = { id: string; status: string; factor_type?: string };

export function verifiedMfaFactorIds(factors: readonly MfaFactor[]): string[] {
  return factors.filter((factor) => factor.status === 'verified').map((factor) => factor.id);
}

function requiresMfa(role: string | null): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'pro';
}

export async function authorizeAccountMfaMutation(
  role: string | null,
  dependencies: Dependencies,
): Promise<void> {
  if (!requiresMfa(role)) return;

  let assurance: { currentLevel: string | null; nextLevel: string | null };
  let verifiedFactorIds: string[];
  try {
    [assurance, verifiedFactorIds] = await Promise.all([
      dependencies.loadAssurance(),
      dependencies.listVerifiedFactorIds(),
    ]);
  } catch {
    throw new ApiError('MFA_AUTHORIZATION_FAILED', 'Unable to authorize MFA change', 503);
  }

  if (
    (assurance.currentLevel !== 'aal1' && assurance.currentLevel !== 'aal2') ||
    (assurance.nextLevel !== 'aal1' && assurance.nextLevel !== 'aal2')
  ) {
    throw new ApiError('MFA_AUTHORIZATION_FAILED', 'Unable to authorize MFA change', 503);
  }

  const hasEstablishedMfa = verifiedFactorIds.length > 0 || assurance.nextLevel === 'aal2';
  if (hasEstablishedMfa && assurance.currentLevel !== 'aal2') {
    throw new ApiError('AAL2_REQUIRED', 'Complete MFA verification before changing factors', 403);
  }
}
