export type MfaEnrollmentFactor = {
  id: string;
  status: string;
  type: string;
};

type MfaEnrollmentDependencies = {
  listFactors: () => Promise<MfaEnrollmentFactor[]>;
  loadAssurance: () => Promise<{ currentLevel: string | null; nextLevel: string | null }>;
  removeFactor: (factorId: string) => Promise<void>;
};

export type MfaEnrollmentAuthorization =
  | 'allowed'
  | 'challenge_required'
  | 'already_enrolled'
  | 'failed';

export async function authorizeMfaEnrollment(
  dependencies: MfaEnrollmentDependencies,
): Promise<MfaEnrollmentAuthorization> {
  try {
    const [factors, assurance] = await Promise.all([
      dependencies.listFactors(),
      dependencies.loadAssurance(),
    ]);
    if (
      (assurance.currentLevel !== 'aal1' && assurance.currentLevel !== 'aal2') ||
      (assurance.nextLevel !== 'aal1' && assurance.nextLevel !== 'aal2')
    ) {
      return 'failed';
    }
    const hasVerifiedFactor = factors.some((factor) => factor.status === 'verified');
    if (hasVerifiedFactor || assurance.nextLevel === 'aal2') {
      return assurance.currentLevel === 'aal2' ? 'already_enrolled' : 'challenge_required';
    }
    for (const factor of factors) {
      if (factor.type === 'totp' && factor.status === 'unverified') {
        await dependencies.removeFactor(factor.id);
      }
    }
    return 'allowed';
  } catch {
    return 'failed';
  }
}
