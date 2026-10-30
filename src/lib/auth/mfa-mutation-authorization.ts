import { ApiError } from '@/lib/errors';

type Dependencies = {
  loadCurrentLevel(): Promise<string | null>;
  listVerifiedFactorIds(): Promise<string[]>;
};

function requiresMfa(role: string | null): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'pro';
}

export async function authorizeAccountMfaMutation(
  role: string | null,
  dependencies: Dependencies,
): Promise<void> {
  if (!requiresMfa(role)) return;

  let currentLevel: string | null;
  let verifiedFactorIds: string[];
  try {
    [currentLevel, verifiedFactorIds] = await Promise.all([
      dependencies.loadCurrentLevel(),
      dependencies.listVerifiedFactorIds(),
    ]);
  } catch {
    throw new ApiError('MFA_AUTHORIZATION_FAILED', 'Unable to authorize MFA change', 503);
  }

  if (currentLevel !== 'aal1' && currentLevel !== 'aal2') {
    throw new ApiError('MFA_AUTHORIZATION_FAILED', 'Unable to authorize MFA change', 503);
  }

  if (verifiedFactorIds.length > 0 && currentLevel !== 'aal2') {
    throw new ApiError('AAL2_REQUIRED', 'Complete MFA verification before changing factors', 403);
  }
}
